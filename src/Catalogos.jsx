import React, { useEffect, useMemo, useState } from "react";
// ✅ CORRECCIÓN: Usar 'subscribeCatalogs'
import { subscribeCatalogs, addProveedor, addDestino, upsertCatalogs } from "./data-api.js";

/** Utils internos para CSV */
function parseCSV(text) {
  // Parser sencillo para CSV (soporta comas dentro de comillas)
  const rows = [];
  let row = [];
  let col = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { col += '"'; i++; continue; }
      if (ch === '"') { inQuotes = false; continue; }
      col += ch;
    } else {
      if (ch === '"') { inQuotes = true; continue; }
      if (ch === ",") { row.push(col); col = ""; continue; }
      if (ch === "\n" || ch === "\r") {
        // fin de línea
        if (ch === "\r" && next === "\n") i++; // CRLF
        row.push(col); col = "";
        if (row.length) rows.push(row);
        row = [];
        continue;
      }
      col += ch;
    }
  }
  // última columna/row
  if (col.length || row.length) {
    row.push(col);
    rows.push(row);
  }

  // Mapear a objetos { sku, nombre, unidad, activo }
  if (rows.length === 0) return [];
  
  // Asumimos que la primera fila es el encabezado y lo ignoramos si hay más de 1 fila
  const dataRows = rows.length > 1 ? rows.slice(1) : rows;

  return dataRows
    .map((r, i) => {
      // Ignorar filas vacías o con un solo campo vacío
      if (!r || r.every(c => !c.trim())) return null;

      const [sku = "", nombre = "", unidad = "", activo = "1"] = r.map(s => String(s).trim());
      
      return {
        sku: sku.toUpperCase(),
        nombre: nombre,
        unidad: unidad || "LB",
        activo: activo === "1" || activo.toLowerCase() === "true"
      };
    })
    .filter(Boolean) // Eliminar nulos
    .filter(r => r.sku && r.nombre); // Asegurar que tengan SKU y nombre
}

/* ==================================================================== */

function Panel({ title, children, right = null }) {
  return (
    <div style={{ marginBottom: 20, border: "1px solid #e2e8f0", borderRadius: 8 }}>
      <header
        style={{
          padding: "10px 15px",
          backgroundColor: "#f1f5f9",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontWeight: 600,
          color: "#1e293b",
        }}
      >
        <span>{title}</span>
        {right && <div>{right}</div>}
      </header>
      <div style={{ padding: 15 }}>{children}</div>
    </div>
  );
}


