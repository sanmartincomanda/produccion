// src/data-api.js
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, getDocs, query, where, orderBy, limit,
  onSnapshot, runTransaction, serverTimestamp, writeBatch 
} from "firebase/firestore";

/* ========================= Helpers internos ========================= */

const ensureBranchId = (branchId) => {
  if (!branchId) throw new Error("Sin sucursal (branchId) especificada.");
};

// pad local para folios (independiente de utils)
const pad = (n, w = 4) => String(n).padStart(w, "0");

// ✅ CORRECCIÓN CLAVE: Helper para convertir objeto Date a YYYY-MM-DD string
function dateToISODateString(d) {
    if (!d || !(d instanceof Date)) return null;
    const y = d.getFullYear();
    // getMonth() es 0-indexado, por eso se suma 1
    const m = String(d.getMonth() + 1).padStart(2, "0"); 
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}


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

// Carga inicial para Catalogos
export async function readCatalogs(branchId) {
  ensureBranchId(branchId);
  const [skusSnap, provSnap, destSnap] = await Promise.all([
    getDoc(doc(db, "branches", branchId, "catalogs", "root")),
    getDocs(collection(db, "branches", branchId, "proveedores")),
    getDocs(collection(db, "branches", branchId, "destinos")),
  ]);

  const skus = skusSnap.exists() ? (skusSnap.data()?.skus || []) : [];
  const proveedores = provSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const destinos = destSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  return { skus, proveedores, destinos };
}

// Escucha en tiempo real para Catalogos (usado en Catalogos.jsx)
export function subscribeCatalogs(branchId, onData, onError) {
  ensureBranchId(branchId);
  
  // Estado para guardar datos parciales
  const state = {
    skus: null,
    proveedores: null,
    destinos: null,
  };

  const emitIfReady = () => {
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

  return () => unsubs.forEach(unsub => unsub());
}

// ✅ RE-AÑIDO: Agregar Proveedor
export async function addProveedor(branchId, nombre) {
    ensureBranchId(branchId);
    if (!nombre) throw new Error("El nombre del proveedor es requerido.");
    await addDoc(collection(db, "branches", branchId, "proveedores"), {
        nombre: nombre,
        createdAt: serverTimestamp(),
    });
}

// ✅ RE-AÑIDO: Agregar Destino
export async function addDestino(branchId, nombre) {
    ensureBranchId(branchId);
    if (!nombre) throw new Error("El nombre del destino es requerido.");
    await addDoc(collection(db, "branches", branchId, "destinos"), {
        nombre: nombre,
        createdAt: serverTimestamp(),
    });
}

// ✅ RE-AÑIDO: Guardar (Upsert) el catálogo de SKUs completo
export async function upsertCatalogs(branchId, skus) {
    ensureBranchId(branchId);
    const catalogsRef = doc(db, "branches", branchId, "catalogs", "root");
    await setDoc(catalogsRef, { skus: skus, updatedAt: serverTimestamp() }, { merge: true });
}

/* ========================= Entradas y Salidas ========================= */

// Registrar una nueva Entrada
export async function registrarEntrada(branchId, data) {
  ensureBranchId(branchId);
  const tipo = "entrada";
  const seq = await getNextConsec(branchId, tipo);
  const folio = `${tipo.charAt(0).toUpperCase()}${pad(seq)}`;

  const entryData = {
    ...data,
    branchId: branchId,
    // Asegura que 'fecha' se guarda como string "YYYY-MM-DD" para filtrado de reportes
    fecha: data.fecha || new Date().toISOString().split('T')[0],
    folio: folio,
    seq: seq,
    timestamp: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, "branches", branchId, "entradas"), entryData);
  
  // Devolver el folio y el ID del documento
  return { id: docRef.id, ...entryData };
}

// Registrar una nueva Salida
export async function registrarSalida(branchId, data) {
  ensureBranchId(branchId);
  const tipo = "salida";
  const seq = await getNextConsec(branchId, tipo);
  const folio = `${tipo.charAt(0).toUpperCase()}${pad(seq)}`;

  // La lógica de traspaso está aquí
  const isTraspaso = data.tipoSalida === "traspaso" && !!data.branchIdDestino;
  const status = isTraspaso ? "pendiente_aprobacion" : "completada";

  const salidaData = {
    ...data,
    branchIdOrigen: branchId,
    // Asegura que 'fecha' se guarda como string "YYYY-MM-DD" para filtrado de reportes
    fecha: data.fecha || new Date().toISOString().split('T')[0],
    folio: folio,
    seq: seq,
    status: status, // Añadido para traspasos
    timestamp: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, "branches", branchId, "salidas"), salidaData);

  // Si es traspaso, crear un registro duplicado en el destino
  if (isTraspaso) {
    const destinoSalidaData = {
      ...salidaData,
      branchId: data.branchIdDestino, // El documento en el destino
      tipo: "traspaso_entrada_pendiente",
      // Mantener status: 'pendiente_aprobacion'
      // No generar nuevo folio/seq en el destino
    };
    // 🚨 El documento de traspaso pendiente se guarda en la colección de 'salidas' del destino
    await addDoc(collection(db, "branches", data.branchIdDestino, "salidas"), destinoSalidaData);
  }
  
  // Devolver el folio y el ID del documento
  return { id: docRef.id, ...salidaData };
}

