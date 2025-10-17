// src/Salidas.jsx
import React, { useEffect, useState } from "react";
import { nowISO, pad } from "./utils.js";
import { registrarSalida, readCatalogs } from "./data-api.js";
import BuscarSKU from "./components/BuscarSKU.jsx";
import PesoBoxes from "./components/PesoBoxes.jsx";
import { extractSanMartinWeight, extractBasculaWeight } from "./utils.js";

/* ====== Reutilizamos el mismo patrón de Entradas ====== */
function ScanCodigosRow({ onAdd }) {
  const [sm, setSM] = React.useState("");
  const [bs, setBS] = React.useState("");
  const [msg, setMsg] = React.useState(null);

  const add = (w) => {
    const n = Number(w);
    if (!isFinite(n) || n <= 0) {
      setMsg({ t: "err", m: "Peso inválido." });
      return;
    }
    onAdd(n);
    setMsg({ t: "ok", m: `Caja agregada: ${n.toFixed(2)}` });
  };

  const trySM = () => {
    const r = extractSanMartinWeight(sm);
    if (!r.ok) return setMsg({ t: "err", m: r.error });
    add(r.weight);
    setSM("");
  };

  const tryBS = () => {
    const r = extractBasculaWeight(bs);
    if (!r.ok) return setMsg({ t: "err", m: r.error });
    add(r.weight);
    setBS("");
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
      <input
        placeholder="Código San Martín (54/52 dígitos)"
        value={sm}
        onChange={(e) => setSM(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); trySM(); } }}
        style={{ minWidth: 260, padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10 }}
      />
      <button type="button" onClick={trySM}>Agregar SM</button>

      <input
        placeholder="Código básculas (13 dígitos)"
        value={bs}
        onChange={(e) => setBS(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tryBS(); } }}
        style={{ minWidth: 220, padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10 }}
      />
      <button type="button" onClick={tryBS}>Agregar báscula</button>

      {msg && (
        <span style={{ color: msg.t === "err" ? "#b91c1c" : "#0369a1" }}>
          {msg.m}
        </span>
      )}
    </div>
  );
}

export default function Salidas({ branchId }) {
  const [fecha, setFecha] = useState(nowISO());
  const [destino, setDestino] = useState("");
  const [obs, setObs] = useState("");
  const [entregadoPor, setEntregadoPor] = useState("");
  const [skus, setSkus] = useState([]);
  const [destinos, setDestinos] = useState([]);
  const [items, setItems] = useState([{ sku: "", pesos: [0] }]);
  const [list, setList] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await readCatalogs(branchId);
      setSkus(data.skus || []);
      const nombres = (data.destinos || []).map(d => d.nombre);
      setDestinos(nombres);
      setDestino(prev => prev || nombres[0] || ""); // autoselección
    })();
  }, [branchId]);

  // Helpers de línea
  const toNum = (x) => Number(x ?? 0) || 0;
  const lineTotal = (it) => (it.pesos || []).reduce((s, x) => s + toNum(x), 0);

  // Acciones de tabla
  const addLineBelow = (idx) => {
    const arr = [...items];
    arr.splice(idx + 1, 0, { sku: "", pesos: [0] });
    setItems(arr);
  };
  const setSkuAt = (idx, sku) => {
    const arr = [...items];
    arr[idx].sku = sku;
    setItems(arr);
  };
  const setPesosAt = (idx, pesos) => {
    const arr = [...items];
    arr[idx].pesos = pesos;
    setItems(arr);
  };
  const removeLine = (i) => {
    const arr = items.slice();
    arr.splice(i, 1);
    setItems(arr.length ? arr : [{ sku: "", pesos: [0] }]);
  };

  // Validación similar a Entradas
  function validateSalida({ destino, items }) {
    if (!destino) return "Seleccione destino.";
    if (!items?.length) return "Agregue al menos una línea.";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const tot = lineTotal(it);
      if (tot > 0 && !it.sku) return `Falta SKU en la línea ${i + 1}.`;
      if (it.sku && tot <= 0) return `Falta peso (> 0) en la línea ${i + 1}.`;
    }
    const valid = items.filter(it => it.sku && lineTotal(it) > 0);
    if (!valid.length) return "Agregue al menos 1 línea válida con SKU y peso.";
    return null;
  }

  // timeout helper (10s)
  const withTimeout = (p, ms = 10000, msg = "Se excedió el tiempo de espera.") =>
    Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))
    ]);

  const registrar = async () => {
    const err = validateSalida({ destino, items });
    if (err) return alert(err);

    const lineas = items
      .filter(it => it.sku && lineTotal(it) > 0)
      .map(it => ({
        sku: it.sku,
        cantidad: lineTotal(it),
        pesos: (it.pesos || []).map(toNum),
      }));

    const num = `S-${pad((list[0]?.seq || 0) + 1)}`;
    const salida = { num, fecha, destino, entregadoPor, obs, items: lineas };

    try {
      setSaving(true);
      await withTimeout(registrarSalida(branchId, salida), 10000, "No hay respuesta del servidor (timeout).");
      setList([{ seq: (list[0]?.seq || 0) + 1, ...salida }, ...list]);

      // reset
      setFecha(nowISO());
      setDestino(destinos[0] || "");
      setEntregadoPor("");
      setObs("");
      setItems([{ sku: "", pesos: [0] }]);

      alert("Salida registrada ✅");
    } catch (e) {
      console.error("[Salidas] registrarSalida ERROR:", e);
      alert(`No se pudo registrar la salida:\n${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2>Nueva Salida</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(220px, 1fr))", gap: 12 }}>
        <div>
          <div>Fecha</div>
          <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div>
          <div>Destino</div>
          <select value={destino} onChange={e => setDestino(e.target.value)}>
            <option value="">— seleccionar —</option>
            {destinos.map((d, i) => <option key={i} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <div>Entregado por</div>
          <input value={entregadoPor} onChange={e => setEntregadoPor(e.target.value)} />
        </div>
        <div>
          <div>Notas</div>
          <input value={obs} onChange={e => setObs(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>SKU / Nombre</th>
              <th>Unidad</th>
              <th>Peso (cajitas)</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const meta = (skus || []).find(s => s.sku === it.sku) || {};
              const total = (it.pesos || []).reduce((s, x) => s + (Number(x) || 0), 0);
              return (
                <tr key={i}>
                  <td>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <BuscarSKU skus={skus} onSelect={(s) => setSkuAt(i, s.sku)} />
                      {it.sku && <span className="badge">{it.sku}</span>}
                      {meta?.nombre && <span>{meta.nombre}</span>}
                    </div>
                  </td>
                  <td>{meta.unidad || "—"}</td>
                  <td style={{ overflow: "visible" }}>
                    <PesoBoxes
                      idPrefix={`sal-${i}-`}
                      values={it.pesos}
                      onChange={(v) => setPesosAt(i, v)}
                    />
                    {/* Lector de códigos (SM 54/52 y Báscula 13) */}
                    <ScanCodigosRow
                      onAdd={(w) => {
                        const arr = Array.isArray(it.pesos) ? it.pesos.slice() : [];
                        arr.push(Number(w));
                        setPesosAt(i, arr);
                      }}
                    />
                  </td>
                  <td>{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td>
                    <button type="button" onClick={() => addLineBelow(i)}>+ debajo</button>{" "}
                    <button type="button" onClick={() => removeLine(i)}>Quitar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={registrar} disabled={saving}>
            {saving ? "Guardando…" : "Registrar Salida"}
          </button>
        </div>
      </div>
    </div>
  );
}
