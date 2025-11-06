// src/Entradas.jsx
import React, { useEffect, useState } from "react";
// Se asume que 'pad' y otras utilidades siguen en utils.js
import { pad } from "./utils.js"; 

// ✅ Se garantiza que todos los imports necesarios están aquí
import { registrarEntrada, readCatalogs, subscribeToPendingSalidas, aprobarSalida } from "./data-api.js"; 
import BuscarSKU from "./components/BuscarSKU.jsx";
import PesoBoxes from "./components/PesoBoxes.jsx";
import { extractSanMartinWeight, extractBasculaWeight } from "./utils.js";
import AprobacionModal from "./components/AprobacionModal.jsx"; 


/* === Función de utilidad para la fecha de hoy (YYYY-MM-DD) === */
// Definimos nowISO aquí para asegurar que funcione la fecha predeterminada.
function nowISO() {
  const d = new Date();
  // Ajusta a la zona horaria local para evitar problemas con UTC y la fecha del input
  const localIsoString = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString();
  return localIsoString.split('T')[0]; // YYYY-MM-DD
}
/* ========================================================== */


/* ==================================================================== */
/* ====== Componente de Lector de Códigos y Entrada Manual (ScanCodigosRow) ====== */
/* ==================================================================== */
function ScanCodigosRow({ onAdd }) {
  const [sm, setSM] = React.useState("");
  const [bs, setBS] = React.useState("");
  const [manualWeight, setManualWeight] = React.useState(""); // 👈 NUEVO: Estado para peso manual
  const [msg, setMsg] = React.useState(null);

  const add = (w) => {
    const n = Number(w);
    if (!isFinite(n) || n <= 0) {
      setMsg({ t: "err", m: "Peso inválido." });
      return;
    }
    // ✅ Se pasa el peso tal cual (en Libras/LB)
    onAdd(n);
    setSM(""); // Limpiar después de éxito
    setBS(""); // Limpiar después de éxito
    setManualWeight(""); // 👈 NUEVO: Limpiar después de éxito
    setMsg({ t: "ok", m: `Caja agregada: ${n.toFixed(2)} LB` });
  };

  const trySM = () => {
    const cleanSM = sm.replace(/\D/g, "");
    const r = extractSanMartinWeight(cleanSM); // Usa la cadena limpia aquí
    if (!r.ok) return setMsg({ t: "err", m: r.error });
    add(r.weight);
  };

  const tryBS = () => {
    const cleanBS = bs.replace(/\D/g, "");
    const r = extractBasculaWeight(cleanBS); // Usa la cadena limpia aquí
    if (!r.ok) return setMsg({ t: "err", m: r.error });
    add(r.weight);
  };
  
  const tryManual = () => { // 👈 NUEVO: Función para agregar peso manual
    add(manualWeight);
  }

  return (
    <div style={{ padding: "4px 0", fontSize: 13, borderTop: "1px solid #f1f5f9", marginTop: 8 }}>
      {msg && (
        <div style={{ color: msg.t === "err" ? "#ef4444" : "#10b981", marginBottom: 4 }}>
          {msg.m}
        </div>
      )}

      {/* 🚨 ENTRADA MANUAL (Resuelve el Punto 1) 🚨 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <input
              type="number"
              step="0.01"
              placeholder="Peso Manual (LB)"
              value={manualWeight}
              onChange={(e) => setManualWeight(e.target.value)}
              onKeyDown={(e) => {
                  if (e.key === "Enter") tryManual();
              }}
              style={{ padding: 4, width: 140, border: "1px solid #e5e7eb", borderRadius: 4 }}
          />
          <button 
              type="button" 
              onClick={tryManual} 
              disabled={!manualWeight || !isFinite(Number(manualWeight)) || Number(manualWeight) <= 0} 
              style={{ padding: 4, background: "#f97316", color: "#fff", border: "none", borderRadius: 4 }}
          >
              + Caja (Manual)
          </button>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {/* San Martin (SM) */}
        <input
          type="text"
          placeholder="SM (ej: 0100000000000)"
          value={sm}
          onChange={(e) => setSM(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") trySM();
          }}
          style={{ padding: 4, width: 140, border: "1px solid #e5e7eb", borderRadius: 4 }}
        />
        <button type="button" onClick={trySM} disabled={!sm} style={{ padding: 4, background: "#10b981", color: "#fff", border: "none", borderRadius: 4 }}>
          Leer SM
        </button>

        {/* Báscula (BS) */}
        <input
          type="text"
          placeholder="Báscula (ej: 1300000000000)"
          value={bs}
          onChange={(e) => setBS(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") tryBS();
          }}
          style={{ padding: 4, width: 140, border: "1px solid #e5e7eb", borderRadius: 4 }}
        />
        <button type="button" onClick={tryBS} disabled={!bs} style={{ padding: 4, background: "#3b82f6", color: "#fff", border: "none", borderRadius: 4 }}>
          Leer BS
        </button>
      </div>
    </div>
  );
}
/* ==================================================================== */

