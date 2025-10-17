// src/data-api.js
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, getDocs, query, where, orderBy, limit,
  onSnapshot, runTransaction, serverTimestamp
} from "firebase/firestore";

/* ========================= Helpers internos ========================= */

const ensureBranchId = (branchId) => {
  if (!branchId) throw new Error("Sin sucursal (branchId) especificada.");
};

// pad local para folios (independiente de utils)
const pad = (n, w = 4) => String(n).padStart(w, "0");

// obtiene/crea doc raíz de contadores: branches/{branchId}/counters/root
async function getNextConsec(branchId, tipo /* 'entrada' | 'salida' */) {
  ensureBranchId(branchId);
  const cntRef = doc(db, "branches", branchId, "counters", "root");
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(cntRef);
    const data = snap.exists() ? snap.data() : { entrada: 0, salida: 0 };
    const current = Number(data[tipo] || 0);
    const next = current + 1;
    const newData = { ...data, [tipo]: next, updatedAt: serverTimestamp() };
    if (snap.exists()) tx.update(cntRef, newData);
    else tx.set(cntRef, newData);
    return next;
  });
  return seq;
}

/* ========================= Catálogos ========================= */

// Lee SKUs del doc catalogs/root y proveedores/destinos de subcolecciones
export async function readCatalogs(branchId) {
  ensureBranchId(branchId);

  // SKUs
  const rootRef = doc(db, "branches", branchId, "catalogs", "root");
  const rootSnap = await getDoc(rootRef);
  const { skus = [] } = rootSnap.exists() ? (rootSnap.data() || {}) : { skus: [] };

  // Proveedores
  const provCol = collection(db, "branches", branchId, "proveedores");
  const provSnap = await getDocs(provCol);
  const proveedores = provSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Destinos
  const destCol = collection(db, "branches", branchId, "destinos");
  const destSnap = await getDocs(destCol);
  const destinos = destSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  return { skus, proveedores, destinos };
}

// Inserta o actualiza el documento de SKUs (merge) en catalogs/root
// data: { skus: Array<{ sku, nombre, unidad, activo? }> }
export async function upsertCatalogs(branchId, data) {
  ensureBranchId(branchId);
  const rootRef = doc(db, "branches", branchId, "catalogs", "root");
  await setDoc(rootRef, { ...(data || {}), updatedAt: serverTimestamp() }, { merge: true });
}

// Agregar proveedor sin duplicar por nombre (case-insensitive)
export async function addProveedor(branchId, nombre) {
  ensureBranchId(branchId);
  const clean = String(nombre || "").trim();
  if (!clean) throw new Error("Nombre de proveedor vacío.");

  const colRef = collection(db, "branches", branchId, "proveedores");
  const qy = query(colRef, where("nombreLower", "==", clean.toLowerCase()));
  const ex = await getDocs(qy);
  if (!ex.empty) return ex.docs[0].id; // ya existe

  const docRef = await addDoc(colRef, {
    nombre: clean,
    nombreLower: clean.toLowerCase(),
    createdAt: serverTimestamp()
  });
  return docRef.id;
}

// Agregar destino sin duplicar por nombre (case-insensitive)
export async function addDestino(branchId, nombre) {
  ensureBranchId(branchId);
  const clean = String(nombre || "").trim();
  if (!clean) throw new Error("Nombre de destino vacío.");

  const colRef = collection(db, "branches", branchId, "destinos");
  const qy = query(colRef, where("nombreLower", "==", clean.toLowerCase()));
  const ex = await getDocs(qy);
  if (!ex.empty) return ex.docs[0].id; // ya existe

  const docRef = await addDoc(colRef, {
    nombre: clean,
    nombreLower: clean.toLowerCase(),
    createdAt: serverTimestamp()
  });
  return docRef.id;
}

/* ========================= Entradas / Salidas ========================= */

