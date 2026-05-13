import { useEffect, useState } from "react";
import api from "../../../../services/api";
import { emitToast } from "../../../../services/uiEvents";

export function useEmpresaExecutiveStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/dashboard/stats")
      .then(({ data }) => setStats(data))
      .catch(() => emitToast("Não foi possível carregar o painel executivo.", "warning"))
      .finally(() => setLoading(false));
  }, []);

  return { stats, loading };
}
