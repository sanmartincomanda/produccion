// src/Salidas.jsx
import React, { useEffect, useState, useMemo } from "react";
// import { nowISO } from "./utils.js"; // nowISO ya no es necesario para la fecha
import { registrarSalida, readCatalogs } from "./data-api.js"; 
import BuscarSKU from "./components/BuscarSKU.jsx";
import PesoBoxes from "./components/PesoBoxes.jsx";
import { extractSanMartinWeight, extractBasculaWeight } from "./utils.js";


/**
 * Obtiene la fecha actual en formato YYYY-MM-DD (requerido por input type="date").
 * @returns {string} Fecha de hoy en formato "YYYY-MM-DD".
 */
const getTodayDateFormatted = () => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0'); 
  const day = String(today.getDate()).padStart(2, '0');
  const year = today.getFullYear();
  return `${year}-${month}-${day}`;
};


/* ====== Componente de Lector de Códigos Reutilizado ====== */
function ScanCodigosRow({ onAdd }) {
  // ... (El contenido de este componente es correcto y se mantiene)
  const [sm, setSM] = React.useState("");
  const [bs, setBS] = React.useState("");
  const [manualWeight, setManualWeight] = React.useState("");
  const [msg, setMsg] = React.useState(null);

  const add = (w) => {
    const n = Number(w);
    if (!isFinite(n) || n <= 0) {
      setMsg({ t: "err", m: "Peso inválido." });
      return;
    }
    onAdd(n);
    setMsg({ t: "ok", m: `Caja agregada: ${n.toFixed(2)} LB` });
  };

  const trySM = () => {
    const cleanSM = sm.replace(/\D/g, "");
    const r = extractSanMartinWeight(cleanSM);
    if (!r.ok) return setMsg({ t: "err", m: r.error });
    add(r.weight);
    setSM("");
  };

  const tryBS = () => {
    const cleanBS = bs.replace(/\D/g, "");
    const r = extractBasculaWeight(cleanBS);
    if (!r.ok) return setMsg({ t: "err", m: r.error });
    add(r.weight);
    setBS("");
  };
  
  const tryManual = (e) => {
    e.preventDefault();
    if (!manualWeight) return;
    add(manualWeight);
    setManualWeight("");
  }


  // Limpiar mensaje después de 3 segundos
  useEffect(() => {
    if (msg) {
      const id = setTimeout(() => setMsg(null), 3000);
      return () => clearTimeout(id);
    }
  }, [msg]);

  return (
    <div style={{ padding: 5, border: "1px dashed #ccc", marginTop: 5, borderRadius: 4 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 5 }}>
        {/* Lector San Martin (SM) */}
        <input
          type="text"
          value={sm}
          onChange={(e) => setSM(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              trySM();
            }
          }}
          placeholder="Escanear SM (54 ó 52)"
          style={{ width: 140, padding: 5 }}
        />
        <button type="button" onClick={trySM} disabled={!sm.trim()}>
          +
        </button>

        {/* Lector Báscula (BS) */}
        <input
          type="text"
          value={bs}
          onChange={(e) => setBS(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              tryBS();
            }
          }}
          placeholder="Escanear Báscula (13)"
          style={{ width: 140, padding: 5 }}
        />
        <button type="button" onClick={tryBS} disabled={!bs.trim()}>
          +
        </button>

        {/* Entrada Manual */}
        <form onSubmit={tryManual} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="number"
            step="0.01"
            value={manualWeight}
            onChange={(e) => setManualWeight(e.target.value)}
            placeholder="Peso manual (LB)"
            style={{ width: 120, padding: 5 }}
          />
          <button type="submit" disabled={!manualWeight}>
            +
          </button>
        </form>
      </div>

      {msg && (
        <div style={{ color: msg.t === "err" ? "#ef4444" : "#10b981", fontSize: 12 }}>
          {msg.m}
        </div>
      )}
    </div>
  );
}


/* ==================================================================== */
/* ====== Componente Principal (Salidas) ====== */
/* ==================================================================== */

const newRow = () => ({ sku: "", pesos: [], obs: "" });