// payloadEntrada: { num?, fecha, proveedor, recibidoPor, obs, items:[{sku, cantidad, pesos:number[]}] }
export async function registrarEntrada(branchId, payloadEntrada) {
  ensureBranchId(branchId);

  // Generar folio si no viene
  let num = payloadEntrada?.num;
  if (!num) {
    const seq = await getNextConsec(branchId, "entrada");
    num = `E-${pad(seq)}`;
  }

  const colRef = collection(db, "branches", branchId, "entradas");
  const docRef = await addDoc(colRef, {
    ...payloadEntrada,
    num,
    tipo: "entrada",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { id: docRef.id, num };
}

// payloadSalida: { num?, fecha, destino, entregadoPor, obs, items:[{sku, cantidad, pesos:number[]}] }
export async function registrarSalida(branchId, payloadSalida) {
  ensureBranchId(branchId);

  // Generar folio si no viene
  let num = payloadSalida?.num;
  if (!num) {
    const seq = await getNextConsec(branchId, "salida");
    num = `S-${pad(seq)}`;
  }

  const colRef = collection(db, "branches", branchId, "salidas");
  const docRef = await addDoc(colRef, {
    ...payloadSalida,
    num,
    tipo: "salida",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { id: docRef.id, num };
}

// Listados simples (últimos N)
export function listenEntradas(branchId, opts = {}, onData, onError) {
  try {
    const col = collection(db, "branches", branchId, "entradas");

    let q = query(col, orderBy("createdAt", "desc"));

    // si se usa rango, pero tus fechas son strings ISO:
    if (opts.fromISO && opts.toISO && opts.usarRango) {
      q = query(
        col,
        where("fecha", ">=", opts.fromISO),
        where("fecha", "<=", opts.toISO),
        orderBy("fecha", "desc")
      );
    }

    return onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onData && onData(docs);
      },
      (err) => onError && onError(err)
    );
  } catch (err) {
    console.error("listenEntradas error:", err);
    onError && onError(err);
  }
}

// 🔹 Escucha salidas (suscripción en tiempo real)
export function listenSalidas(branchId, opts = {}, onData, onError) {
  try {
    const col = collection(db, "branches", branchId, "salidas");

    let q = query(col, orderBy("createdAt", "desc"));

    if (opts.fromISO && opts.toISO && opts.usarRango) {
      q = query(
        col,
        where("fecha", ">=", opts.fromISO),
        where("fecha", "<=", opts.toISO),
        orderBy("fecha", "desc")
      );
    }

    return onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onData && onData(docs);
      },
      (err) => onError && onError(err)
    );
  } catch (err) {
    console.error("listenSalidas error:", err);
    onError && onError(err);
  }
}
/* ========================= Sucursal (Branch) ========================= */

// Guarda la sucursal elegida en el perfil del usuario
export async function setUserBranch(uid, branchId) {
  if (!uid) throw new Error("Falta UID.");
  ensureBranchId(branchId);
  const userRef = doc(db, "users", uid);
  await setDoc(userRef, { branchId, updatedAt: serverTimestamp() }, { merge: true });
  return branchId;
}

// Lee branchId del perfil del usuario
export async function readUserProfileBranch(uid) {
  if (!uid) return null;
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  return snap.exists() ? (snap.data()?.branchId || null) : null;
}

/**
 * Suscribe a cambios de catálogos (skus, proveedores, destinos).
 * onData: ({ skus, proveedores, destinos }) => void
 * onError: (err) => void
 * Devuelve la función unsubscribe global para todos los listeners.
 */
export function subscribeBranch(branchId, onData, onError) {
  if (!branchId) throw new Error("Sin branchId");

  const state = {
    skus: null,           // null = aún no cargado
    proveedores: null,
    destinos: null,
  };

  const emitIfReady = () => {
    // Emite “parcial” lo que esté disponible, pero nunca vacía lo que ya había.
    const merged = {};
    if (state.skus !== null) merged.skus = state.skus;
    if (state.proveedores !== null) merged.proveedores = state.proveedores;
    if (state.destinos !== null) merged.destinos = state.destinos;
    if (Object.keys(merged).length > 0) {
      try { onData(merged); } catch (e) { onError?.(e); }
    }
  };

  const unsubs = [];

  // SKUs (doc único)
  unsubs.push(
    onSnapshot(
      doc(db, "branches", branchId, "catalogs", "root"),
      (snap) => {
        const data = snap.exists() ? (snap.data() || {}) : {};
        state.skus = Array.isArray(data.skus) ? data.skus : [];
        emitIfReady();
      },
      (err) => onError?.(err)
    )
  );

  // Proveedores
  unsubs.push(
    onSnapshot(
      collection(db, "branches", branchId, "proveedores"),
      (snap) => {
        state.proveedores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        emitIfReady();
      },
      (err) => onError?.(err)
    )
  );

  // Destinos
  unsubs.push(
    onSnapshot(
      collection(db, "branches", branchId, "destinos"),
      (snap) => {
        state.destinos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        emitIfReady();
      },
      (err) => onError?.(err)
    )
  );

  return () => { unsubs.forEach(u => { try { u(); } catch {} }); };
}
