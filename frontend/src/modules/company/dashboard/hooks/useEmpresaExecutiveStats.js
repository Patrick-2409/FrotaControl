import { useEffect, useState } from "react";
import api from "../../../../services/api";
import { emitToast } from "../../../../services/uiEvents";

export function useEmpresaExecutiveStats() {
  const [stats, setStats] = useState(null);
  const [comparacao, setComparacao] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([api.get("/dashboard/stats"), api.get("/dashboard/viagens/comparacao")]).then((results) => {
      if (cancelled) return;
      const [s, c] = results;
      if (s.status === "fulfilled") {
        setStats(s.value.data);
      } else {
        setStats(null);
        emitToast("Não foi possível carregar o painel executivo.", "warning");
      }
      if (c.status === "fulfilled") {
        setComparacao(c.value.data);
      } else {
        setComparacao(null);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, comparacao, loading };
}
