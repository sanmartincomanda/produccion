import React, { useEffect, useState } from "react";
import { DEFAULT_LOGIN_BRANCHES, loadLoginBranchOptions, normalizeLoginBranchOptions } from "./branches.js";
import { setUserBranch } from "./data-api.js";

export default function BranchSelector({ user, onLogout }) {
  const [branchId, setBranchId] = useState("");
  const [branchOptions, setBranchOptions] = useState(() => normalizeLoginBranchOptions(DEFAULT_LOGIN_BRANCHES));
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let alive = true;

    const loadBranchOptions = async () => {
      setLoadingBranches(true);

      try {
        if (!alive) return;
        const normalizedOptions = await loadLoginBranchOptions();
        setBranchOptions(normalizedOptions.length ? normalizedOptions : normalizeLoginBranchOptions(DEFAULT_LOGIN_BRANCHES));
      } catch {
        if (!alive) return;
        setBranchOptions(normalizeLoginBranchOptions(DEFAULT_LOGIN_BRANCHES));
      } finally {
        if (!alive) return;
        setLoadingBranches(false);
      }
    };

    loadBranchOptions();

    return () => {
      alive = false;
    };
  }, []);

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
            La lista de sucursales se lee desde Firestore para que puedas administrarla sin tocar el codigo.
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
              <select
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                className="app-select"
                disabled={loadingBranches}
              >
                <option value="">Seleccionar sucursal</option>
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.label}
                  </option>
                ))}
              </select>
            </div>

            {message ? <div className="auth-error">{message}</div> : null}

            <button
              type="button"
              className="app-button-primary auth-submit"
              onClick={handleSave}
              disabled={!branchId || saving || loadingBranches}
            >
              {loadingBranches ? "Cargando sucursales..." : saving ? "Guardando..." : "Guardar sucursal"}
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
