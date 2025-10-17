import React, { useMemo, useRef, useState } from "react";

export default function BuscarSKU({ skus, onSelect }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const list = useMemo(()=>{
    const s = q.trim().toLowerCase();
    if(!s) return [];
    return (skus||[])
      .filter(x => (x.activo ?? true))
      .filter(x => String(x.sku).toLowerCase().includes(s) || String(x.nombre||"").toLowerCase().includes(s))
      .slice(0,20);
  }, [q, skus]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && list[0]) {
      e.preventDefault();
      onSelect(list[0]);
      setQ(""); setOpen(false);
    }
  };
  const onBlur = () => setTimeout(()=>setOpen(false), 120);

  return (
    <div style={{position:"relative"}}>
      <input
        ref={inputRef}
        placeholder={"Buscar por SKU o nombre (ej: \"Post\")"}
        value={q}
        onChange={(e)=>{ setQ(e.target.value); setOpen(true); }}
        onKeyDown={onKeyDown}
        onFocus={()=>setOpen(true)}
        onBlur={onBlur}
      />
      {open && list.length>0 && (
        <div style={{position:'absolute',left:0,right:0,top:'calc(100% + 4px)',background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,maxHeight:260,overflow:'auto',zIndex:10}}>
          {list.map((it,i)=>(
            <div
              key={i}
              style={{padding:"8px 10px",cursor:"pointer"}}
              onMouseDown={(e)=>{ e.preventDefault(); onSelect(it); setQ(""); setOpen(false); }}
            >
              <div><b>{it.sku}</b> — {it.nombre || "(sin nombre)"} <span className="badge">{it.unidad||"unidad"}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
