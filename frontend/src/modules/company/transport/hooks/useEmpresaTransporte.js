import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../../services/api";
import { emitToast } from "../../../../services/uiEvents";

const PERIODOS_VALIDOS = new Set(["dia", "semana", "mes"]);

/** Segunda a domingo (data local) em YYYY-MM-DD. */
export function defaultWeekRangeLocal() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { data_inicio: ymd(monday), data_fim: ymd(sunday) };
}

function normalizePeriodoTransporte(v) {
  const p = String(v ?? "semana").trim().toLowerCase();
  return PERIODOS_VALIDOS.has(p) ? p : "semana";
}

/**
 * Estado e carregamento exclusivos do módulo Transporte (viagens, metas, alertas operacionais do período).
 * Não compartilha estado com outras páginas.
 */
export function useEmpresaTransporte() {
  const [periodoFiltro, setPeriodoFiltro] = useState("semana");
  const periodoApi = normalizePeriodoTransporte(periodoFiltro);

  const [viagensResumo, setViagensResumo] = useState(null);
  const [viagensLoading, setViagensLoading] = useState(true);

  const [comparacao, setComparacao] = useState(null);
  const [comparLoading, setComparLoading] = useState(true);

  const [planForm, setPlanForm] = useState(() => ({
    ...defaultWeekRangeLocal(),
    meta_esteril_ton: "",
    meta_rocha_ton: "",
  }));
  const [planSaving, setPlanSaving] = useState(false);

  const [alertasTransporte, setAlertasTransporte] = useState({
    veiculos_sem_capacidade: 0,
    custo_alto: false,
    meta_risco: false,
  });

  const loadViagensResumo = useCallback(async () => {
    setViagensLoading(true);
    try {
      const { data } = await api.get("/dashboard/viagens/resumo", {
        params: { periodo: periodoApi },
      });
      setViagensResumo({
        total_viagens_esteril: data?.total_viagens_esteril ?? 0,
        total_viagens_rocha: data?.total_viagens_rocha ?? 0,
        total_toneladas_esteril: data?.total_toneladas_esteril ?? 0,
        total_toneladas_rocha: data?.total_toneladas_rocha ?? 0,
      });
    } catch {
      setViagensResumo(null);
      emitToast("Não foi possível carregar o resumo de viagens.", "warning");
    } finally {
      setViagensLoading(false);
    }
  }, [periodoApi]);

  const loadAlertasTransporte = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/alertas", {
        params: { periodo: periodoApi },
      });
      setAlertasTransporte({
        veiculos_sem_capacidade: Number(data?.veiculos_sem_capacidade ?? 0),
        custo_alto: Boolean(data?.custo_alto),
        meta_risco: Boolean(data?.meta_risco),
      });
    } catch {
      setAlertasTransporte({ veiculos_sem_capacidade: 0, custo_alto: false, meta_risco: false });
    }
  }, [periodoApi]);

  const loadComparacao = useCallback(async () => {
    setComparLoading(true);
    try {
      const { data } = await api.get("/dashboard/viagens/comparacao");
      setComparacao({
        planejado_esteril: data?.planejado_esteril ?? 0,
        planejado_rocha: data?.planejado_rocha ?? 0,
        executado_esteril: data?.executado_esteril ?? 0,
        executado_rocha: data?.executado_rocha ?? 0,
        percentual_esteril: data?.percentual_esteril ?? 0,
        percentual_rocha: data?.percentual_rocha ?? 0,
        percentual_total: data?.percentual_total ?? 0,
      });
    } catch {
      setComparacao(null);
      emitToast("Não foi possível carregar planejado vs executado.", "warning");
    } finally {
      setComparLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadViagensResumo();
    void loadAlertasTransporte();
  }, [loadViagensResumo, loadAlertasTransporte]);

  useEffect(() => {
    void loadComparacao();
  }, [loadComparacao]);

  const submitPlanejamento = useCallback(
    async (e) => {
      e.preventDefault();
      setPlanSaving(true);
      try {
        await api.post("/dashboard/planejamento", {
          data_inicio: planForm.data_inicio,
          data_fim: planForm.data_fim,
          meta_esteril_ton: Number(planForm.meta_esteril_ton) || 0,
          meta_rocha_ton: Number(planForm.meta_rocha_ton) || 0,
        });
        emitToast("Planejamento salvo.", "success");
        await loadComparacao();
      } catch (err) {
        const msg = err?.response?.data?.message || "Não foi possível salvar o planejamento.";
        emitToast(msg, "warning");
      } finally {
        setPlanSaving(false);
      }
    },
    [planForm, loadComparacao]
  );

  const metaPlanejadaTotal = useMemo(
    () =>
      comparacao
        ? Number(comparacao.planejado_esteril || 0) + Number(comparacao.planejado_rocha || 0)
        : 0,
    [comparacao]
  );

  const executadoTotal = useMemo(
    () =>
      comparacao
        ? Number(comparacao.executado_esteril || 0) + Number(comparacao.executado_rocha || 0)
        : 0,
    [comparacao]
  );

  const barWidthPct = Math.min(100, Math.max(0, Number(comparacao?.percentual_total ?? 0)));

  const planVsExecPieStyle = useMemo(() => {
    if (!comparacao) return { background: "conic-gradient(#3f3f46 0% 100%)" };
    const plan = Math.max(0, metaPlanejadaTotal);
    const exec = Math.max(0, executadoTotal);
    if (plan <= 0 && exec <= 0) return { background: "conic-gradient(#3f3f46 0% 100%)" };
    if (plan <= 0) {
      return { background: "conic-gradient(#d97706 0 100%)" };
    }
    const pctExec = Math.min(100, (exec / plan) * 100);
    return {
      background: `conic-gradient(#d97706 0 ${pctExec}%, #3f3f46 ${pctExec}% 100%)`,
    };
  }, [comparacao, metaPlanejadaTotal, executadoTotal]);

  const temAlertasTransporte = useMemo(
    () =>
      alertasTransporte.veiculos_sem_capacidade > 0 ||
      alertasTransporte.meta_risco ||
      alertasTransporte.custo_alto,
    [alertasTransporte]
  );

  return {
    periodoFiltro,
    setPeriodoFiltro,
    viagensResumo,
    viagensLoading,
    comparacao,
    comparLoading,
    planForm,
    setPlanForm,
    planSaving,
    submitPlanejamento,
    alertasTransporte,
    temAlertasTransporte,
    metaPlanejadaTotal,
    executadoTotal,
    barWidthPct,
    planVsExecPieStyle,
  };
}