export default function Salidas({ branchId }) {
  // Estado para la tabla de registro
  const [lines, setLines] = useState([newRow()]);
  // La fecha ya está predeterminada a hoy usando getTodayDateFormatted()
  const [fecha, setFecha] = useState(getTodayDateFormatted());
  // 👇 MODIFICADO: Destino predeterminado a "Produccion"
  const [destinoId, setDestinoId] = useState("Produccion");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Estado para catálogos (SKUs, Destinos)
  const [catalogs, setCatalogs] = useState({ skus: [], destinos: [] });
  // Se asume que en `App.jsx` o donde se obtenga la lista de sucursales, 
  // la sucursal actual también está en `destinos` para permitir el traspaso interno.
  const { skus, destinos } = catalogs;


  /* Lógica de Catálogos (se ejecuta al montar) */
  useEffect(() => {
    if (!branchId) return;

    async function loadCatalogs() {
      try {
        const { skus, destinos } = await readCatalogs(branchId); 
        setCatalogs({ skus, destinos });
      } catch (e) {
        console.error("Error al cargar catálogos:", e);
      }
    }
    
    loadCatalogs();
  }, [branchId]);


  // Mapeo de SKUs a metadata
  const skusMetaMap = useMemo(() => {
    return (skus || []).reduce((acc, s) => {
      acc[s.sku] = s;
      return acc;
    }, {});
  }, [skus]);

  
  /* Lógica de Edición de la Tabla */

  const setSkuAt = (i, sku) => {
    const newLines = lines.slice();
    newLines[i] = { ...newLines[i], sku: sku };
    setLines(newLines);
  };

  const setPesosAt = (i, pesos) => {
    const newLines = lines.slice();
    newLines[i] = { ...newLines[i], pesos: pesos };
    setLines(newLines);
  };
  
  const addLineBelow = (i) => {
    const newLines = lines.slice();
    newLines.splice(i + 1, 0, newRow());
    setLines(newLines);
  };

  const removeLine = (i) => {
    if (lines.length === 1) return alert("Debe haber al menos una línea.");
    const newLines = lines.filter((_, idx) => idx !== i);
    setLines(newLines);
  };
  
  const calculateTotal = (pesos) => (pesos || []).reduce((sum, w) => sum + Number(w || 0), 0);

  
  /* ================================================== */
  /* Lógica de Validación y Registro de SALIDA */
  /* ================================================== */
const registrar = async () => {
    if (!branchId) return alert("Selecciona una sucursal.");
    if (!fecha) return alert("Selecciona una fecha.");
    if (!destinoId) return alert("Selecciona un destino (sucursal o cliente).");
    
    setSaving(true);
    
    // 1. FILTRADO Y VALIDACIÓN DE LÍNEAS
    const itemsToRegister = lines
      .filter((it) => 
        it.sku && 
        Array.isArray(it.pesos) && 
        it.pesos.length > 0 && 
        it.pesos.every(p => Number(p) > 0) 
      )
      .map(it => ({
          sku: it.sku.trim().toUpperCase(),
          pesos: it.pesos.map(Number), // Asegura que los pesos sean números
          obs: it.obs || "",
      }));

    if (itemsToRegister.length === 0) {
        alert("¡No puedes registrar una salida vacía! Debes ingresar al menos una línea válida con un SKU seleccionado y pesos registrados (total > 0 LB).");
        setSaving(false);
        return; // Detiene la ejecución
    }

    // 2. LÓGICA CLAVE PARA APROBACIÓN INTERNA:
   const destinoObj = destinos.find(d => d.nombre === destinoId.trim()); 
   const branchIdDestino = destinoObj ? destinoObj.id : null;
   const isTraspaso = !!branchIdDestino;
   
   // Si el destino es la sucursal actual (Aprobación Interna)
   const isInternalTraspaso = isTraspaso && branchIdDestino === branchId; 

// ✅ CORRECCIÓN: Objeto 'data' completo y cerrado
const data = {
    fecha: fecha,
    // Si es interno, el destino es la sucursal actual. Si es externo o nulo, es el ID/null encontrado.
    branchIdDestino: branchIdDestino, 
    
    // Si hay un ID de destino, es traspaso (ya sea interno o externo).
    tipoSalida: isTraspaso ? "traspaso" : "venta_consumo", 

    obs: obs.trim(),
    lineas: itemsToRegister,
    total: itemsToRegister.reduce((sum, l) => l.pesos.reduce((a, b) => a + b, 0) + sum, 0)
};

    // 3. LLAMADA A LA API DE REGISTRO
    try {
      // Llamada al data-api.js para la SALIDA (esperamos el folio)
      const { folio } = await registrarSalida(branchId, data); 
      
      alert(`Salida registrada con folio: ${folio}${isInternalTraspaso ? " (REQUIERE APROBACIÓN INTERNA)" : ""}`);
      
      // 4. Resetear estados al terminar
      setLines([newRow()]); 
      setDestinoId("Produccion"); // Mantener el valor predeterminado al limpiar
      setObs("");
      setFecha(getTodayDateFormatted()); // ✅ CAMBIO: Usar función que retorna YYYY-MM-DD
      
    } catch (e) {
      console.error("[Salidas] registrarSalida error:", e);
      alert("Error al registrar salida: " + (e?.message || e)); 
    } finally {
      setSaving(false);
    }
  };


  if (!branchId) {
    return <div style={{ color: "#94a3b8" }}>Selecciona una sucursal para registrar salidas.</div>;
  }
  
  // ===================== RENDER =====================

  return (
    <div style={{ padding: 16 }}>
      {/* ... (Resto del render de Salidas.jsx es correcto) ... */}
      <h2>Registro de Salidas</h2>

      <div style={{ marginBottom: 16 }}>
        {/* FILA DE DATOS GENERALES */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
          <label>
            Fecha:
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ padding: 5, marginLeft: 5 }} />
          </label>
          <label>
            Destino (Sucursal/Cliente):
            <input 
              type="text" 
              list="destinos-list" 
              value={destinoId} 
              onChange={(e) => setDestinoId(e.target.value)} 
              placeholder="Destino o Sucursal de Traspaso"
              style={{ padding: 5, marginLeft: 5, width: 250 }}
            />
            <datalist id="destinos-list">
              {(destinos || []).map(d => <option key={d.id} value={d.nombre} />)}
            </datalist>
          </label>
        </div>
        <label style={{ display: 'block' }}>
            Observaciones Generales:
            <textarea 
                value={obs} 
                onChange={(e) => setObs(e.target.value)} 
                rows={2}
                style={{ width: '100%', padding: 5, marginTop: 5, boxSizing: 'border-box' }}
            />
        </label>
      </div>
      
      {/* TABLA DE LÍNEAS */}
      <div style={{ border: "1px solid #ccc", padding: 12, borderRadius: 4 }}>
        <h4>Líneas de Salida</h4>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", paddingBottom: 6 }}>SKU</th>
              <th style={{ textAlign: "left", paddingBottom: 6 }}>Unidad</th>
              <th style={{ textAlign: "left", paddingBottom: 6 }}>Pesos (LB) y Escáner</th>
              <th style={{ textAlign: "right", paddingBottom: 6 }}>Total (LB)</th>
              <th style={{ textAlign: "left", paddingBottom: 6 }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((it, i) => {
              const meta = skusMetaMap[it.sku];
              const total = calculateTotal(it.pesos);
              return (
                <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ overflow: "visible" }}>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      {/* Componente para buscar SKU */}
                      <BuscarSKU skus={skus} onSelect={(s)=> setSkuAt(i, s.sku)} />
                      {it.sku && <span className="badge">{it.sku}</span>}
                      {meta?.nombre && <span>{meta.nombre}</span>}
                    </div>
                  </td>
                  <td>{meta?.unidad || "—"}</td>
                  <td style={{ overflow: "visible" }}>
                    {/* Componente para ingresar pesos individuales */}
                    <PesoBoxes
                      idPrefix={`sal-${i}-`}
                      values={it.pesos}
                      onChange={(v) => setPesosAt(i, v)}
                    />
                    {/* Lector de códigos */}
                    <ScanCodigosRow
                      onAdd={(w) => {
                        const arr = Array.isArray(it.pesos) ? it.pesos.slice() : [];
                        arr.push(Number(w));
                        setPesosAt(i, arr);
                      }}
                    />
                  </td>
                  
                  {/* Muestra el total en Libras */}
                  <td style={{textAlign: "right", fontWeight: 600}}>{total.toLocaleString(undefined,{maximumFractionDigits:2})} LB</td>

                  <td>
                    <button type="button" onClick={()=>addLineBelow(i)}>+ debajo</button>{" "}
                    <button type="button" onClick={()=>removeLine(i)}>Quitar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{marginTop:12}}>
          <button type="button" onClick={registrar} disabled={saving}>
            {saving ? "Guardando…" : "Registrar Salida"}
          </button>
        </div>
      </div>
    </div>
  );
}