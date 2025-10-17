import React, { useMemo, useState } from "react";
import { extractSanMartinWeight, extractBasculaWeight } from "../utils.js";


export default function PesoBoxes({ values, onChange, max=150, idPrefix="" }){
  const [msg, setMsg] = useState(null);
  const total = useMemo(()=> (values||[]).reduce((s,x)=> s + (Number(x)||0), 0), [values]);

  const add = () => onChange([...(values||[]), 0].slice(0, max));
  const set = (i, v) => { const arr=[...(values||[])]; arr[i]=v; onChange(arr); };
  const remove = (i) => { const arr=(values||[]).slice(); arr.splice(i,1); onChange(arr); };
  const removeLast = () => { if((values?.length||0)===0) return; onChange((values||[]).slice(0,-1)); };
const tryAddFromSM = () => {
  const res = extractSanMartinWeight(barcodeSM);
  if (!res.ok) { setMsg({ type: "err", text: res.error }); return; }
  addWeight(res.weight);
  setBarcodeSM("");
};

const tryAddFromBS = () => {
  const res = extractBasculaWeight(barcodeBS);
  if (!res.ok) { setMsg({ type: "err", text: res.error }); return; }
  addWeight(res.weight);
  setBarcodeBS("");
};
  const onKey = (i, e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if ((values?.length || 0) < max) {
        add();
        setTimeout(() => {
          const el = document.getElementById(`${idPrefix}peso-${i+1}`);
          el?.focus(); el?.select();
        }, 20);
      }
    }
    if ((e.key === "Backspace" || e.key === "Delete") && String(values?.[i] ?? "").trim() === "") {
      e.preventDefault();
      remove(i);
      setTimeout(() => {
        const prev = document.getElementById(`${idPrefix}peso-${Math.max(0, i-1)}`);
        prev?.focus(); prev?.select();
      }, 10);
    }
    if (e.key === "Escape") { set(i, ""); e.preventDefault(); }
  };

  return (
    <div>
      <div className="peso-grid">
        {(values||[]).map((v,i)=>(
          <div className="peso-box" key={i} style={{position:"relative"}}>
            <input
              id={`${idPrefix}peso-${i}`}
              type="number"
              step="any"
              value={v}
              onChange={(e)=>set(i, e.target.value)}
              onKeyDown={(e)=>onKey(i,e)}
            />
            <button
              type="button" title="Eliminar cajita" onClick={()=>remove(i)}
              style={{position:"absolute", top:-8, right:-8, width:22, height:22, borderRadius:11, border:"1px solid #e5e7eb", background:"#fff", lineHeight:"20px", fontSize:12}}
            >×</button>
          </div>
        ))}
      </div>
      <div className="actions" style={{marginTop:8, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
        <button type="button" onClick={add}>+ Caja</button>
        <button type="button" onClick={removeLast}>Quitar última</button>
        <button type="button" onClick={()=>onChange([])}>Limpiar todas</button>
        {(values||[]).length>0 && <span className="badge">Cajas: {(values||[]).length}</span>}
        <span className="badge">Total: {total.toLocaleString(undefined,{maximumFractionDigits:2})}</span>
      </div>
      {msg && <div className="helper" style={{color: msg.type==="err"?"#b91c1c":"#0369a1", marginTop:6}}>{msg.text}</div>}
    </div>
  );
}
