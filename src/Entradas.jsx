import React, { useEffect, useState } from "react";

import { nowISO, pad } from "./utils.js";

import { registrarEntrada, readCatalogs } from "./data-api.js";

import BuscarSKU from "./components/BuscarSKU.jsx";

import PesoBoxes from "./components/PesoBoxes.jsx";

import { extractSanMartinWeight, extractBasculaWeight } from "./utils.js";



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
const cleanSM = sm.replace(/\D/g, "");
const r = extractSanMartinWeight(cleanSM); // Usa la cadena limpia aquí
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

export default function Entradas({ branchId }){
  const [fecha, setFecha] = useState(nowISO());
  const [proveedor, setProveedor] = useState("");
  const [obs, setObs] = useState("");
  const [recibidoPor, setRecibidoPor] = useState("");
  const [skus, setSkus] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [items, setItems] = useState([{ sku:"", pesos:[0] }]);
  const [list, setList] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(()=> {
    (async()=>{
      const data = await readCatalogs(branchId);
      setSkus(data.skus||[]);
      const nombres = (data.proveedores||[]).map(p=>p.nombre);
    setProveedores(nombres);
    setProveedor(prev => prev || nombres[0] || ""); // autoselecció
    })();
  }, [branchId]);

  const legacyItemTotal = (it) => (it.pesos||[]).reduce((s,x)=> s+(Number(x)||0),0);



  const addLineBelow = (idx) => { const arr=[...items]; arr.splice(idx+1,0,{sku:"",pesos:[0]}); setItems(arr); };
  const setSkuAt = (idx, sku) => { const arr=[...items]; arr[idx].sku=sku; setItems(arr); };
  const setPesosAt = (idx, pesos) => { const arr=[...items]; arr[idx].pesos=pesos; setItems(arr); };
  const removeLine = (i) => { const arr=items.slice(); arr.splice(i,1); setItems(arr.length?arr:[{sku:"",pesos:[0]}]); };

const registrar = async () => {
  const err = validateEntrada({ proveedor, items });
  if (err) return alert(err);

  // Normaliza líneas válidas (pesos numéricos)
  const lineas = items
    .filter(it => it.sku && lineTotal(it) > 0)
    .map(it => ({
      sku: it.sku,
      cantidad: lineTotal(it),
      pesos: (it.pesos || []).map(toNum),
    }));

  const num = `E-${pad((list[0]?.seq || 0) + 1)}`;
  const entrada = { num, fecha, proveedor, recibidoPor, obs, items: lineas };

  console.log("[Entradas] Registrando…", { branchId, entrada });



  try {

    setSaving(true);

    // ⏱️ si Firestore no responde, forzamos error a los 10s

    await withTimeout(registrarEntrada(branchId, entrada), 10000, "No hay respuesta del servidor (timeout).");

    console.log("[Entradas] OK");

    setList([{ seq: (list[0]?.seq || 0) + 1, ...entrada }, ...list]);



    // reset

    setFecha(nowISO());

    setProveedor(proveedores[0] || "");

    setRecibidoPor("");

    setObs("");

    setItems([{ sku: "", pesos: [0] }]);



    alert("Entrada registrada ✅");

  } catch (e) {

    console.error("[Entradas] registrarEntrada ERROR:", e);

    alert(`No se pudo registrar la entrada:\n${e?.message || e}`);

  } finally {

    setSaving(false);

  }

};

const toNum = (x) => Number(x ?? 0) || 0;

const lineTotal = (it) => (it.pesos || []).reduce((s, x) => s + toNum(x), 0);



function validateEntrada({ proveedor, items }) {

  if (!proveedor) return "Seleccione proveedor.";

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

  return (

    <div>

      <h2>Nueva Entrada</h2>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4, minmax(220px, 1fr))",gap:12}}>

        <div><div>Fecha</div><input type="datetime-local" value={fecha} onChange={e=>setFecha(e.target.value)} /></div>

        <div>

          <div>Proveedor</div>

          <select value={proveedor} onChange={e=>setProveedor(e.target.value)}>

            <option value="">— seleccionar —</option>

            {proveedores.map((p,i)=><option key={i} value={p}>{p}</option>)}

          </select>

        </div>

        <div><div>Recibido por</div><input value={recibidoPor} onChange={e=>setRecibidoPor(e.target.value)} /></div>

        <div><div>Notas</div><input value={obs} onChange={e=>setObs(e.target.value)} /></div>

      </div>



      <div style={{marginTop:16}}>

        <table className="table">

          <thead><tr><th>SKU / Nombre</th><th>Unidad</th><th>Peso (cajitas)</th><th>Total</th><th></th></tr></thead>

          <tbody>

            {items.map((it, i) => {

              const meta = (skus||[]).find(s=>s.sku===it.sku) || {};

              const total = (it.pesos||[]).reduce((s,x)=>s+(Number(x)||0),0);

              return (

                <tr key={i}>

                  <td>

                    <div style={{display:"flex",gap:8,alignItems:"center"}}>

                      <BuscarSKU skus={skus} onSelect={(s)=> setSkuAt(i, s.sku)} />

                      {it.sku && <span className="badge">{it.sku}</span>}

                      {meta?.nombre && <span>{meta.nombre}</span>}

                    </div>

                  </td>

                  <td>{meta.unidad||"—"}</td>

                  <td>

  <PesoBoxes

    idPrefix={`ent-${i}-`}

    values={it.pesos}

    onChange={(v) => setPesosAt(i, v)}

  />

  {/* 👇 Lector de códigos (SM 54/52 y Báscula 13) */}

  <ScanCodigosRow

    onAdd={(w) => {

      const arr = Array.isArray(it.pesos) ? it.pesos.slice() : [];

      arr.push(Number(w));

      setPesosAt(i, arr);

    }}

  />

</td>



                 

                  <td>{total.toLocaleString(undefined,{maximumFractionDigits:2})}</td>

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
   {saving ? "Guardando…" : "Registrar Entrada"}
</button>
        </div>
      </div>
    </div>
  );
}