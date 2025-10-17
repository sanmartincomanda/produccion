// src/use-branch.js
import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export function useBranch() {
  const [branchId, setBranchId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let resolved = false;

    const finish = (bId) => {
      if (!alive) return;
      resolved = true;
      setBranchId(bId ?? null);
      setLoading(false);
    };

    const run = async () => {
      try {
        // 1) esperar a que Auth inicialice una sola vez (sin listener)
        const waitForAuth = () => new Promise((resolve) => {
          const u = auth.currentUser;
          if (u) return resolve(u);
          const unsub = auth.onAuthStateChanged((user) => {
            unsub();
            resolve(user);
          });
        });

        const user = await waitForAuth(); // una única espera
        if (!user) return finish(null);

        // 2) leer users/{uid} una sola vez
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        finish(snap.exists() ? snap.data().branchId : null);
      } catch (e) {
        console.error("[useBranch] error:", e);
        finish(null);
      }
    };

    // timeout duro de 7s para no dejar la UI colgada
    const t = setTimeout(() => { if (!resolved) finish(null); }, 7000);
    run();

    return () => { alive = false; clearTimeout(t); };
  }, []);

  return { branchId, loading };
}
