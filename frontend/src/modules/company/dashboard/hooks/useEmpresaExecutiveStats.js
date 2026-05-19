import { useCallback, useEffect, useMemo, useState } from "react";
import api, { extractApiErrorMessage } from "../../../../services/api";
import { emitToast } from "../../../../services/uiEvents";
import {
  readExecutivePeriodo,
  writeExecutivePeriodo,
} from "../lib/executivePeriodStorage";

function countTipo(rows, tipo) {
  if (!Array.isArray(rows)) return 0;
  const hit = rows.find((r) => r?.tipo === tipo);
  return Number(hit?.total || 0);
}

/**
 * Indicadores consolidados do painel executivo com filtro global de período.
 */
export function useEmpresaExecutiveStats() {
  const [periodo, setPeriodoState] = useState(readExecutivePeriodo);
  const [stats, setStats] = useState(null);
  const [combustivel, setCombustivel] = useState(null);
  const [viagens, setViagens] = useState(null);
  const [planejamento, setPlanejamento] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);

  const setPeriodo = useCallback((next) => {
    setPeriodoState(next);
    writeExecutivePeriodo(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatsError(null);

    const periodoParams = { periodo };

    Promise.allSettled([
      api.get("/dashboard/stats", { params: periodoParams }),
      api.get("/dashboard/combustiveis/resumo", { params: periodoParams }),
      api.get("/dashboard/viagens/resumo", { params: periodoParams }),
      api.get("/dashboard/planejamento/atual"),
    ]).then((results) => {
      if (cancelled) return;
      const [s, c, v, p] = results;

      if (s.status === "fulfilled") setStats(s.value.data);
      else {
        setStats(null);
        const msg =
          extractApiErrorMessage(s.reason) ||
          "Não foi possível carregar o resumo operacional.";
        setStatsError(msg);
        emitToast(msg, "warning");
      }

      if (c.status === "fulfilled") setCombustivel(c.value.data);
      else setCombustivel(null);

      if (v.status === "fulfilled") setViagens(v.value.data);
      else setViagens(null);

      if (p.status === "fulfilled") setPlanejamento(p.value.data?.planejamento ?? null);
      else setPlanejamento(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [periodo]);

  const summary = useMemo(() => {
    const porTipoPeriodo = stats?.por_tipo_semana ?? stats?.por_tipo;
    const tonEsteril = Number(viagens?.total_toneladas_esteril || 0);
    const tonRocha = Number(viagens?.total_toneladas_rocha || 0);
    const toneladas = tonEsteril + tonRocha;
    const metaEsteril = Number(planejamento?.meta_esteril_ton || 0);
    const metaRocha = Number(planejamento?.meta_rocha_ton || 0);
    const metaTotal = metaEsteril + metaRocha;
    const atingimento =
      periodo === "semana" && metaTotal > 0 ? (toneladas / metaTotal) * 100 : null;

    return {
      periodo,
      transporte: {
        toneladas,
        atingimento,
        metaTotal: periodo === "semana" ? metaTotal : 0,
      },
      combustivel: {
        valor: Number(combustivel?.total_valor || 0),
        litros: Number(combustivel?.total_litros || 0),
        media: combustivel?.preco_medio_litro != null ? Number(combustivel.preco_medio_litro) : null,
      },
      parteDiaria: {
        registros: countTipo(porTipoPeriodo, "parte_diaria"),
      },
      frota: {
        veiculosAtivos: Number(stats?.veiculos_ativos || 0),
      },
      pessoas: {
        motoristasAtivos: Number(stats?.motoristas_ativos || 0),
      },
    };
  }, [stats, combustivel, viagens, planejamento, periodo]);

  return { stats, summary, loading, periodo, setPeriodo, statsError };
}
