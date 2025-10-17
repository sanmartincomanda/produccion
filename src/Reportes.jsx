// src/Reportes.jsx
import React, { useEffect, useMemo, useState } from "react";
import { listenEntradas, listenSalidas } from "./data-api.js";

/* ======================== Helpers locales ======================== */
function toMs(v) {
  if (!v) return 0;
  if (typeof v === "object" && typeof v.seconds === "number") {
    return v.seconds * 1000;
  }
  const d = new Date(v);
  return isNaN(d) ? 0 : d.getTime();
}
function toISODate(v) {
  const ms = toMs(v);
  if (!ms) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtNum(n) {
  return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Abre una ventana imprimible con HTML simple */
function printDocument(title, htmlContent) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return alert("Bloqueado por el navegador. Permite ventanas emergentes.");
  win.document.open();
  win.document.write(`<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { font-family: system-ui, Arial; padding: 16px; color: #111827; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  .meta { font-size: 13px; color: #334155; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
  tfoot td { font-weight: 600; }
  .firmas { display:flex; gap:40px; margin-top:32px; }
  .firmas > div { flex:1; }
  .linea { border-top: 1px solid #111; height: 2px; margin-top: 48px; }
</style>
</head><body>${htmlContent}</body></html>`);
  win.document.close();
  win.focus();
  // Timeout corto para asegurar render antes de imprimir
  setTimeout(() => { win.print(); win.close(); }, 300);
}

/** Exporta a Excel (XML 2003) garantizando SKU como TEXTO */
function exportXLS(filename, rows, headers) {
  // styles: sText -> texto (para SKU), sNum -> número
  const styles = `
  <Styles>
    <Style ss:ID="sText"><NumberFormat ss:Format="@"/></Style>
    <Style ss:ID="sNum"><NumberFormat ss:Format="0.00"/></Style>
    <Style ss:ID="sTh"><Font ss:Bold="1"/></Style>
  </Styles>`;

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");

  const headerRow = `<Row>${headers.map(h =>
    `<Cell ss:StyleID="sTh"><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("")}</Row>`;

  // Heurística simple: si key incluye 'sku' → sText, si incluye 'total'/'cantidad' → sNum
  const isTextKey = (k) => /sku/i.test(k);
  const isNumKey = (k) => /(total|cantidad|peso)/i.test(k);

  const dataRows = rows.map((r) => {
    return `<Row>` + headers.map((keyOrObj) => {
      // headers puede ser string (key) o objeto { key, label, type }
      const key = typeof keyOrObj === "string" ? keyOrObj : keyOrObj.key;
      const val = r[key];
      if (val == null || val === "") {
        return `<Cell><Data ss:Type="String"></Data></Cell>`;
      }
      if (typeof keyOrObj === "object" && keyOrObj.type === "text") {
        return `<Cell ss:StyleID="sText"><Data ss:Type="String">${esc(val)}</Data></Cell>`;
      }
      if (typeof keyOrObj === "object" && keyOrObj.type === "number") {
        const n = Number(val) || 0;
        return `<Cell ss:StyleID="sNum"><Data ss:Type="Number">${n}</Data></Cell>`;
      }
      if (isTextKey(key)) {
        return `<Cell ss:StyleID="sText"><Data ss:Type="String">${esc(val)}</Data></Cell>`;
      }
      if (isNumKey(key)) {
        const n = Number(val) || 0;
        return `<Cell ss:StyleID="sNum"><Data ss:Type="Number">${n}</Data></Cell>`;
      }
      return `<Cell><Data ss:Type="String">${esc(val)}</Data></Cell>`;
    }).join("") + `</Row>`;
  }).join("");

  const xml = `<?xml version="1.0"?>
  <?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
            xmlns:html="http://www.w3.org/TR/REC-html40">
    ${styles}
    <Worksheet ss:Name="Reporte">
      <Table>
        ${headerRow}
        ${dataRows}
      </Table>
    </Worksheet>
  </Workbook>`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

/* ======================== UI: Reportes ======================== */
function Panel({ title, children, right }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <div style={{ marginLeft: "auto" }}>{right}</div>
      </div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        {children}
      </div>
    </div>
  );
}

function FiltrosFechas({ from, to, setFrom, setTo }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <label>Desde <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>Hasta <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
    </div>
  );
}

export default function Reportes({ branchId }) {
  const [entradas, setEntradas] = useState([]);
  const [salidas, setSalidas] = useState([]);
  const [from, setFrom] = useState(todayISODate());
  const [to, setTo] = useState(todayISODate());
  const [loading, setLoading] = useState(true);

  // Suscripciones
  useEffect(() => {
    if (!branchId) return;
    setLoading(true);
    const offE = listenEntradas(
      branchId,
      {},
      (rows) => { setEntradas(rows || []); setLoading(false); },
      (err) => { console.error("[Reportes] entradas error:", err); setLoading(false); }
    );
    const offS = listenSalidas(
      branchId,
      {},
      (rows) => { setSalidas(rows || []); },
      (err) => { console.error("[Reportes] salidas error:", err); }
    );
    return () => { offE && offE(); offS && offS(); };
  }, [branchId]);

  // Filtro de rango (cliente)
  const inRange = (doc) => {
    const d = toISODate(doc.fecha || doc.createdAt);
    if (!d) return false;
    return d >= (from || "0000-00-00") && d <= (to || "9999-12-31");
  };

  const E = useMemo(() => (entradas || []).filter(inRange), [entradas, from, to]);
  const S = useMemo(() => (salidas || []).filter(inRange), [salidas, from, to]);

  // Consolidado Diferencia (entrada - salida) por SKU
  const diff = useMemo(() => {
    const map = new Map();
    for (const e of E) {
      for (const it of e.items || []) {
        const sku = String(it.sku || "");
        const qty = Number(it.cantidad || 0) || 0;
        if (!sku) continue;
        map.set(sku, (map.get(sku) || 0) + qty);
      }
    }
    for (const s of S) {
      for (const it of s.items || []) {
        const sku = String(it.sku || "");
        const qty = Number(it.cantidad || 0) || 0;
        if (!sku) continue;
        map.set(sku, (map.get(sku) || 0) - qty);
      }
    }
    // a tabla simple
    return Array.from(map.entries())
      .map(([sku, total]) => ({ sku, diferencia: total }))
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }, [E, S]);

  // Render helpers
  const renderTableES = (rows, tipo) => {
    const totalLineas = rows.reduce((acc, r) => acc + (r.items?.length || 0), 0);
    return (
      <>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>#</th><th>Fecha</th><th>{tipo === "E" ? "Proveedor" : "Destino"}</th>
              <th>Consec</th><th>Items</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i}>
                <td>{i + 1}</td>
                <td>{toISODate(r.fecha || r.createdAt)}</td>
                <td>{tipo === "E" ? (r.proveedor || "—") : (r.destino || "—")}</td>
                <td>{r.num || "—"}</td>
                <td>
                  {(r.items || []).map((it, j) => (
                    <div key={j}>{it.sku} • {fmtNum(it.cantidad)}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={5}>Total líneas: {totalLineas}</td></tr>
          </tfoot>
        </table>
      </>
    );
  };

  const printES = (rows, titulo) => {
    const html = `
      <h1>${titulo}</h1>
      <div class="meta">Rango: ${from} a ${to} · Registros: ${rows.length}</div>
      <table>
        <thead><tr>
          <th>#</th><th>Fecha</th><th>${titulo.includes("Entradas") ? "Proveedor" : "Destino"}</th><th>Consec</th><th>Items</th>
        </tr></thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${toISODate(r.fecha || r.createdAt)}</td>
              <td>${titulo.includes("Entradas") ? (r.proveedor || "—") : (r.destino || "—")}</td>
              <td>${r.num || "—"}</td>
              <td>${(r.items || []).map(it => `${it.sku} • ${fmtNum(it.cantidad)}`).join("<br/>")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="firmas">
        <div>
          <div class="linea"></div>
          <div>Entregué conforme</div>
        </div>
        <div>
          <div class="linea"></div>
          <div>Recibí conforme</div>
        </div>
      </div>
    `;
    printDocument(titulo, html);
  };

  const xlsEntradas = () => {
    const rows = [];
    E.forEach((r) => {
      (r.items || []).forEach((it) => {
        rows.push({
          fecha: toISODate(r.fecha || r.createdAt),
          proveedor: r.proveedor || "",
          num: r.num || "",
          sku: it.sku || "",
          cantidad: Number(it.cantidad || 0) || 0,
        });
      });
    });
    exportXLS(`entradas_${from}_a_${to}.xls`, rows, [
      { key: "fecha", label: "Fecha", type: "text" },
      { key: "proveedor", label: "Proveedor", type: "text" },
      { key: "num", label: "Consec", type: "text" },
      { key: "sku", label: "SKU", type: "text" },            // SKU como TEXTO
      { key: "cantidad", label: "Cantidad", type: "number" },
    ]);
  };

  const xlsSalidas = () => {
    const rows = [];
    S.forEach((r) => {
      (r.items || []).forEach((it) => {
        rows.push({
          fecha: toISODate(r.fecha || r.createdAt),
          destino: r.destino || "",
          num: r.num || "",
          sku: it.sku || "",
          cantidad: Number(it.cantidad || 0) || 0,
        });
      });
    });
    exportXLS(`salidas_${from}_a_${to}.xls`, rows, [
      { key: "fecha", label: "Fecha", type: "text" },
      { key: "destino", label: "Destino", type: "text" },
      { key: "num", label: "Consec", type: "text" },
      { key: "sku", label: "SKU", type: "text" },            // SKU como TEXTO
      { key: "cantidad", label: "Cantidad", type: "number" },
    ]);
  };

  const xlsDiferencia = () => {
    exportXLS(`diferencia_${from}_a_${to}.xls`, diff, [
      { key: "sku", label: "SKU", type: "text" },            // SKU como TEXTO
      { key: "diferencia", label: "Diferencia", type: "number" },
    ]);
  };

  const printDiff = () => {
    const html = `
      <h1>Consolidado por SKU (Entradas - Salidas)</h1>
      <div class="meta">Rango: ${from} a ${to} · SKUs: ${diff.length}</div>
      <table>
        <thead><tr><th>SKU</th><th>Diferencia</th></tr></thead>
        <tbody>
          ${diff.map(r => `<tr><td>${r.sku}</td><td>${fmtNum(r.diferencia)}</td></tr>`).join("")}
        </tbody>
      </table>
      <div class="firmas">
        <div>
          <div class="linea"></div>
          <div>Elaboró</div>
        </div>
        <div>
          <div class="linea"></div>
          <div>Revisó</div>
        </div>
      </div>
    `;
    printDocument("Consolidado por SKU", html);
  };

  return (
    <div>
      <h2>Reportes</h2>
      <div style={{ marginBottom: 12 }}>
        <FiltrosFechas from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>

      {loading && <div style={{ padding: 12 }}>Cargando…</div>}

      {/* ENTRADAS */}
      <Panel
        title={`Entradas (${E.length})`}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => printES(E, "Entradas")}>Imprimir</button>
            <button type="button" onClick={xlsEntradas}>Exportar XLS</button>
          </div>
        }
      >
        {E.length === 0 ? <div>No hay entradas en el rango.</div> : renderTableES(E, "E")}
      </Panel>

      {/* SALIDAS */}
      <Panel
        title={`Salidas (${S.length})`}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => printES(S, "Salidas")}>Imprimir</button>
            <button type="button" onClick={xlsSalidas}>Exportar XLS</button>
          </div>
        }
      >
        {S.length === 0 ? <div>No hay salidas en el rango.</div> : renderTableES(S, "S")}
      </Panel>

      {/* DIFERENCIA */}
      <Panel
        title={`Consolidado por SKU (Entradas - Salidas) · ${diff.length} SKU`}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={printDiff}>Imprimir</button>
            <button type="button" onClick={xlsDiferencia}>Exportar XLS</button>
          </div>
        }
      >
        {diff.length === 0 ? (
          <div>No hay movimientos en el rango seleccionado.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>SKU</th><th>Diferencia</th></tr></thead>
            <tbody>
              {diff.map((r) => (
                <tr key={r.sku}>
                  <td>{r.sku}</td>
                  <td>{fmtNum(r.diferencia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
