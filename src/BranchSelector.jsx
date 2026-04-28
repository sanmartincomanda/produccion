import React, { useState } from "react";
import { setUserBranch } from "./data-api.js";

const BRANCH_OPTIONS = [
  "Carnes Amparito Tienda",
  "CEDI (Cr.Amp.)",
  "Masaya gold",
  "Masaya Mercado",
  "Granada",
  "Produccion",
];

export default function BranchSelector({ user, onLogout }) {
  const [branchId, setBranchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSave = async () => {
    if (!user?.uid || !branchId) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      await setUserBranch(user.uid, branchId);
      window.location.reload();
    } catch (error) {
      setMessage(error?.message || "No se pudo asignar la sucursal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <section
          className="app-panel auth-hero"
          style={{
            background:
              "linear-gradient(135deg, rgba(53,125,191,0.98) 0%, rgba(71,138,198,0.96) 52%, rgba(244,249,254,0.95) 100%)",
          }}
        >
          <div className="app-chip auth-hero-chip">Configuracion inicial</div>
          <h1 className="app-title auth-hero-title">Selecciona la sucursal que usara este modulo de inventario.</h1>
          <p className="auth-hero-copy">
            La sucursal define el catalogo, los folios y el historial que se mostraran dentro del levantamiento.
          </p>
        </section>

        <section className="app-panel auth-card">
          <div className="auth-card-header">
            <div className="auth-logo">BR</div>
            <div>
              <div className="app-title auth-card-title">Sucursal activa</div>
              <div className="auth-card-subtitle">{user?.email || "Sesion activa"}</div>
            </div>
          </div>

          <div className="auth-form">
            <div>
              <label className="app-label">Sucursal</label>
              <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="app-select">
                <option value="">Seleccionar sucursal</option>
                {BRANCH_OPTIONS.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </div>

            {message ? <div className="auth-error">{message}</div> : null}

            <button type="button" className="app-button-primary auth-submit" onClick={handleSave} disabled={!branchId || saving}>
              {saving ? "Guardando..." : "Guardar sucursal"}
            </button>

            <button type="button" className="app-button-ghost auth-ghost" onClick={onLogout}>
              Cambiar usuario
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