/* ========================= APROBACIÓN DE SALIDAS (TRASPASOS) ========================= */

/**
 * Se suscribe a los traspasos pendientes de aprobar donde la sucursal actual es el destino.
 */
export function subscribeToPendingSalidas(branchId, onData, onError) {
    ensureBranchId(branchId);
    // Buscamos documentos en la colección 'salidas' de la sucursal actual (el destino)
    const q = query(
        collection(db, "branches", branchId, "salidas"),
        where("status", "==", "pendiente_aprobacion"),
        orderBy("timestamp", "asc")
    );

    return onSnapshot(q, (snap) => {
        const salidas = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            // Asegurar que el timestamp se pueda formatear si es necesario
            timestamp: d.data().timestamp ? d.data().timestamp.toDate().toISOString() : null,
        }));
        try {
            onData(salidas);
        } catch (e) {
            onError?.(e);
        }
    }, (err) => {
        console.error("Error subscribing to pending salidas:", err);
        onError?.(err);
    });
}

/**
 * Aprueba una salida pendiente y la registra como Entrada finalizada.
 */
export async function aprobarSalida(branchId, salidaId, recibidoPor) {
    ensureBranchId(branchId);

    const batch = writeBatch(db);

    // 1. Marcar el documento de 'salida' en la sucursal Destino como 'aprobada'
    const salidaRef = doc(db, "branches", branchId, "salidas", salidaId);
    batch.update(salidaRef, {
        status: "aprobada",
        recibidoPor: recibidoPor,
        aprobadoEn: serverTimestamp(),
    });

    // 2. Crear un documento de 'entrada' a partir de la salida aprobada
    const salidaSnap = await getDoc(salidaRef);
    if (!salidaSnap.exists()) {
        throw new Error("El documento de salida a aprobar no existe.");
    }
    const salidaData = salidaSnap.data();

    // Obtener el siguiente consecutivo de entrada para el folio
    const seq = await getNextConsec(branchId, "entrada");
    const folio = `E${pad(seq)}`;

    const entradaData = {
        branchId: branchId,
        proveedor: salidaData.branchNameOrigen || `Traspaso desde ${salidaData.branchIdOrigen}`,
        recibidoPor: recibidoPor,
        fecha: salidaData.fecha || new Date().toISOString().split('T')[0],
        obs: `Traspaso Aprobado (Folio Salida: ${salidaData.folio || 'N/D'})` + (salidaData.obs ? `. Obs. Origen: ${salidaData.obs}` : ''),
        // Aseguramos que 'items' sea un array (vacío si no existe)
        items: salidaData.items || [], 
        folio: folio,
        seq: seq,
        timestamp: serverTimestamp(),
    };
    
    // Usar la misma lógica de registro que registrarEntrada, pero en el batch
    const entradaRef = doc(collection(db, "branches", branchId, "entradas"));
    batch.set(entradaRef, entradaData);

    await batch.commit();
}


/* ========================= Lectura de Movimientos (Reportes) ========================= */

// Ejemplo de setUserBranch para asegurar que se incluye
export async function setUserBranch(userId, branchId) {
    if (!userId || !branchId) throw new Error("ID de usuario y sucursal son requeridos.");
    await setDoc(doc(db, "users", userId), { branchId }, { merge: true });
}


// Lectura de movimientos para Reportes (simplificado)
function listenMovimientos(branchId, tipo, startDate, endDate, onData, onError) {
    ensureBranchId(branchId);

    // ✅ CORRECCIÓN CLAVE: Convertir los Date objects a strings ISO (YYYY-MM-DD)
    // para que la consulta en Firestore funcione.
    let isoStartDate = startDate ? dateToISODateString(startDate) : null;
    let isoEndDate = endDate ? dateToISODateString(endDate) : null; 
    
    // Si Reportes.jsx está pasando el inicio del día siguiente para 'endDate',
    // usar el operador '<' es correcto para incluir todo el día de fin.

    let q = query(
        collection(db, "branches", branchId, tipo === 'entrada' ? 'entradas' : 'salidas'),
        // Es crucial ordenar por 'fecha' cuando se usan filtros de rango en ese campo
        orderBy("fecha", "desc") 
    );

    if (isoStartDate) {
        q = query(q, where("fecha", ">=", isoStartDate)); // Compara string con string
    }
    // Usamos el operador '<' con el string de la fecha del día siguiente.
    if (isoEndDate) {
        q = query(q, where("fecha", "<", isoEndDate)); // ✅ CORREGIDO: Usar '<' en lugar de '<='
    }
    
    return onSnapshot(q, (snap) => {
        const movimientos = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
        }));
        try {
            onData(movimientos);
        } catch (e) {
            onError?.(e);
        }
    }, (err) => {
        console.error(`Error subscribing to ${tipo}:`, err);
        onError?.(err);
    });
}

export function listenEntradas(branchId, startDate, endDate, onData, onError) {
    return listenMovimientos(branchId, 'entrada', startDate, endDate, onData, onError);
}

export function listenSalidas(branchId, startDate, endDate, onData, onError) {
    return listenMovimientos(branchId, 'salida', startDate, endDate, onData, onError);
}