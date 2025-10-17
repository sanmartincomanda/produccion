// src/App.jsx
import React, { useState } from "react";
import { useAuth } from "./auth-context.jsx";
import { useBranch } from "./use-branch.js";
import Catalogos from "./Catalogos.jsx";
import Entradas from "./Entradas.jsx";
import Salidas from "./Salidas.jsx";
import Reportes from "./Reportes.jsx";
import BranchSelector from "./BranchSelector.jsx";

function TabBtn({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 6,
        border: "none",
        background: active ? "#0f766e" : "#e2e8f0",
        color: active ? "#fff" : "#1e293b",
        cursor: "pointer",
        fontWeight: 500
      }}
    >
      {children}
    </button>
  );
}

export default function App() {
  // 👇 TODOS los hooks SIEMPRE al tope, sin returns antes
  const { user, login, logout, loading } = useAuth();
  const { branchId, loading: loadingBranch } = useBranch();

  const [tab, setTab] = useState("catalogos");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const isLoading = loading || loadingBranch;

  // 👇 Render condicional pero sin alterar el número de hooks
  let body = null;

  if (isLoading) {
    body = <div style={{ padding: 24 }}>Cargando…</div>;
  } else if (!user) {
    body = (
      <div style={{ padding: 24, maxWidth: 400 }}>
        <h2>Inicia sesión</h2>
        <div style={{ display: "grid", gap: 8 }}>
          <input
            placeholder="Correo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            placeholder="Contraseña"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          <button
            type="button"
            onClick={async () => {
              try {
                await login(email, pass);
              } catch (e) {
                alert(e.message);
              }
            }}
          >
            Entrar
          </button>
        </div>
      </div>
    );
  } else if (!branchId) {
    body = <BranchSelector />;
  } else {
    body = (
      <div style={{ fontFamily: "system-ui, Arial", color: "#111827" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            background: "#f8fafc"
          }}
        >
          <strong style={{ fontSize: 18 }}>Inventario San Martín</strong>
          <nav style={{ display: "flex", gap: 8, marginLeft: 16 }}>
            <TabBtn active={tab === "catalogos"} onClick={() => setTab("catalogos")}>
              Catálogos
            </TabBtn>
            <TabBtn active={tab === "entradas"} onClick={() => setTab("entradas")}>
              Entradas
            </TabBtn>
            <TabBtn active={tab === "salidas"} onClick={() => setTab("salidas")}>
              Salidas
            </TabBtn>
            <TabBtn active={tab === "reportes"} onClick={() => setTab("reportes")}>
              Reportes
            </TabBtn>
          </nav>
          <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#334155" }}>
              {user?.email} · Sucursal: <b>{branchId || "N/D"}</b>
            </span>
            <button
              type="button"
              onClick={logout}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#fff"
              }}
            >
              Salir
            </button>
          </div>
        </header>

        <main style={{ padding: 16 }}>
          {tab === "catalogos" && <Catalogos branchId={branchId} />}
          {tab === "entradas" && <Entradas branchId={branchId} />}
          {tab === "salidas" && <Salidas branchId={branchId} />}
          {tab === "reportes" && <Reportes branchId={branchId} />}
        </main>
      </div>
    );
  }

  return body;
}