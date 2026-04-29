const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
    body: JSON.stringify(payload),
  };
}

function loadServiceAccount() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const parsed = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Faltan credenciales de Firebase Admin. Configura FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL y FIREBASE_ADMIN_PRIVATE_KEY.",
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

function ensureAdminApp() {
  if (!getApps().length) {
    initializeApp({
      credential: cert(loadServiceAccount()),
    });
  }

  return getApps()[0];
}

function getAdminDb() {
  ensureAdminApp();
  return getFirestore();
}

function getAdminAuth() {
  ensureAdminApp();
  return getAuth();
}

function sumWeights(weights) {
  return (weights || []).reduce((total, weight) => total + Number(weight || 0), 0);
}

function buildSicarPayload(branchId, sessionId, session) {
  const items = Array.isArray(session.items) ? session.items : [];
  const lines = items.map((item, index) => {
    const weights = Array.isArray(item.pesos) ? item.pesos.map((value) => Number(value || 0)) : [];
    return {
      line: index + 1,
      sku: String(item.sku || "").trim(),
      description: String(item.nombre || "").trim(),
      unit: item.unidad || "LB",
      quantity: Number(item.totalLb || sumWeights(weights)),
      boxes: Number(item.cajas || weights.length || 0),
      weights,
    };
  });

  const totalBoxes = lines.reduce((total, line) => total + Number(line.boxes || 0), 0);
  const totalWeightLb = lines.reduce((total, line) => total + Number(line.quantity || 0), 0);

  return {
    integration: "inventario-sanmartin",
    adjustmentType: "inventory-count",
    branchId,
    sessionId,
    folio: session.folio || "",
    countedDate: session.fecha || "",
    supplier: session.proveedor || "",
    performedBy: session.realizadoPor || "",
    performedSignature: session.firmaRealizadoPor || "",
    supervisedBy: session.supervisadoPor || "",
    supervisedSignature: session.firmaSupervisadoPor || "",
    notes: session.observaciones || "",
    totalLines: lines.length,
    totalBoxes,
    totalWeightLb,
    lines,
  };
}

function buildTriggerPayload({ branchId, sessionId, session, actor, dryRun }) {
  const adjustment = buildSicarPayload(branchId, sessionId, session);

  return {
    triggerEvent: "inventory.adjustment.requested",
    sourceApp: "inventario-sanmartin",
    action: "create_inventory_adjustment",
    branchId,
    sessionId,
    folio: session.folio || "",
    requestedAt: new Date().toISOString(),
    requestedBy: {
      type: actor.type,
      uid: actor.uid || null,
      email: actor.email || "",
      label: actor.label,
    },
    dryRun,
    adjustment,
  };
}

function parseJsonBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error("El body no contiene JSON valido.");
  }
}

