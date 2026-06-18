import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api, { extractApiErrorMessage, getFriendlyApiErrorMessage } from "../../../../services/api";
import useDebouncedValue from "../../../../hooks/useDebouncedValue";
import { readSessionJson, writeSessionJson } from "../../shared/sessionFilters";
import { buildConsumoPorVeiculoPie } from "../charts/fuelPie";
import { buildRegistrosParamsFromFuelPeriod } from "../services/fuelFormatters";

const ABASTECIMENTOS_LIMIT = 200;

const PERIODOS_API_COMBUSTIVEL = new Set(["dia", "semana", "mes", "ano"]);

export function normalizePeriodoCombustivel(v) {
  const p = String(v ?? "mes").trim().toLowerCase();
  return PERIODOS_API_COMBUSTIVEL.has(p) ? p : "mes";
}

const CACHE_TTL_MS = 40_000;
const CACHE_MAX = 12;

/**
 * Estado exclusivo do módulo Combustível (sem vínculo com filtros de transporte ou parte diária).
 * @param {{ enabled?: boolean, moduleId?: string }} [options]
 */
export function useEmpresaFuelDashboard(options = {}) {
  const { enabled = true, moduleId = "fuel" } = options;
  const sessionKey = `filters:${moduleId}`;

  const savedFilters = useMemo(() => readSessionJson(sessionKey, null), [sessionKey]);

  const [periodo, setPeriodo] = useState(() => savedFilters?.periodo ?? "mes");
  const [filtroVeiculoId, setFiltroVeiculoId] = useState(() => savedFilters?.filtroVeiculoId ?? "");
  const [filtroMotoristaId, setFiltroMotoristaId] = useState(() => savedFilters?.filtroMotoristaId ?? "");
  const [veiculosOpt, setVeiculosOpt] = useState([]);
  const [motoristasOpt, setMotoristasOpt] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [totalGeralAno, setTotalGeralAno] = useState(null);
  const [abastecimentos, setAbastecimentos] = useState([]);
  const [abastecimentosLoading, setAbastecimentosLoading] = useState(false);
  const resumoCacheRef = useRef(new Map());

  const debouncedVeiculoId = useDebouncedValue(filtroVeiculoId, 320);
  const debouncedMotoristaId = useDebouncedValue(filtroMotoristaId, 320);

  useEffect(() => {
    writeSessionJson(sessionKey, {
      periodo,
      filtroVeiculoId,
      filtroMotoristaId,
    });
  }, [sessionKey, periodo, filtroVeiculoId, filtroMotoristaId]);

  const pruneCache = useCallback((map) => {
    while (map.size > CACHE_MAX) {
      const firstKey = map.keys().next().value;
      map.delete(firstKey);
    }
  }, []);

  const loadResumo = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const periodoApi = normalizePeriodoCombustivel(periodo);
    const vid = debouncedVeiculoId === "" ? null : Number(debouncedVeiculoId);
    const mid = debouncedMotoristaId === "" ? null : Number(debouncedMotoristaId);
    const params = {
      periodo: periodoApi,
      group_by: "veiculo",
      ...(Number.isFinite(vid) && vid > 0 ? { veiculo_id: vid } : {}),
      ...(Number.isFinite(mid) && mid > 0 ? { motorista_id: mid } : {}),
    };
    const cacheKey = JSON.stringify(params);
    const now = Date.now();
    const hit = resumoCacheRef.current.get(cacheKey);
    if (hit && now - hit.t < CACHE_TTL_MS) {
      setResumo(hit.data);
      setLoadError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get("/dashboard/combustiveis/resumo", { params });
      const next = {
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
      };
      resumoCacheRef.current.set(cacheKey, { t: now, data: next });
      pruneCache(resumoCacheRef.current);
      setResumo(next);
    } catch (err) {
      setResumo(null);
      setLoadError(
        getFriendlyApiErrorMessage(err) || extractApiErrorMessage(err) || "Falha ao carregar o resumo de combustível."
      );
    } finally {
      setLoading(false);
    }
  }, [enabled, periodo, debouncedVeiculoId, debouncedMotoristaId, pruneCache]);

  useEffect(() => {
    void loadResumo();
  }, [loadResumo]);

  const loadAbastecimentos = useCallback(async () => {
    if (!enabled) {
      setAbastecimentos([]);
      setAbastecimentosLoading(false);
      return;
    }
    setAbastecimentosLoading(true);
    try {
      const periodoApi = normalizePeriodoCombustivel(periodo);
      const periodParams = buildRegistrosParamsFromFuelPeriod(periodoApi);
      const vid = debouncedVeiculoId === "" ? null : Number(debouncedVeiculoId);
      const mid = debouncedMotoristaId === "" ? null : Number(debouncedMotoristaId);
      const { data } = await api.get("/dashboard/registros", {
        params: {
          page: 1,
          limit: ABASTECIMENTOS_LIMIT,
          tipo: "combustivel",
          ...periodParams,
          ...(Number.isFinite(vid) && vid > 0 ? { veiculo_id: vid } : {}),
          ...(Number.isFinite(mid) && mid > 0 ? { motorista_id: mid } : {}),
        },
        timeout: 12_000,
        skipErrorLog: true,
        skipGlobalErrorToast: true,
      });
      setAbastecimentos(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setAbastecimentos([]);
    } finally {
      setAbastecimentosLoading(false);
    }
  }, [enabled, periodo, debouncedVeiculoId, debouncedMotoristaId]);

  useEffect(() => {
    void loadAbastecimentos();
  }, [loadAbastecimentos]);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  const clearFiltrosVeiculoMotorista = useCallback(() => {
    setFiltroVeiculoId("");
    setFiltroMotoristaId("");
  }, []);

  const clearLoadError = useCallback(() => setLoadError(null), []);

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
      loadError,
      clearLoadError,
      refetch: loadResumo,
      abastecimentos,
      abastecimentosLoading,
      refetchAbastecimentos: loadAbastecimentos,
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
      loadError,
      clearLoadError,
      loadResumo,
      abastecimentos,
      abastecimentosLoading,
      loadAbastecimentos,
      totalGeralAno,
      clearFiltrosVeiculoMotorista,
      mediaPorVeiculo,
      pie,
      semAbastecimentosNoPeriodo,
      temAlertasCombustivel,
    ]
  );
}