export default function Catalogos({ branchId }) {
  const [catalogs, setCatalogs] = useState({ skus: null, proveedores: null, destinos: null });
  const [error, setError] = useState(null);

  // Estados locales para nuevos catálogos
  const [newProv, setNewProv] = useState("");
  const [newDest, setNewDest] = useState("");
  const [isSavingProv, setIsSavingProv] = useState(false);
  const [isSavingDest, setIsSavingDest] = useState(false);
  
  // Estados para carga de SKUs
  const [skuFileText, setSkuFileText] = useState("");
  const [isUploadingSkus, setIsUploadingSkus] = useState(false);


  useEffect(() => {
    if (!branchId) return;

    // ✅ Uso de 'subscribeCatalogs'
    const unsub = subscribeCatalogs(
      branchId,
      (data) => {
        setCatalogs(data);
        setError(null);
      },
      (err) => {
        console.error("Error subscribing to branch data:", err);
        setError("Error al cargar catálogos. Revisa la consola.");
      }
    );

    return () => unsub();
  }, [branchId]);

  const { skus, proveedores, destinos } = catalogs;

  /* ===================== Lógica de Proveedores ===================== */

  const handleAddProveedor = async () => {
    if (!newProv.trim()) return alert("Ingresa un nombre.");
    setIsSavingProv(true);
    try {
      await addProveedor(branchId, newProv);
      setNewProv("");
      alert("Proveedor agregado con éxito.");
    } catch (e) {
      console.error("[Catalogos] addProveedor error:", e);
      alert("Error al agregar proveedor: " + (e?.message || e));
    } finally {
      setIsSavingProv(false);
    }
  };
  
  /* ===================== Lógica de Destinos ===================== */

  const handleAddDestino = async () => {
    if (!newDest.trim()) return alert("Ingresa un nombre.");
    setIsSavingDest(true);
    try {
      // ✅ Uso de 'addDestino'
      await addDestino(branchId, newDest); 
      setNewDest("");
      alert("Destino agregado con éxito.");
    } catch (e) {
      console.error("[Catalogos] addDestino error:", e);
      alert("Error al agregar destino: " + (e?.message || e));
    } finally {
      setIsSavingDest(false);
    }
  };

  /* ===================== Lógica de SKUs ===================== */

  // Se recalcula la lista de SKUs a subir cada vez que cambia el texto
  const parsedSkus = useMemo(() => {
    if (!skuFileText) return [];
    try {
      return parseCSV(skuFileText);
    } catch (e) {
      console.error("Error al parsear CSV:", e);
      return [];
    }
  }, [skuFileText]);


  const handleUploadSkus = async () => {
    if (parsedSkus.length === 0) return alert("No hay SKUs válidos para subir.");
    
    // Filtro final para asegurar que solo subimos lo necesario
    const skusToUpload = parsedSkus.map(s => ({
      sku: s.sku,
      nombre: s.nombre,
      unidad: s.unidad,
      activo: s.activo
    }));

    setIsUploadingSkus(true);
    try {
      await upsertCatalogs(branchId, skusToUpload);
      setSkuFileText(""); // Limpiar el área de texto
      alert(`Catálogo de SKUs actualizado con ${skusToUpload.length} registros.`);
    } catch (e) {
      console.error("[Catalogos] upsertCatalogs error:", e);
      alert("Error al subir SKUs: " + (e?.message || e));
    } finally {
      setIsUploadingSkus(false);
    }
  };


  if (error) {
    return <div style={{ color: "#ef4444" }}>{error}</div>;
  }
  if (!branchId) {
    return <div style={{ color: "#94a3b8" }}>Selecciona una sucursal para ver los catálogos.</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Catálogos de {branchId}</h2>
      
      {/* ======================= SKUs ======================= */}
      <Panel
        title={`SKUs (${(skus || []).length})`}
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>*Carga CSV (sku,nombre,unidad,activo)</span>
            <button
              type="button"
              onClick={handleUploadSkus}
              disabled={isUploadingSkus || parsedSkus.length === 0}
              style={{ padding: "6px 12px", background: "#f97316", color: "#fff", border: "none", borderRadius: 4 }}
            >
              {isUploadingSkus ? "Subiendo..." : `Subir ${parsedSkus.length} SKUs`}
            </button>
          </div>
        }
      >
        <textarea
          rows={6}
          placeholder="Pega aquí el contenido de un CSV (con o sin encabezado: SKU,Nombre,Unidad,Activo)"
          value={skuFileText}
          onChange={(e) => setSkuFileText(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 8 }}
        />
        
        <div style={{ maxHeight: 280, overflow: "auto", borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
          {(skus || []).length === 0 ? (
            <div style={{ color: "#64748b" }}>— Sin SKUs —</div>
          ) : (
            <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", paddingBottom: 6 }}>SKU</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", paddingBottom: 6 }}>Nombre</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", paddingBottom: 6 }}>Unidad</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", paddingBottom: 6 }}>Activo</th>
                </tr>
              </thead>
              <tbody>
                {skus.map((s, i) => (
                  <tr key={s.sku || i}>
                    <td style={{ padding: "6px 0" }}>{s.sku}</td>
                    <td style={{ padding: "6px 0" }}>{s.nombre}</td>
                    <td style={{ padding: "6px 0" }}>{s.unidad || "—"}</td>
                    <td style={{ padding: "6px 0" }}>{s.activo ? "✅" : "❌"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>


      {/* ======================= PROVEEDORES ======================= */}
      <Panel
        title={`Proveedores (${(proveedores || []).length})`}
        right={
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              value={newProv}
              onChange={(e) => setNewProv(e.target.value)}
              placeholder="Nombre del nuevo proveedor"
              style={{ padding: 6, border: "1px solid #ccc", borderRadius: 4 }}
            />
            <button
              type="button"
              onClick={handleAddProveedor}
              disabled={isSavingProv || !newProv.trim()}
              style={{ padding: "6px 12px", background: "#059669", color: "#fff", border: "none", borderRadius: 4 }}
            >
              {isSavingProv ? "Guardando..." : "Agregar Proveedor"}
            </button>
          </div>
        }
      >
        <div style={{ maxHeight: 200, overflow: "auto" }}>
          {(proveedores || []).length === 0 ? (
            <div style={{ color: "#64748b" }}>— Sin proveedores —</div>
          ) : (
            <ul style={{ listStyleType: "none", padding: 0 }}>
              {proveedores.map(p => (
                <li key={p.id} style={{ padding: "4px 0", borderBottom: "1px dotted #e5e7eb" }}>
                  {p.nombre}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>


      {/* ======================= DESTINOS ======================= */}
      <Panel
        title={`Destinos (${(destinos || []).length})`}
        right={
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              value={newDest}
              onChange={(e) => setNewDest(e.target.value)}
              placeholder="Nombre del nuevo destino"
              style={{ padding: 6, border: "1px solid #ccc", borderRadius: 4 }}
            />
            <button
              type="button"
              onClick={handleAddDestino}
              disabled={isSavingDest || !newDest.trim()}
              style={{ padding: "6px 12px", background: "#059669", color: "#fff", border: "none", borderRadius: 4 }}
            >
              {isSavingDest ? "Guardando..." : "Agregar Destino"}
            </button>
          </div>
        }
      >
        <div style={{ maxHeight: 200, overflow: "auto" }}>
          {(destinos || []).length === 0 ? (
            <div style={{ color: "#64748b" }}>— Sin destinos —</div>
          ) : (
            <ul style={{ listStyleType: "none", padding: 0 }}>
              {destinos.map(d => (
                <li key={d.id} style={{ padding: "4px 0", borderBottom: "1px dotted #e5e7eb" }}>
                  {d.nombre}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}