// 👇 Lista de opciones para el campo "Recibido Por"
const RECIBIDO_POR_OPTIONS = [
    "TIENDA (EXHIBICION)",
    "CUARTO FRIO",
    "VENTA INMEDIATA"
];

export default function Entradas({ branchId }) {
  const [skus, setSkus] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [items, setItems] = useState([{ sku: "", pesos: [] }]);
  // 👇 MODIFICADO: Proveedor predeterminado a "cuarto frio"
  const [proveedor, setProveedor] = useState("cuarto frio");
  
  // 👇 CORRECCIÓN: Inicializa en string vacío para forzar la selección (o puedes poner "TIENDA (EXHIBICION)" si quieres un valor predeterminado)
  const [recibidoPor, setRecibidoPor] = useState(""); 
  
  // La fecha ya está predeterminada a hoy usando nowISO()
  const [fecha, setFecha] = useState(nowISO()); 
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // Estados para la APROBACIÓN DE TRASPASOS (SALIDAS PENDIENTES)
  const [pendingSalidas, setPendingSalidas] = useState([]);
  const [salidaToApprove, setSalidaToApprove] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { skus, proveedores } = await readCatalogs(branchId);
        setSkus(skus || []);
        setProveedores(proveedores || []);
      } catch (e) {
        console.error("Error al cargar catálogos:", e);
      }
    })();
    
    // Suscribirse a salidas pendientes de aprobar (Traspasos)
    const unsub = subscribeToPendingSalidas(branchId, (salidas) => {
      // ✅ Solución al Punto 2: El panel se mostrará si 'salidas' tiene elementos
      setPendingSalidas(salidas);
    });
    return () => unsub();
  }, [branchId]);

  const getSkuMeta = (sku) => (skus || []).find((s) => s.sku === sku);

  const setSkuAt = (index, sku) => {
    const newItems = items.slice();
    newItems[index] = { ...newItems[index], sku };
    setItems(newItems);
  };

  const setPesosAt = (index, pesos) => {
    const newItems = items.slice();
    newItems[index] = { ...newItems[index], pesos };
    setItems(newItems);
  };

  const addLineBelow = (index) => {
    const newItems = items.slice();
    newItems.splice(index + 1, 0, { sku: "", pesos: [] });
    setItems(newItems);
  };

  const removeLine = (index) => {
    const newItems = items.slice();
    newItems.splice(index, 1);
    // Asegurar que siempre haya al menos una línea
    if (newItems.length === 0) {
      newItems.push({ sku: "", pesos: [] });
    }
    setItems(newItems);
  };

  const registrar = async () => {
    setMsg(null);
    setSaving(true);
    try {
      if (!proveedor) throw new Error("Selecciona un Proveedor.");
      // 👇 Valida que se haya seleccionado una opción de la lista
      if (!recibidoPor) throw new Error("Selecciona quién recibe la mercadería."); 
      if (items.filter(it => it.pesos.length > 0).length === 0) throw new Error("Agrega al menos una caja con peso.");

      const payloadItems = items
        .filter(it => it.pesos.length > 0)
        .map(it => ({
          sku: it.sku,
          pesos: it.pesos.map(Number), // Asegurar que son números
        }));

      if (payloadItems.some(it => !getSkuMeta(it.sku))) {
          throw new Error("Verifica que todos los ítems tengan un SKU válido seleccionado.");
      }

      await registrarEntrada(branchId, {
        proveedor,
        recibidoPor, // Ahora contiene la opción seleccionada
        fecha,
        obs,
        items: payloadItems,
      });

      // Limpiar formulario
      setProveedor("cuarto frio"); // Mantener el valor predeterminado al limpiar
      setRecibidoPor(""); // Vuelve al estado inicial para que se tenga que seleccionar de nuevo
      setObs("");
      setItems([{ sku: "", pesos: [] }]);
      setMsg({ t: "ok", m: "Entrada registrada exitosamente." });
    } catch (e) {
      console.error("[Registrar Entrada Error]:", e);
      setMsg({ t: "err", m: e.message || "Error al registrar la entrada." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Mensajes de feedback */}
      {msg && (
        <div
          style={{
            padding: 10,
            marginBottom: 16,
            borderRadius: 4,
            background: msg.t === "err" ? "#fee2e2" : "#d1fae5",
            color: msg.t === "err" ? "#ef4444" : "#059669",
            fontWeight: 500,
          }}
        >
          {msg.m}
        </div>
      )}

      {/* ============================== */}
      {/* 1. PANEL DE APROBACIÓN DE TRASPASOS (MOVIDO ARRIBA) */}
      {/* ============================== */}
      <div style={{ border: "1px solid #b91c1c", borderRadius: 8, padding: 16, background: "#fef2f2" }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "#991b1b" }}>
          Traspasos Pendientes de Aprobar ({pendingSalidas.length}) 🔔
        </h3>
        
        {pendingSalidas.length === 0 ? (
          <div style={{ color: "#7f1d1d", padding: "8px 0", borderTop: "1px solid #fecaca", marginTop: 8 }}>
                — No hay traspasos pendientes de aprobación —
            </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", paddingBottom: 8, fontSize: 13, color: "#991b1b" }}>Folio</th>
                <th style={{ textAlign: "left", paddingBottom: 8, fontSize: 13, color: "#991b1b" }}>Origen</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontSize: 13, color: "#991b1b" }}>Total Cajas</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontSize: 13, color: "#991b1b" }}>Total Peso (LB)</th>
                <th style={{ textAlign: "left", paddingBottom: 8, fontSize: 13, color: "#991b1b" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pendingSalidas.map((s) => {
                const totalCajas = (s.items || []).reduce((sum, item) => sum + (item.pesos || []).length, 0);
                
                // 💡 CORRECCIÓN DE PESO (PREVIA): Busca 'w.peso' para objetos o usa 'w' directamente
                const totalPeso = (s.items || []).reduce((sum, item) => sum + (item.pesos || []).reduce((s, w) => s + Number(w?.peso || w), 0), 0);
                
                return (
                  <tr key={s.id} style={{ borderTop: "1px dashed #fecaca", fontSize: 14 }}>
                    <td style={{ paddingTop: 8 }}>{s.folio || "N/D"}</td>
                    <td style={{ paddingTop: 8 }}>{s.branchNameOrigen || s.branchIdOrigen || "—"}</td>
                    <td style={{ paddingTop: 8, textAlign: "right" }}>{totalCajas}</td>
                    <td style={{ paddingTop: 8, textAlign: "right", fontWeight: 600 }}>{totalPeso.toLocaleString(undefined, {maximumFractionDigits: 2})} LB</td>
                    <td style={{ paddingTop: 8 }}>
                      <button 
                        type="button" 
                        onClick={() => setSalidaToApprove(s)}
                        style={{ background: "#991b1c", color: "#fff", padding: "4px 8px", fontSize: 12, border: "none", borderRadius: 4, cursor: 'pointer' }}
                      >
                        Ver y Aprobar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Separador visual */}
      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px dashed #ccc' }} />

      {/* 2. Formulario de Entrada (MOVIDO ABAJO) */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Registrar Nueva Entrada</h3>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {/* Columna 1 (Proveedor) */}
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>Proveedor:</label>
            <select
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
              required
            >
              <option value="">— Seleccionar —</option>
              {/* Aseguramos que la opción predeterminada esté si es una de las cargadas */}
              {proveedores.map((p) => (
                <option key={p.id} value={p.nombre}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          
          {/* Columna 2 (Recibido Por) 👈 CORRECCIÓN AQUÍ */}
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>Recibido Por:</label>
            <select
              value={recibidoPor}
              onChange={(e) => setRecibidoPor(e.target.value)}
              style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
              required
            >
              <option value="">— Selecciona área de recibo —</option>
              {RECIBIDO_POR_OPTIONS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>
          
          {/* Columna 3 (Fecha) */}
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>Fecha de Entrada:</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
            />
          </div>

          {/* Columna 4 (Observaciones) */}
          <div style={{ gridColumn: "1 / span 2" }}>
            <label style={{ display: "block", marginBottom: 4 }}>Observaciones:</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
              rows="2"
            />
          </div>
        </div>

        {/* Tabla de Items */}
        <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", paddingBottom: 8 }}>SKU / Descripción</th>
              <th style={{ textAlign: "left", paddingBottom: 8, width: 80 }}>Unidad</th>
              <th style={{ textAlign: "left", paddingBottom: 8, width: 350 }}>Pesos (LB) / Códigos</th>
              <th style={{ textAlign: "right", paddingBottom: 8, width: 100 }}>Total (LB)</th>
              <th style={{ width: 100 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const meta = getSkuMeta(it.sku);
              const total = (it.pesos || []).reduce((sum, w) => sum + Number(w), 0);
              return (
                <tr key={i} style={{ borderTop: i > 0 ? "1px dashed #e5e7eb" : "none" }}>
                  <td style={{ paddingTop: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <BuscarSKU skus={skus} onSelect={(s) => setSkuAt(i, s.sku)} />
                      {it.sku && <span className="badge" style={{ padding: "2px 6px", background: "#fef3c7", color: "#b45309", borderRadius: 4 }}>{it.sku}</span>}
                      {meta?.nombre && <span>{meta.nombre}</span>}
                    </div>
                  </td>
                  <td>{meta?.unidad || "—"}</td>
                  <td>
                    <PesoBoxes
                      idPrefix={`ent-${i}-`}
                      values={it.pesos}
                      onChange={(v) => setPesosAt(i, v)}
                    />
                    {/* 👇 Lector de códigos (SM 54/52 y Báscula 13) y Entrada Manual */}
                    <ScanCodigosRow
                      onAdd={(w) => {
                        const arr = Array.isArray(it.pesos) ? it.pesos.slice() : [];
                        arr.push(Number(w));
                        setPesosAt(i, arr);
                      }}
                    />
                  </td>
                  
                  {/* ✅ Muestra el total en Libras */}
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    {total.toLocaleString(undefined,{maximumFractionDigits:2})} LB
                  </td>

                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <button 
                            type="button" 
                            onClick={() => addLineBelow(i)} 
                            style={{ fontSize: 12, padding: "4px 8px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #dcfce7", borderRadius: 4, cursor: 'pointer' }}
                        >
                        + Fila SKU
                      </button>
                      <button 
                            type="button" 
                            onClick={() => removeLine(i)} 
                            disabled={items.length === 1} // No permite quitar la última línea
                            style={{ fontSize: 12, padding: "4px 8px", background: "#fef2f2", color: "#ef4444", border: "1px solid #fee2e2", borderRadius: 4, cursor: 'pointer' }}
                        >
                        Quitar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
           <button 
                type="button" 
                onClick={registrar} 
                disabled={saving}
                style={{ padding: "8px 16px", background: "#f97316", color: "#fff", border: "none", borderRadius: 4, cursor: 'pointer' }}
            >
             {saving ? "Guardando…" : "Registrar Entrada"}
           </button>
        </div>
      </div>
      
      {/* MODAL DE APROBACIÓN */}
      <AprobacionModal
        salida={salidaToApprove}
        skus={skus} // Se pasa el catálogo para mostrar descripción
        onClose={() => setSalidaToApprove(null)}
        onApprove={async (recibidoPor) => {
          try {
            if (!recibidoPor) throw new Error("Debes indicar quién recibe la mercadería.");
            if (!salidaToApprove?.id) throw new Error("Error interno: Traspaso no seleccionado.");
            
            await aprobarSalida(branchId, salidaToApprove.id, recibidoPor);
            
            // ✅ CORRECCIÓN 1: Actualizar localmente la lista de pendientes para una actualización instantánea.
            setPendingSalidas(prev => prev.filter(s => s.id !== salidaToApprove.id));
            
            setMsg({ t: "ok", m: `Traspaso ${salidaToApprove.folio} aprobado y registrado como entrada.` });
            setSalidaToApprove(null); // Cierra el modal solo en éxito
          } catch (e) {
            console.error("[Aprobar Traspaso Error]:", e);
            setMsg({ t: "err", m: e.message || "Error al aprobar el traspaso." });
          }
        }}
      />
    </div>
  );
}