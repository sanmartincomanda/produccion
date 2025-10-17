// src/BranchSelector.jsx
import React, { useState } from "react";
import { setUserBranch } from "./data-api.js";
import { useAuth } from "./auth-context.jsx";

const OPCIONES = [
  "Carnes Amparito Tienda",
  "CEDI (Cr.Amp.)",
  "Masaya gold",
  "Masaya Mercado",
  "Granada",
  "Produccion",
];
const DEMO_PROVEEDORES = [
  { nombre: "Industrial Comercial San Martin SA" },
  { nombre: "Cargill" },
  { nombre: "Monisa" },
  { nombre: "Matadero Cacique" },
  { nombre: "Joksan Reyes" },
  { nombre: "Sigma alimentos" },
  { nombre: "Roger Montenegro" },
  { nombre: "Delmor" },
  { nombre: "Traspaso (Carnes Amparito)" },
  { nombre: "Masaya Gold" }
];

const DEMO_DESTINOS = [
  { nombre: "Carnes Amparito Tienda" },
  { nombre: "GRANADA" },
  { nombre: "CEDI (Car.Amp.)" },
  { nombre: "Masaya gold" },
  { nombre: "Masaya Mercado" }
];

export default function BranchSelector() {
  const { user } = useAuth();
  const [branchId, setBranchId] = useState("");

  const guardar = async () => {
    try {
      if (!user?.uid) throw new Error("Usuario no autenticado");
      await setUserBranch(user.uid, branchId);  // <-- PASA STRINGS!
      alert("Sucursal asignada ✅. Recarga o entra de nuevo.");
      // Si tienes un hook useBranch con onSnapshot, se actualizará solo;
      // si no, fuerza reload o redirige.
      window.location.reload();
    } catch (e) {
      console.error("[BranchSelector] setUserBranch error:", e);
      alert("No se pudo asignar la sucursal: " + (e?.message || e));
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h3>Selecciona una sucursal</h3>
      <select
        value={branchId}
        onChange={(e) => setBranchId(e.target.value)}
        style={{ width: "100%", padding: 8, marginTop: 8 }}
      >
        <option value="">— Seleccionar —</option>
        {OPCIONES.map((op) => (
          <option key={op} value={op}>{op}</option>
        ))}
      </select>

      <button
        type="button"
        onClick={guardar}
        style={{ marginTop: 12, padding: "6px 10px" }}
        disabled={!branchId}
      >
        Guardar sucursal
      </button>
    </div>
  );
}
