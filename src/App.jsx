import React, { useState } from "react";
import { useAuth } from "./auth-context.jsx";
import BranchSelector from "./BranchSelector.jsx";
import InventoryCountApp from "./InventoryCountApp.jsx";
import { useBranch } from "./use-branch.js";

function AuthScreen({ email, password, onEmailChange, onPasswordChange, onSubmit }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await onSubmit();
    } catch (submitError) {
      setError(submitError?.message || "No fue posible iniciar sesion.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <section
          className="app-panel auth-hero"
          style={{
            background:
              "linear-gradient(135deg, rgba(233,136,40,0.98) 0%, rgba(247,167,88,0.96) 52%, rgba(255,247,239,0.95) 100%)",
          }}
        >
          <div className="app-chip auth-hero-chip">Inventario</div>
          <h1 className="app-title auth-hero-title">Levantamiento directo y rapido.</h1>

          <div className="auth-highlight-grid">
            <div className="auth-highlight-card">Catalogo SICAR</div>
            <div className="auth-highlight-card">Conteo por zonas</div>
            <div className="auth-highlight-card">Ventas y ajuste</div>
            <div className="auth-highlight-card">Historial listo</div>
          </div>
        </section>

        <section className="app-panel auth-card">
          <div className="auth-card-header">
            <div className="auth-logo">SM</div>
            <div>
              <div className="app-title auth-card-title">Inventario San Martin</div>
              <div className="auth-card-subtitle">Acceso</div>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <label className="app-label">Correo</label>
              <input
                type="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                className="app-input"
                placeholder="usuario@empresa.com"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="app-label">Contrasena</label>
              <input
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                className="app-input"
                placeholder="Tu clave de acceso"
                autoComplete="current-password"
              />
            </div>

            {error ? <div className="auth-error">{error}</div> : null}

            <button type="submit" className="app-button-primary auth-submit" disabled={submitting}>
              {submitting ? "Entrando..." : "Entrar al sistema"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="auth-shell">
      <section className="app-panel loading-card">
        <div className="app-chip">Preparando sesion</div>
        <h1 className="app-title">Cargando</h1>
      </section>
    </div>
  );
}

export default function App() {
  const { user, login, logout, loading } = useAuth();
  const { branchId, loading: branchLoading } = useBranch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (loading || branchLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return (
      <AuthScreen
        email={email}
        password={password}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={() => login(email, password)}
      />
    );
  }

  if (!branchId) {
    return <BranchSelector user={user} onLogout={logout} />;
  }

  return <InventoryCountApp user={user} branchId={branchId} onLogout={logout} />;
}
