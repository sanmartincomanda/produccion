import { db } from "./firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  buildSessionPreview,
  calculateInventorySnapshot,
  hydrateSalesAdjustments,
  hydrateZones,
  normalizeSku,
  normalizeText,
  roundMetric,
} from "./inventory-session.js";

const SICAR_CATALOG_URL =
  "https://pedidosinterno-3c65d-default-rtdb.firebaseio.com/configuracion/productos.json";

function ensureBranchId(branchId) {
  if (!branchId) {
    throw new Error("No hay sucursal seleccionada.");
  }
}

function pad(value, width = 4) {
  return String(value).padStart(width, "0");
}

function toIsoString(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function normalizeCatalogItem(item) {
  const sku = normalizeSku(item?.sku ?? item?.clave);
  const nombre = normalizeText(item?.nombre ?? item?.producto);

  if (!sku || !nombre) {
    return null;
  }

  return {
    ...item,
    sku,
    nombre,
    unidad: item?.unidad || "LB",
    activo: item?.activo ?? true,
  };
}

function sortCatalog(items = []) {
  return [...items].sort((left, right) => {
    const byName = String(left.nombre || "").localeCompare(String(right.nombre || ""), "es", {
      sensitivity: "base",
    });
    if (byName !== 0) return byName;
    return String(left.sku || "").localeCompare(String(right.sku || ""), "es", {
      sensitivity: "base",
    });
  });
}

async function fetchSicarCatalogFromPedidos() {
  const response = await fetch(SICAR_CATALOG_URL);

  if (!response.ok) {
    throw new Error(`No se pudo leer el catalogo SICAR remoto (${response.status}).`);
  }

  const payload = await response.json();
  const rawItems = Array.isArray(payload) ? payload : Object.values(payload || {});

  return sortCatalog(
    rawItems
      .map((item) =>
        normalizeCatalogItem({
          sku: item?.clave,
          nombre: item?.nombre,
          unidad: "LB",
          activo: true,
          source: "sicar",
        }),
      )
      .filter(Boolean),
  );
}

function mergeCatalogs(remoteItems, localItems) {
  const localMap = new Map(
    (localItems || [])
      .map((item) => normalizeCatalogItem(item))
      .filter(Boolean)
      .map((item) => [item.sku, item]),
  );

  return sortCatalog(
    remoteItems.map((remoteItem) => {
      const localItem = localMap.get(remoteItem.sku);
      return {
        ...localItem,
        ...remoteItem,
        unidad: localItem?.unidad || remoteItem.unidad || "LB",
        activo: localItem?.activo ?? remoteItem.activo ?? true,
      };
    }),
  );
}

async function getNextInventorySequence(branchId) {
  const counterRef = doc(db, "branches", branchId, "counters", "root");

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(counterRef);
    const data = snapshot.exists() ? snapshot.data() : {};
    const current = Number(data.inventario || 0);
    const next = current + 1;
    const nextData = {
      ...data,
      inventario: next,
      updatedAt: serverTimestamp(),
    };

    if (snapshot.exists()) {
      transaction.update(counterRef, nextData);
    } else {
      transaction.set(counterRef, nextData);
    }

    return next;
  });
}

function buildProductIndex(products = []) {
  return new Map((products || []).map((item) => [normalizeSku(item.sku), item]));
}