async function callSicarApi(payload) {
  const endpoint = process.env.SICAR_TRIGGER_URL || process.env.SICAR_API_URL;
  if (!endpoint) {
    return {
      skipped: true,
      reason: "SICAR_TRIGGER_URL o SICAR_API_URL no estan configurados todavia.",
    };
  }

  const headers = {
    "content-type": "application/json",
    "x-trigger-source": "inventario-sanmartin",
    "x-trigger-event": "inventory.adjustment.requested",
  };

  const triggerToken = process.env.SICAR_TRIGGER_TOKEN || process.env.SICAR_API_TOKEN;
  if (triggerToken) {
    headers.authorization = `Bearer ${triggerToken}`;
  }

  const response = await fetch(endpoint, {
    method: process.env.SICAR_TRIGGER_METHOD || process.env.SICAR_API_METHOD || "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let parsedBody = null;

  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch (error) {
    parsedBody = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsedBody,
    endpoint,
  };
}

async function resolveActor(event, branchId) {
  const internalToken = process.env.INTERNAL_API_TOKEN;
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!bearerToken) {
    throw new Error("No se envio token de acceso.");
  }

  if (internalToken && bearerToken === internalToken) {
    return {
      type: "internal",
      label: "internal-token",
    };
  }

  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(bearerToken);
  const db = getAdminDb();
  const userSnapshot = await db.doc(`users/${decoded.uid}`).get();

  if (!userSnapshot.exists) {
    throw new Error("El usuario autenticado no existe en Firebase.");
  }

  const userBranchId = String(userSnapshot.data()?.branchId || "").trim();
  if (branchId && userBranchId && userBranchId !== branchId) {
    throw new Error("El usuario no tiene acceso a esta sucursal.");
  }

  return {
    type: "firebase-user",
    uid: decoded.uid,
    email: decoded.email || "",
    branchId: userBranchId,
    label: decoded.email || decoded.uid,
  };
}

// Legacy helper: the inventory app now writes SICAR triggers directly to Firestore.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Metodo no permitido." });
  }

  try {
    const body = parseJsonBody(event.body);
    const branchId = String(body.branchId || "").trim();
    const sessionId = String(body.sessionId || "").trim();
    const dryRun = Boolean(body.dryRun);

    if (!branchId || !sessionId) {
      return jsonResponse(400, {
        ok: false,
        error: "Debes enviar branchId y sessionId.",
      });
    }

    const actor = await resolveActor(event, branchId);
    const db = getAdminDb();
    const sessionRef = db.doc(`branches/${branchId}/levantamientosInventario/${sessionId}`);
    const snapshot = await sessionRef.get();

    if (!snapshot.exists) {
      return jsonResponse(404, {
        ok: false,
        error: "No existe el levantamiento solicitado.",
      });
    }

    const session = snapshot.data() || {};
    if (session.status !== "capturado") {
      return jsonResponse(409, {
        ok: false,
        error: "Solo se pueden subir a SICAR levantamientos finalizados.",
      });
    }

    const payload = buildTriggerPayload({
      branchId,
      sessionId,
      session,
      actor,
      dryRun,
    });

    await sessionRef.set(
      {
        integrations: {
          sicar: {
            lastPreparedAt: FieldValue.serverTimestamp(),
            lastPreparedBy: actor.label,
            lastTriggerEvent: payload.triggerEvent,
            lastPayloadPreview: {
              folio: payload.folio,
              totalLines: payload.adjustment.totalLines,
              totalBoxes: payload.adjustment.totalBoxes,
              totalWeightLb: payload.adjustment.totalWeightLb,
            },
          },
        },
      },
      { merge: true },
    );

    if (dryRun) {
      return jsonResponse(200, {
        ok: true,
        mode: "dry-run",
        message: "Trigger generado correctamente. No se envio al integrador SICAR.",
        payload,
      });
    }

    const upstream = await callSicarApi(payload);

    if (upstream.skipped) {
      await sessionRef.set(
        {
          integrations: {
            sicar: {
              status: "pending-config",
              lastAttemptAt: FieldValue.serverTimestamp(),
              lastAttemptBy: actor.label,
              lastMessage: upstream.reason,
              lastTriggerTarget: null,
            },
          },
        },
        { merge: true },
      );

      return jsonResponse(200, {
        ok: true,
        mode: "pending-config",
        message: upstream.reason,
        payload,
      });
    }

    if (!upstream.ok) {
      await sessionRef.set(
        {
          integrations: {
            sicar: {
              status: "error",
              lastAttemptAt: FieldValue.serverTimestamp(),
              lastAttemptBy: actor.label,
              lastTriggerTarget: upstream.endpoint,
              lastHttpStatus: upstream.status,
              lastError: upstream.body,
            },
          },
        },
        { merge: true },
      );

      return jsonResponse(502, {
        ok: false,
        error: "SICAR respondio con error.",
        upstream,
      });
    }

    const accepted =
      upstream.status === 202 ||
      upstream.body?.accepted === true ||
      upstream.body?.queued === true ||
      upstream.body?.triggered === true;
    const jobId =
      upstream.body?.jobId ||
      upstream.body?.triggerId ||
      upstream.body?.queueId ||
      null;
    const integrationStatus = accepted ? "triggered" : "uploaded";

    await sessionRef.set(
      {
        integrations: {
          sicar: {
            status: integrationStatus,
            uploadedAt: FieldValue.serverTimestamp(),
            uploadedBy: actor.label,
            lastTriggerTarget: upstream.endpoint,
            lastHttpStatus: upstream.status,
            lastResponse: upstream.body,
            jobId,
          },
        },
      },
      { merge: true },
    );

    return jsonResponse(200, {
      ok: true,
      mode: integrationStatus,
      message: accepted
        ? "Trigger enviado al integrador SICAR correctamente."
        : "Levantamiento enviado al endpoint SICAR correctamente.",
      jobId,
      upstream,
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: error.message || "Error interno inesperado.",
    });
  }
};
