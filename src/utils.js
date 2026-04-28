export function printDocument(title, htmlBody){
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
  <style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#16314a;margin:24px;background:#f7fbff}
  h1,h2{margin:0}
  p{margin:0}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th,td{border:1px solid #d8e2ec;padding:8px 10px}
  thead th{background:#eef4fa;text-align:left;color:#12324e}
  .line{border-bottom:1px solid #16314a;height:48px}
  .small{font-size:12px;margin-top:6px;text-align:center;color:#456781}
  .report-shell{display:grid;gap:18px}
  .report-header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:24px;border-radius:22px;background:linear-gradient(135deg,#246fb0 0%,#4f94cb 52%,#eaf3fb 100%);color:#fff}
  .report-kicker{font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;opacity:.85}
  .report-subtitle{margin-top:10px;max-width:560px;line-height:1.6;color:rgba(240,248,255,.95)}
  .report-status{padding:10px 14px;border-radius:999px;font-weight:700;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.2)}
  .report-status-final{color:#fff}
  .report-status-draft{color:#11304c}
  .report-meta-grid,.report-summary-grid{display:grid;gap:12px;grid-template-columns:repeat(4,minmax(0,1fr))}
  .report-meta-card,.report-summary-card{padding:16px;border-radius:18px;border:1px solid #dbe7f2;background:#fff}
  .report-meta-card span,.report-summary-card span{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#5a7590}
  .report-meta-card strong,.report-summary-card strong{display:block;margin-top:8px;font-size:16px;color:#12324e}
  .report-summary-card strong{font-size:20px}
  .report-note,.report-alert,.report-section{padding:18px;border-radius:20px;border:1px solid #dbe7f2;background:#fff}
  .report-alert{background:#fff6ec;border-color:#f2d2ab;color:#9a5a10}
  .report-section-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}
  .report-inline-stats{display:flex;gap:8px;flex-wrap:wrap}
  .report-inline-stats span{padding:8px 10px;border-radius:999px;background:#f1f7fd;border:1px solid #dbe7f2;font-size:12px;font-weight:700;color:#1e4a70}
  .report-empty{padding:20px;border-radius:16px;border:1px dashed #c9d8e6;background:#f8fbfe;color:#5a7590;text-align:center}
  .report-signatures{display:flex;gap:32px;margin-top:12px}
  .report-signature{flex:1}
  @media print{
    body{margin:0;background:#fff}
    .report-header,.report-section,.report-meta-card,.report-summary-card,.report-note,.report-alert{break-inside:avoid}
  }
  @media (max-width:760px){
    .report-header,.report-section-head,.report-signatures{flex-direction:column}
    .report-meta-grid,.report-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  }
  @media print{@page{size:A4;margin:14mm}}
  </style></head><body>${htmlBody||"<p>(Sin contenido)</p>"}<script>
  window.onload=function(){try{window.focus();window.print();}catch(e){} setTimeout(()=>window.close&&window.close(),300);}
  </script></body></html>`;

  try{
    const frame = document.createElement('iframe');
    frame.style.position='fixed'; frame.style.right='0'; frame.style.bottom='0';
    frame.style.width='0'; frame.style.height='0'; frame.style.border='0';
    document.body.appendChild(frame);
    const doc = frame.contentWindow || frame.contentDocument;
    const win = doc.document || doc;
    win.open(); win.write(html); win.close();
    setTimeout(()=>{ frame.parentNode && frame.parentNode.removeChild(frame); }, 2000);
    return;
  }catch(e){
    const w = window.open('', '_blank');
    if(!w){ alert('Permite popups para imprimir.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }
}
export function nowISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

// Rellena con ceros a la izquierda
export function pad(n, w = 4) {
  return String(n).padStart(w, "0");
}
export function isDigits(s) {
  return typeof s === "string" && /^[0-9]+$/.test(s);
}


/**
 * San Martín: 54 dígitos (a veces 52). 
 * Regla original: leer posiciones 32..34 (1-based) → 3 dígitos → XX.Y
 * - Si son 54 dígitos: indices 0-based = 31..33
 * - Si llegan 52 dígitos (variante): desplazamos -2 → 29..31
 * Devuelve { ok, weight, error }
 */
export function extractSanMartinWeight(code) {
  const clean = (code || "").trim();
  if (!isDigits(clean)) return { ok: false, error: "Código inválido (solo dígitos)." };

  let start;
  if (clean.length === 54) {
    start = 31;
  } else if (clean.length === 52) {
    start = 29;
  } else {
    return { ok: false, error: `Longitud inválida (${clean.length}). Se espera 54 o 52.` };
  }

  const trio = clean.slice(start, start + 3);
  if (!isDigits(trio)) return { ok: false, error: "Segmento de peso no encontrado." };

  const val = Number(`${trio.slice(0, 2)}.${trio.slice(2)}`);
  if (!isFinite(val) || val <= 0) return { ok: false, error: "Peso no válido." };

  return { ok: true, weight: val };
}


/**
 * Básculas: 13 dígitos.
 * Peso = posiciones 8..11 (1-based) → 0-based = 7..10 → 4 dígitos "AABB" ⇒ AA.BB
 * Devuelve { ok, weight, error }
 */
export function extractBasculaWeight(code) {
  const clean = (code || "").trim();
  if (!isDigits(clean)) return { ok: false, error: "Código inválido (solo dígitos)." };
  if (clean.length !== 13) return { ok: false, error: `Longitud inválida (${clean.length}). Se espera 13.` };

  const seg = clean.slice(7, 11);
  if (!isDigits(seg)) return { ok: false, error: "Segmento de peso no encontrado." };

  const val = Number(`${seg.slice(0, 2)}.${seg.slice(2)}`);
  if (!isFinite(val) || val <= 0) return { ok: false, error: "Peso no válido." };
  return { ok: true, weight: val };
}
export function legacyItemTotal(it){
  if (Array.isArray(it.pesos)) return it.pesos.reduce((s,x)=>s+(Number(x)||0),0);
  return Number(it.cantidad||0);
}

export function csvToRows(text){ return text.split(/\r?\n/).map(l=>l.split(',')); }
export function parseSKUsCSV(text){
  const rows = csvToRows(text).filter(r=>r.some(x=>String(x||'').trim()!==''));
  if(!rows.length) return [];
  const header = rows[0].map(h=>String(h).trim().toLowerCase());
  return rows.slice(1).map(r=>{
    const obj = Object.fromEntries(header.map((h,i)=>[h, r[i]!==undefined? String(r[i]).trim(): '' ]));
    return { sku: obj.sku||'', nombre: obj.nombre||'', unidad: obj.unidad||'unidad', activo: obj.activo===''? 1 : Number(obj.activo||1) };
  }).filter(x=>x.sku && x.nombre);
  // Solo dígitos


}
