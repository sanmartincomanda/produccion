/// src/Catalogos.jsx
import React, { useEffect, useMemo, useState } from "react";
import { subscribeBranch, addProveedor, addDestino, upsertCatalogs } from "./data-api.js";

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
  if (col.length || row.length) { row.push(col); rows.push(row); }

  // map a objetos según header
  if (!rows.length) return [];
  const header = rows[0].map(h => String(h || "").trim());
  return rows.slice(1)
    .filter(r => r.length && r.some(x => String(x || "").trim() !== ""))
    .map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").toString().trim()])));
}

function download(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Badge({ children }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      fontSize: 12,
      borderRadius: 999,
      background: "#eef2ff",
      color: "#3730a3",
      border: "1px solid #c7d2fe",
    }}>{children}</span>
  );
}

export default function Catalogos({ branchId }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [skus, setSkus] = useState([]);           // [{sku, nombre, unidad, activo?}]
  const [proveedores, setProveedores] = useState([]); // [{id, nombre, ...}]
  const [destinos, setDestinos] = useState([]);       // [{id, nombre, ...}]

  // Altas rápidas
  const [nuevoProv, setNuevoProv] = useState("");
  const [nuevoDest, setNuevoDest] = useState("");

  // Carga masiva
  const [csvPreview, setCsvPreview] = useState([]); // previsualiza lo leído antes de guardar

  useEffect(() => {
    if (!branchId) return;
    setLoading(true);
    setErr(null);

    const un = subscribeBranch(
      branchId,
      (partial) => {
        // Mezcla parcial: no borres lo que ya hay si algo aún no llegó
        if (Array.isArray(partial.skus)) setSkus(partial.skus);
        if (Array.isArray(partial.proveedores)) setProveedores(partial.proveedores);
        if (Array.isArray(partial.destinos)) setDestinos(partial.destinos);
        setLoading(false);
      },
      (e) => {
        console.error("[Catalogos] subscribe error:", e);
        setErr(e);
        setLoading(false);
      }
    );
    return un;
  }, [branchId]);

  const totalActivos = useMemo(
    () => (skus || []).filter(s => String(s.activo ?? "1") !== "0").length,
    [skus]
  );

  /* ============== Acciones: proveedores / destinos ============== */
  const onAddProveedor = async () => {
    const nombre = (nuevoProv || "").trim();
    if (!nombre) return alert("Escribe el nombre del proveedor.");
    try {
      await addProveedor(branchId, nombre);
      setNuevoProv("");
    } catch (e) {
      console.error("addProveedor", e);
      alert("No se pudo guardar el proveedor:\n" + (e?.message || e));
    }
  };

  const onAddDestino = async () => {
    const nombre = (nuevoDest || "").trim();
    if (!nombre) return alert("Escribe el nombre del destino.");
    try {
      await addDestino(branchId, nombre);
      setNuevoDest("");
    } catch (e) {
      console.error("addDestino", e);
      alert("No se pudo guardar el destino:\n" + (e?.message || e));
    }
  };

  /* ============== Carga masiva de SKUs ============== */
  const onFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    // Normaliza campos esperados
    const norm = rows.map(r => ({
      sku: r.sku || r.SKU || r.Sku || "",
      nombre: r.nombre || r.name || r.Nombre || "",
      unidad: r.unidad || r.Unidad || r.unit || "",
      activo: (r.activo ?? r.Activo ?? "1").toString().trim(),
    })).filter(r => r.sku);

    if (!norm.length) {
      alert("No se encontraron filas válidas con columna 'sku'.");
      return;
    }
    setCsvPreview(norm.slice(0, 50)); // muestra primeras 50
    if (!confirm(`Leí ${norm.length} SKUs del CSV. ¿Subirlos ahora?`)) return;

    try {
      await upsertCatalogs(branchId, { skus: norm });
      alert(`SKUs actualizados (${norm.length}).`);
      setCsvPreview([]);
    } catch (e) {
      console.error("upsertCatalogs", e);
      alert("No se pudo guardar el catálogo de SKUs:\n" + (e?.message || e));
    }
  };

  const downloadPlantilla = () => {
    const header = ["sku", "nombre", "unidad", "activo"];
    const sample = [
      ["POSTA-GALLINA", "Posta de Gallina", "LB", "1"],
      ["HUESO-RES", "Hueso de Res", "LB", "1"],
      ["POLLO-PECHUGA", "Pechuga de Pollo", "LB", "1"],
    ];
    const csv = [header, ...sample].map(r =>
      r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)).join(",")
    ).join("\r\n");
    download("plantilla_skus.csv", csv, "text/csv;charset=utf-8");
  };

  /* ============================ UI ============================ */

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 16, color: "#334155" }}>Cargando catálogos…</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {err && (
        <div style={{ padding: 12, border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 10, color: "#991b1b" }}>
          No se pudieron cargar algunos datos. Intenta de nuevo. <br />
          <small>{String(err?.message || err)}</small>
        </div>
      )}

      {/* Resumen */}
      <section style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Badge>SKUs: {skus?.length || 0}</Badge>
        <Badge>Activos: {totalActivos}</Badge>
        <Badge>Proveedores: {proveedores?.length || 0}</Badge>
        <Badge>Destinos: {destinos?.length || 0}</Badge>
      </section>

      {/* Proveedores */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Proveedores</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <input
            placeholder="Nuevo proveedor"
            value={nuevoProv}
            onChange={(e) => setNuevoProv(e.target.value)}
            style={{ flex: 1, minWidth: 220, padding: "8px 10px", borderRadius: 10, border: "1px solid #cbd5e1" }}
          />
          <button type="button" onClick={onAddProveedor}>Agregar</button>
        </div>
        <div style={{ maxHeight: 240, overflow: "auto", borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
          {(proveedores || []).length === 0 ? (
            <div style={{ color: "#64748b" }}>— Sin proveedores —</div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
              {proveedores.map((p) => (
                <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: "#10b981" }} />
                  <span>{p.nombre}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Destinos */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Destinos</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <input
            placeholder="Nuevo destino"
            value={nuevoDest}
            onChange={(e) => setNuevoDest(e.target.value)}
            style={{ flex: 1, minWidth: 220, padding: "8px 10px", borderRadius: 10, border: "1px solid #cbd5e1" }}
          />
          <button type="button" onClick={onAddDestino}>Agregar</button>
        </div>
        <div style={{ maxHeight: 240, overflow: "auto", borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
          {(destinos || []).length === 0 ? (
            <div style={{ color: "#64748b" }}>— Sin destinos —</div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
              {destinos.map((d) => (
                <li key={d.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: "#0ea5e9" }} />
                  <span>{d.nombre}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* SKUs */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>SKUs</h3>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <button type="button" onClick={downloadPlantilla}>Descargar plantilla CSV</button>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="file" accept=".csv,text/csv" style={{ display: "none" }}
              onChange={(e) => onFile(e.target.files?.[0])} />
            <span style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" }}>
              Cargar CSV…
            </span>
          </label>
          <span style={{ color: "#64748b" }}>Columnas: <code>sku,nombre,unidad,activo</code></span>
        </div>

        {csvPreview.length > 0 && (
          <div style={{ marginBottom: 10, padding: 8, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ marginBottom: 6, color: "#334155" }}>
              Previsualización (primeras {csvPreview.length} filas cargadas)
            </div>
            <div style={{ maxHeight: 220, overflow: "auto" }}>
              <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>sku</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>nombre</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>unidad</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>activo</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: 6 }}>{r.sku}</td>
                      <td style={{ padding: 6 }}>{r.nombre}</td>
                      <td style={{ padding: 6 }}>{r.unidad}</td>
                      <td style={{ padding: 6 }}>{String(r.activo ?? "1")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
                    <td style={{ padding: "6px 0" }}>{String(s.activo ?? "1") === "0" ? "No" : "Sí"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