function buildSessionData(branchId, payload, existingData = {}) {
  const productIndex = buildProductIndex(payload.catalog || existingData.catalog || []);
  const zones = hydrateZones(payload.zones, payload.items);
  const salesAdjustments = hydrateSalesAdjustments(payload.salesAdjustments);
  const snapshot = calculateInventorySnapshot(zones, salesAdjustments, productIndex);

  return {
    tipo: "levantamiento_inventario",
    status: payload.status === "capturado" ? "capturado" : "en_espera",
    branchId,
    fecha: payload.fecha,
    proveedor: normalizeText(payload.proveedor),
    realizadoPor: normalizeText(payload.realizadoPor),
    firmaRealizadoPor: normalizeText(payload.firmaRealizadoPor || payload.realizadoPor),
    supervisadoPor: normalizeText(payload.supervisadoPor),
    firmaSupervisadoPor: normalizeText(payload.firmaSupervisadoPor || payload.supervisadoPor),
    observaciones: normalizeText(payload.observaciones),
    createdByEmail: normalizeText(payload.createdByEmail || existingData.createdByEmail),
    catalogSource: "sicar",
    zoneCount: snapshot.totals.zoneCount,
    itemCount: snapshot.totals.netProductCount,
    totalCajas: snapshot.totals.netBoxes,
    totalPesoLb: roundMetric(snapshot.totals.netWeight),
    grossItemCount: snapshot.totals.grossProductCount,
    grossTotalCajas: snapshot.totals.grossBoxes,
    grossTotalPesoLb: roundMetric(snapshot.totals.grossWeight),
    salesAdjustmentCount: snapshot.totals.salesProductCount,
    salesTotalCajas: snapshot.totals.salesBoxes,
    salesTotalPesoLb: roundMetric(snapshot.totals.salesWeight),
    warnings: snapshot.warnings,
    zones: snapshot.zones,
    zoneSummaries: snapshot.zoneSummaries.map((zone) => ({
      id: zone.id,
      name: zone.name,
      rowCount: zone.rowCount,
      totalCajas: zone.totalCajas,
      totalLb: zone.totalLb,
    })),
    salesAdjustments: snapshot.salesEntries,
    grossItems: snapshot.grossItems,
    items: snapshot.netItems,
  };
}

export async function readInventorySetup(branchId, options = {}) {
  ensureBranchId(branchId);

  const [catalogSnapshot, proveedoresSnapshot] = await Promise.all([
    getDoc(doc(db, "branches", branchId, "catalogs", "root")),
    getDocs(collection(db, "branches", branchId, "proveedores")),
  ]);

  const catalogData = catalogSnapshot.exists() ? catalogSnapshot.data() || {} : {};
  let skus = Array.isArray(catalogData.skus)
    ? catalogData.skus.map((item) => normalizeCatalogItem(item)).filter(Boolean)
    : [];

  const proveedores = proveedoresSnapshot.docs
    .map((item) => ({
      id: item.id,
      nombre: normalizeText(item.data()?.nombre),
    }))
    .filter((item) => item.nombre)
    .sort((left, right) => left.nombre.localeCompare(right.nombre, "es", { sensitivity: "base" }));

  const catalogMeta = {
    source: catalogData.source || (skus.length ? "firestore" : null),
    sicarSyncAt: toIsoString(catalogData.sicarSyncAt),
    updatedAt: toIsoString(catalogData.updatedAt),
    remoteFallback: false,
  };

  if (!skus.length && options.includeRemoteFallback) {
    skus = await fetchSicarCatalogFromPedidos();
    catalogMeta.source = "pedidos-internos";
    catalogMeta.remoteFallback = true;
  }

  return {
    skus: sortCatalog(skus),
    proveedores,
    catalogMeta,
  };
}

