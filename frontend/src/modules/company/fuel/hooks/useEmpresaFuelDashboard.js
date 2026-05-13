import { useCallback, useEffect, useMemo, useState } from "react";
import api, { extractApiErrorMessage } from "../../../../services/api";
import { emitToast } from "../../../../services/uiEvents";
import { buildConsumoPorVeiculoPie } from "../charts/fuelPie";

const PERIODOS_API_COMBUSTIVEL = new Set(["dia", "semana", "mes", "ano"]);

export function normalizePeriodoCombustivel(v) {
  const p = String(v ?? "mes").trim().toLowerCase();
  return PERIODOS_API_COMBUSTIVEL.has(p) ? p : "mes";
}

/**
 * Estado exclusivo do módulo Combustível (sem vínculo com filtros de transporte).
 */
export function useEmpresaFuelDashboard() {
  const [periodo, setPeriodo] = useState("mes");
  const [filtroVeiculoId, setFiltroVeiculoId] = useState("");
  const [filtroMotoristaId, setFiltroMotoristaId] = useState("");
  const [veiculosOpt, setVeiculosOpt] = useState([]);
  const [motoristasOpt, setMotoristasOpt] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [totalGeralAno, setTotalGeralAno] = useState(null);

  const loadResumo = useCallback(async () => {
    setLoading(true);
    const periodoApi = normalizePeriodoCombustivel(periodo);
    const vid = filtroVeiculoId === "" ? null : Number(filtroVeiculoId);
    const mid = filtroMotoristaId === "" ? null : Number(filtroMotoristaId);
    const params = {
      periodo: periodoApi,
      group_by: "veiculo",
      ...(Number.isFinite(vid) && vid > 0 ? { veiculo_id: vid } : {}),
      ...(Number.isFinite(mid) && mid > 0 ? { motorista_id: mid } : {}),
    };
    try {
      const { data } = await api.get("/dashboard/combustiveis/resumo", { params });
      setResumo({
        total_litros: data?.total_litros ?? 0,
        total_valor: data?.total_valor ?? 0,
        preco_medio_litro: data?.preco_medio_litro,
        por_veiculo: Array.isArray(data?.por_veiculo) ? data.por_veiculo : [],
        inteligencia: {
          dias_no_periodo: Number(data?.inteligencia?.dias_no_periodo) || 1,
          media_diaria_litros: Number(data?.inteligencia?.media_diaria_litros) || 0,
          media_mensal_litros: Number(data?.inteligencia?.media_mensal_litros) || 0,
          preco_medio_historico:
            data?.inteligencia?.preco_medio_historico != null &&
            Number.isFinite(Number(data.inteligencia.preco_medio_historico))
              ? Number(data.inteligencia.preco_medio_historico)
              : null,
          historico_media_diaria_litros: Number(data?.inteligencia?.historico_media_diaria_litros) || 0,
        },
        alertas_combustivel: {
          consumo_elevado: Array.isArray(data?.alertas_combustivel?.consumo_elevado)
            ? data.alertas_combustivel.consumo_elevado
            : [],
          preco_acima_media: Boolean(data?.alertas_combustivel?.preco_acima_media),
          consumo_alto_periodo: Boolean(data?.alertas_combustivel?.consumo_alto_periodo),
          preco_fora_media_historico: Boolean(data?.alertas_combustivel?.preco_fora_media_historico),
        },
      });
    } catch (err) {
      setResumo(null);
      emitToast(extractApiErrorMessage(err) || "Não foi possível carregar o resumo de combustível.", "warning");
    } finally {
      setLoading(false);
    }
  }, [periodo, filtroVeiculoId, filtroMotoristaId]);

  useEffect(() => {
    void loadResumo();
  }, [loadResumo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [vRes, uRes] = await Promise.all([
          api.get("/dashboard/manage/vehicles", { params: { page: 1, limit: 500, search: "" } }),
          api.get("/dashboard/manage/users", { params: { page: 1, limit: 500, search: "" } }),
        ]);
        if (cancelled) return;
        setVeiculosOpt(Array.isArray(vRes.data?.items) ? vRes.data.items : []);
        const items = Array.isArray(uRes.data?.items) ? uRes.data.items : [];
        setMotoristasOpt(items.filter((u) => u.role === "MOTORISTA"));
      } catch {
        if (!cancelled) {
          setVeiculosOpt([]);
          setMotoristasOpt([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/dashboard/combustiveis/resumo", { params: { periodo: "ano" } })
      .then(({ data }) => {
        if (cancelled) return;
        const v = data?.total_valor;
        setTotalGeralAno(v != null && Number.isFinite(Number(v)) ? Number(v) : 0);
      })
      .catch(() => {
        if (!cancelled) setTotalGeralAno(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearFiltrosVeiculoMotorista = useCallback(() => {
    setFiltroVeiculoId("");
    setFiltroMotoristaId("");
  }, []);

  const mediaPorVeiculo = useMemo(() => {
    if (!resumo?.por_veiculo?.length) return null;
    const rows = resumo.por_veiculo.filter((r) => Number(r.total_litros) > 0);
    if (!rows.length) return null;
    const tl = Number(resumo.total_litros) || 0;
    return tl / rows.length;
  }, [resumo]);

  const pie = useMemo(() => buildConsumoPorVeiculoPie(resumo?.por_veiculo), [resumo?.por_veiculo]);

  const semAbastecimentosNoPeriodo = useMemo(() => {
    if (!resumo || loading) return false;
    return Number(resumo.total_litros) === 0 && Number(resumo.total_valor) === 0;
  }, [resumo, loading]);

  const temAlertasCombustivel = useMemo(() => {
    if (loading || !resumo?.alertas_combustivel) return false;
    const a = resumo.alertas_combustivel;
    return (
      (a.consumo_elevado?.length ?? 0) > 0 ||
      Boolean(a.preco_acima_media) ||
      Boolean(a.consumo_alto_periodo) ||
      Boolean(a.preco_fora_media_historico)
    );
  }, [loading, resumo]);

  return useMemo(
    () => ({
      periodo,
      setPeriodo,
      filtroVeiculoId,
      setFiltroVeiculoId,
      filtroMotoristaId,
      setFiltroMotoristaId,
      veiculosOpt,
      motoristasOpt,
      resumo,
      loading,
      totalGeralAno,
      clearFiltrosVeiculoMotorista,
      mediaPorVeiculo,
      pie,
      semAbastecimentosNoPeriodo,
      temAlertasCombustivel,
    }),
    [
      periodo,
      filtroVeiculoId,
      filtroMotoristaId,
      veiculosOpt,
      motoristasOpt,
      resumo,
      loading,
      totalGeralAno,
      clearFiltrosVeiculoMotorista,
      mediaPorVeiculo,
      pie,
      semAbastecimentosNoPeriodo,
      temAlertasCombustivel,
    ]
  );
}
