import { useCallback, useEffect, useMemo, useState } from "react";
import BIDashboardShell from "../modules/company/bi/components/BIDashboardShell";
import IntelligenceFiltersCard from "../modules/company/intelligence/components/IntelligenceFiltersCard";
import IntelligenceChartsPanel from "../modules/company/intelligence/components/IntelligenceChartsPanel";
import api, { extractApiErrorMessage, getFriendlyApiErrorMessage } from "../services/api";

const DEFAULT_FILTERS = {
  periodo: "mes",
  veiculoId: "todos",
  motoristaId: "todos",
  tipoAnalise: "geral",
};

const DEFAULT_VEHICLE_OPTIONS = [{ value: "todos", label: "Todos os veículos" }];
const DEFAULT_DRIVER_OPTIONS = [{ value: "todos", label: "Todos os motoristas" }];

const EMPTY_OVERVIEW = {
  consumo_por_veiculo: [],
  custo_por_periodo: [],
  consumo_vs_producao: [],
  indicadores: {},
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toSelectValue = (value) => {
  if (value == null) return "todos";
  const normalized = String(value).trim();
  return normalized ? normalized : "todos";
};

const buildApiFilters = (filters) => {
  const params = {
    periodo: filters.periodo || "mes",
    tipoAnalise: filters.tipoAnalise || "geral",
  };
  const veiculoId = Number(filters.veiculoId);
  const motoristaId = Number(filters.motoristaId);
  if (Number.isFinite(veiculoId) && veiculoId > 0) params.veiculoId = veiculoId;
  if (Number.isFinite(motoristaId) && motoristaId > 0) params.motoristaId = motoristaId;
  return params;
};

const fmtNumber = (value) => toNumber(value, 0).toLocaleString("pt-BR");
const fmtCurrency = (value) =>
  toNumber(value, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function InteligenciaPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [vehicleOptions, setVehicleOptions] = useState(DEFAULT_VEHICLE_OPTIONS);
  const [driverOptions, setDriverOptions] = useState(DEFAULT_DRIVER_OPTIONS);
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [analysis, setAnalysis] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [analysisError, setAnalysisError] = useState("");

  const chartData = useMemo(
    () => ({
      pieData: (overview?.consumo_por_veiculo || []).map((item) => ({
        name: item?.veiculo || "Sem veículo",
        value: toNumber(item?.litros),
      })),
      lineData: (overview?.custo_por_periodo || []).map((item) => ({
        periodo: item?.periodo || "-",
        custo: toNumber(item?.custo),
      })),
      barData: (overview?.consumo_vs_producao || []).map((item) => ({
        periodo: item?.periodo || "-",
        consumo: toNumber(item?.consumo),
        producao: toNumber(item?.producao),
      })),
    }),
    [overview]
  );

  const indicadorTexto = useMemo(() => {
    const indicadores = overview?.indicadores || {};
    return [
      `${fmtNumber(indicadores.totalLitros)} L`,
      `${fmtCurrency(indicadores.totalValor)}`,
      `${fmtNumber(indicadores.totalViagens)} viagens`,
      `${fmtNumber(indicadores.veiculosAtivos)} veículos ativos`,
      `${fmtNumber(indicadores.veiculosOciosos)} ociosos`,
    ].join(" · ");
  }, [overview]);

  const resultItems = useMemo(() => {
    const relatorio = analysis?.relatorio || null;
    const riscos = Array.isArray(relatorio?.riscos) ? relatorio.riscos : [];
    const acoes = Array.isArray(relatorio?.acoes) ? relatorio.acoes : [];
    const sourceLabel =
      relatorio?.origem === "openai"
        ? "Análise IA concluída."
        : relatorio?.origem === "cache"
          ? "Análise recuperada do cache."
          : relatorio?.origem === "limit"
            ? "Limite diário de IA atingido."
            : relatorio
              ? "Análise gerada com fallback estruturado."
              : "Aguardando geração da análise.";

    return [
      { title: "Status", value: analysisLoading ? "Gerando análise..." : sourceLabel },
      {
        title: "Problema principal",
        value: relatorio?.problemaPrincipal || "Sem diagnóstico no momento.",
      },
      { title: "Indicadores", value: indicadorTexto },
      {
        title: "Gargalos",
        value: riscos.length ? riscos.join(" | ") : "Os gargalos aparecerão com base nos dados filtrados.",
      },
      {
        title: "Ações",
        value: acoes.length ? acoes.join(" | ") : "As ações recomendadas serão listadas aqui.",
      },
    ];
  }, [analysis, analysisLoading, indicadorTexto]);

  const loadFiltersOptions = useCallback(async () => {
    try {
      const [vehiclesRes, usersRes] = await Promise.all([
        api.get("/dashboard/manage/vehicles", { params: { page: 1, limit: 500, search: "" } }),
        api.get("/dashboard/manage/users", { params: { page: 1, limit: 500, search: "" } }),
      ]);
      const vehiclesItems = Array.isArray(vehiclesRes.data?.items) ? vehiclesRes.data.items : [];
      const usersItems = Array.isArray(usersRes.data?.items) ? usersRes.data.items : [];

      setVehicleOptions([
        DEFAULT_VEHICLE_OPTIONS[0],
        ...vehiclesItems.map((item) => ({
          value: String(item.id),
          label: `${item.nome || "Sem nome"} (${item.placa || "-"})`,
        })),
      ]);
      setDriverOptions([
        DEFAULT_DRIVER_OPTIONS[0],
        ...usersItems
          .filter((user) => user.role === "MOTORISTA")
          .map((user) => ({
            value: String(user.id),
            label: user.nome || `Motorista ${user.id}`,
          })),
      ]);
    } catch {
      setVehicleOptions(DEFAULT_VEHICLE_OPTIONS);
      setDriverOptions(DEFAULT_DRIVER_OPTIONS);
    }
  }, []);

  const loadOverview = useCallback(async (activeFilters) => {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const params = buildApiFilters(activeFilters);
      const { data } = await api.get("/inteligencia/overview", { params });
      setOverview({
        consumo_por_veiculo: Array.isArray(data?.consumo_por_veiculo) ? data.consumo_por_veiculo : [],
        custo_por_periodo: Array.isArray(data?.custo_por_periodo) ? data.custo_por_periodo : [],
        consumo_vs_producao: Array.isArray(data?.consumo_vs_producao) ? data.consumo_vs_producao : [],
        indicadores: data?.indicadores && typeof data.indicadores === "object" ? data.indicadores : {},
      });
    } catch (error) {
      setOverview(EMPTY_OVERVIEW);
      setOverviewError(
        getFriendlyApiErrorMessage(error) ||
          extractApiErrorMessage(error) ||
          "Falha ao carregar dados da inteligência."
      );
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const onGenerateAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    setAnalysisError("");
    try {
      const payload = buildApiFilters(filters);
      const { data } = await api.post("/inteligencia/analisar", payload);
      setAnalysis(data || null);
    } catch (error) {
      setAnalysis(null);
      setAnalysisError(
        getFriendlyApiErrorMessage(error) ||
          extractApiErrorMessage(error) ||
          "Falha ao gerar análise inteligente."
      );
    } finally {
      setAnalysisLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadFiltersOptions();
  }, [loadFiltersOptions]);

  useEffect(() => {
    void loadOverview(filters);
  }, [filters, loadOverview]);

  const onFiltersChange = useCallback((updater) => {
    setFilters((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return {
        periodo: next.periodo || "mes",
        veiculoId: toSelectValue(next.veiculoId),
        motoristaId: toSelectValue(next.motoristaId),
        tipoAnalise: next.tipoAnalise || "geral",
      };
    });
  }, []);

  return (
    <BIDashboardShell
      eyebrow="Inteligência"
      title="Central de Inteligência Operacional"
      lead="Análise automatizada da operação com base em dados reais"
      showRoadmap={false}
    >
      <div className="space-y-5 sm:space-y-6">
        <IntelligenceFiltersCard
          filters={filters}
          onChange={onFiltersChange}
          vehicleOptions={vehicleOptions}
          driverOptions={driverOptions}
        />

        <section className="fc-card border-zinc-800/80 p-4 sm:p-5">
          <button
            type="button"
            className="fc-btn fc-btn-empresa-primary w-full rounded-md px-4 py-3 text-sm font-semibold sm:w-auto"
            onClick={onGenerateAnalysis}
            disabled={analysisLoading}
          >
            {analysisLoading ? "Gerando análise..." : "Gerar Análise Inteligente"}
          </button>
          {analysisError ? <p className="mt-3 text-sm text-red-400">{analysisError}</p> : null}
        </section>

        <IntelligenceChartsPanel
          pieData={chartData.pieData}
          lineData={chartData.lineData}
          barData={chartData.barData}
          loading={overviewLoading}
        />
        {overviewError ? <p className="text-sm text-red-400">{overviewError}</p> : null}

        <section className="fc-card border-zinc-800/80 p-4 sm:p-5">
          <p className="fc-erp-eyebrow">Resultado</p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-100">Resumo da análise</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            {resultItems.map((item) => (
              <article key={item.title} className="rounded-xl border border-zinc-800/90 bg-zinc-950/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{item.title}</p>
                <p className="mt-2 text-sm text-zinc-300">{item.value}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </BIDashboardShell>
  );
}