export async function syncSicarCatalogFromPedidos(branchId) {
  ensureBranchId(branchId);

  const [remoteCatalog, currentCatalogSnapshot] = await Promise.all([
    fetchSicarCatalogFromPedidos(),
    getDoc(doc(db, "branches", branchId, "catalogs", "root")),
  ]);

  const localItems = currentCatalogSnapshot.exists() ? currentCatalogSnapshot.data()?.skus || [] : [];
  const mergedCatalog = mergeCatalogs(remoteCatalog, localItems);

  await setDoc(
    doc(db, "branches", branchId, "catalogs", "root"),
    {
      skus: mergedCatalog,
      source: "pedidos-internos",
      sourceLabel: "Catalogo SICAR desde app-pedidos-internos",
      remoteCatalogUrl: SICAR_CATALOG_URL,
      sicarSyncAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    count: mergedCatalog.length,
    skus: mergedCatalog,
    syncedAt: new Date().toISOString(),
  };
}

export async function saveInventorySession(branchId, payload) {
  ensureBranchId(branchId);

  const sessionId = normalizeText(payload.id);
  const collectionRef = collection(db, "branches", branchId, "levantamientosInventario");
  const docRef = sessionId ? doc(collectionRef, sessionId) : null;
  const existingSnapshot = docRef ? await getDoc(docRef) : null;
  const existingData = existingSnapshot?.exists() ? existingSnapshot.data() || {} : {};

  let seq = Number(payload.seq || existingData.seq || 0) || null;
  let folio = normalizeText(payload.folio || existingData.folio);
  const status = payload.status === "capturado" ? "capturado" : "en_espera";

  if (status === "capturado" && !seq) {
    seq = await getNextInventorySequence(branchId);
    folio = `INV${pad(seq)}`;
  }

  const sessionData = {
    ...buildSessionData(branchId, payload, existingData),
    seq,
    folio: folio || null,
    timestamp: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (status === "capturado") {
    sessionData.finalizedAt = serverTimestamp();
  }

  let reference = docRef;
  if (!reference) {
    reference = await addDoc(collectionRef, {
      ...sessionData,
      createdAt: serverTimestamp(),
    });
  } else {
    await setDoc(
      reference,
      {
        ...sessionData,
        createdAt: existingData.createdAt || serverTimestamp(),
      },
      { merge: true },
    );
  }

  return {
    id: reference.id,
    ...buildSessionPreview({
      sessionId: reference.id,
      branchId,
      folio,
      status,
      fecha: payload.fecha,
      proveedor: payload.proveedor,
      realizadoPor: payload.realizadoPor,
      firmaRealizadoPor: payload.firmaRealizadoPor,
      supervisadoPor: payload.supervisadoPor,
      firmaSupervisadoPor: payload.firmaSupervisadoPor,
      observaciones: payload.observaciones,
      zones: payload.zones,
      salesAdjustments: payload.salesAdjustments,
      createdByEmail: payload.createdByEmail,
      productIndex: buildProductIndex(payload.catalog),
      timestamp: new Date().toISOString(),
    }),
    seq,
  };
}

export function subscribeInventorySessions(branchId, onData, onError) {
  ensureBranchId(branchId);

  const inventoryQuery = query(
    collection(db, "branches", branchId, "levantamientosInventario"),
    orderBy("timestamp", "desc"),
    limit(60),
  );

  return onSnapshot(
    inventoryQuery,
    (snapshot) => {
      const sessions = snapshot.docs.map((item) => {
        const data = item.data() || {};
        return {
          id: item.id,
          ...data,
          timestamp: toIsoString(data.timestamp),
          updatedAt: toIsoString(data.updatedAt),
          createdAt: toIsoString(data.createdAt),
          finalizedAt: toIsoString(data.finalizedAt),
          sicarSyncAt: toIsoString(data.sicarSyncAt),
        };
      });

      onData(sessions);
    },
    (error) => {
      onError?.(error);
    },
  );
}

export function summarizeInventorySession(session) {
  const snapshot = calculateInventorySnapshot(session?.zones, session?.salesAdjustments);

  return {
    totalItems: snapshot.totals.netProductCount,
    totalCajas: snapshot.totals.netBoxes,
    totalPesoLb: snapshot.totals.netWeight,
    grossItems: snapshot.totals.grossProductCount,
    grossCajas: snapshot.totals.grossBoxes,
    grossPesoLb: snapshot.totals.grossWeight,
    salesItems: snapshot.totals.salesProductCount,
    salesCajas: snapshot.totals.salesBoxes,
    salesPesoLb: snapshot.totals.salesWeight,
    zoneCount: snapshot.totals.zoneCount,
    warnings: snapshot.warnings,
  };
}

export async function uploadInventorySessionToSicar({ branchId, sessionId, idToken, dryRun = false }) {
  ensureBranchId(branchId);

  const response = await fetch("/.netlify/functions/sicar-inventory-adjustment", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      branchId,
      sessionId,
      dryRun,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || payload?.message || "No fue posible subir el levantamiento a SICAR.");
  }

  return payload;
}
