import { useCallback, useEffect, useMemo, useState } from "react";
import BIDashboardShell from "../modules/company/bi/components/BIDashboardShell";
import IntelligenceFiltersCard from "../modules/company/intelligence/components/IntelligenceFiltersCard";
import IntelligenceChartsPanel from "../modules/company/intelligence/components/IntelligenceChartsPanel";
import AccordionSection from "../modules/company/shared/components/AccordionSection";
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
const sumBy = (rows, key) =>
  (Array.isArray(rows) ? rows : []).reduce((acc, row) => acc + toNumber(row?.[key]), 0);

const compactDate = (isoDate) => {
  if (!isoDate) return "-";
  const raw = String(isoDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [y, m, d] = raw.split("-");
  return `${d}/${m}/${y}`;
};

function SummarySkeleton() {
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 sm:p-5">
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-36 rounded bg-zinc-800/80" />
        <div className="h-9 w-2/3 rounded bg-zinc-800/70" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="h-28 rounded-xl border border-zinc-800/80 bg-zinc-900/80" />
          <div className="h-28 rounded-xl border border-zinc-800/80 bg-zinc-900/80" />
          <div className="h-28 rounded-xl border border-zinc-800/80 bg-zinc-900/80" />
        </div>
      </div>
    </section>
  );
}

function InsightCard({ title, children, tone = "default" }) {
  const toneMap = {
    default: "border-zinc-800/90 bg-zinc-950/50",
    critical: "border-red-900/80 bg-red-950/25",
    warning: "border-amber-900/80 bg-amber-950/20",
    ok: "border-emerald-900/80 bg-emerald-950/20",
  };
  return (
    <article className={`rounded-xl border p-4 transition-all duration-300 ${toneMap[tone] || toneMap.default}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <div className="mt-2 text-sm text-zinc-200">{children}</div>
    </article>
  );
}

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

  const hasOperationalData = useMemo(() => {
    const indicadores = overview?.indicadores || {};
    return (
      (overview?.consumo_por_veiculo?.length || 0) > 0 ||
      (overview?.custo_por_periodo?.length || 0) > 0 ||
      (overview?.consumo_vs_producao?.length || 0) > 0 ||
      toNumber(indicadores.totalLitros) > 0 ||
      toNumber(indicadores.totalValor) > 0 ||
      toNumber(indicadores.totalViagens) > 0
    );
  }, [overview]);

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

  const resumoOperacional = useMemo(() => {
    const indicadores = overview?.indicadores || {};
    return {
      totalLitros: toNumber(indicadores.totalLitros),
      totalValor: toNumber(indicadores.totalValor),
      totalViagens: toNumber(indicadores.totalViagens),
      veiculosAtivos: toNumber(indicadores.veiculosAtivos),
      veiculosOciosos: toNumber(indicadores.veiculosOciosos),
      precoMedio: Number.isFinite(Number(indicadores.precoMedio)) ? Number(indicadores.precoMedio) : null,
    };
  }, [overview]);

  const statusGeral = useMemo(() => {
    if (analysisLoading || overviewLoading) {
      return {
        label: "Processando",
        tone: "warning",
        detail: "Atualizando leitura operacional com base nos filtros selecionados.",
      };
    }
    if (overviewError) {
      return {
        label: "Instável",
        tone: "critical",
        detail: "Falha ao carregar parte dos dados operacionais.",
      };
    }
    if (resumoOperacional.totalViagens === 0 && resumoOperacional.totalLitros > 0) {
      return {
        label: "Crítico",
        tone: "critical",
        detail: "Há consumo registrado sem produção no período.",
      };
    }
    if (resumoOperacional.veiculosOciosos > 0) {
      return {
        label: "Atenção",
        tone: "warning",
        detail: `${fmtNumber(resumoOperacional.veiculosOciosos)} veículo(s) estão ociosos no recorte atual.`,
      };
    }
    if (resumoOperacional.totalLitros === 0 && resumoOperacional.totalViagens === 0) {
      return {
        label: "Sem operação",
        tone: "default",
        detail: "Não há movimentação operacional no período selecionado.",
      };
    }
    return {
      label: "Estável",
      tone: "ok",
      detail: "Operação com consumo e produção coerentes no período.",
    };
  }, [analysisLoading, overviewLoading, overviewError, resumoOperacional]);

  const diagnosticoPrincipal = useMemo(() => {
    const relatorio = analysis?.relatorio || null;
    if (relatorio?.problemaPrincipal) return relatorio.problemaPrincipal;
    if (resumoOperacional.totalViagens === 0 && resumoOperacional.totalLitros > 0) {
      return `Foram consumidos ${fmtNumber(resumoOperacional.totalLitros)} L sem viagens registradas no período.`;
    }
    if (resumoOperacional.veiculosOciosos > 0) {
      return `${fmtNumber(resumoOperacional.veiculosOciosos)} veículo(s) ociosos estão reduzindo a produtividade da frota.`;
    }
    if (resumoOperacional.totalLitros === 0 && resumoOperacional.totalViagens === 0) {
      return "Recorte sem movimentação operacional para diagnóstico de risco.";
    }
    return "Operação com comportamento regular no recorte atual, sem anomalia crítica detectada.";
  }, [analysis, resumoOperacional]);

  const gargalos = useMemo(() => {
    const relatorio = analysis?.relatorio || null;
    if (Array.isArray(relatorio?.riscos) && relatorio.riscos.length) return relatorio.riscos;
    const fallback = [];
    if (resumoOperacional.totalViagens === 0 && resumoOperacional.totalLitros > 0) {
      fallback.push("Consumo sem produção: custo operacional sem retorno.");
    }
    if (resumoOperacional.veiculosOciosos > 0) {
      fallback.push(`${fmtNumber(resumoOperacional.veiculosOciosos)} veículo(s) sem uso no período.`);
    }
    if (!fallback.length) fallback.push("Nenhum gargalo crítico identificado no recorte atual.");
    return fallback;
  }, [analysis, resumoOperacional]);

  const acoesRecomendadas = useMemo(() => {
    const relatorio = analysis?.relatorio || null;
    if (Array.isArray(relatorio?.acoes) && relatorio.acoes.length) return relatorio.acoes;
    const fallback = [];
    if (resumoOperacional.totalViagens === 0 && resumoOperacional.totalLitros > 0) {
      fallback.push("Auditar imediatamente abastecimentos sem romaneio no período.");
    }
    if (resumoOperacional.veiculosOciosos > 0) {
      fallback.push("Redistribuir veículos ociosos para frentes com demanda ativa.");
    }
    fallback.push("Atualizar os filtros e gerar análise inteligente para detalhamento executivo.");
    return fallback;
  }, [analysis, resumoOperacional]);

  const impactoFinanceiro = useMemo(() => {
    const exposicaoSemProducao =
      resumoOperacional.totalViagens === 0 && resumoOperacional.totalLitros > 0 ? resumoOperacional.totalValor : 0;
    return {
      custoTotal: resumoOperacional.totalValor,
      precoMedio: resumoOperacional.precoMedio,
      litros: resumoOperacional.totalLitros,
      exposicaoSemProducao,
    };
  }, [resumoOperacional]);

  const periodoLabel = useMemo(() => {
    const inicio = analysis?.periodo?.inicio;
    const fim = analysis?.periodo?.fim;
    if (!inicio && !fim) return "Período em análise";
    return `${compactDate(inicio)} até ${compactDate(fim)}`;
  }, [analysis]);

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
      const consumoPorVeiculo = Array.isArray(data?.consumo_por_veiculo) ? data.consumo_por_veiculo : [];
      const custoPorPeriodo = Array.isArray(data?.custo_por_periodo) ? data.custo_por_periodo : [];
      const consumoVsProducao = Array.isArray(data?.consumo_vs_producao) ? data.consumo_vs_producao : [];
      const rawIndicadores = data?.indicadores && typeof data.indicadores === "object" ? data.indicadores : {};

      // Consistência: resumo usa os mesmos agregados dos gráficos.
      const totalLitrosGraficos = sumBy(consumoPorVeiculo, "litros");
      const totalValorGraficos = sumBy(custoPorPeriodo, "custo");
      const totalViagensGraficos = sumBy(consumoVsProducao, "producao");

      const normalizedOverview = {
        consumo_por_veiculo: consumoPorVeiculo,
        custo_por_periodo: custoPorPeriodo,
        consumo_vs_producao: consumoVsProducao,
        indicadores: {
          ...rawIndicadores,
          totalLitros: consumoPorVeiculo.length ? totalLitrosGraficos : toNumber(rawIndicadores.totalLitros),
          totalValor: custoPorPeriodo.length ? totalValorGraficos : toNumber(rawIndicadores.totalValor),
          totalViagens: consumoVsProducao.length ? totalViagensGraficos : toNumber(rawIndicadores.totalViagens),
        },
      };

      console.info("[INTELIGENCIA] dados carregados:", {
        quantidade_registros: {
          consumo_por_veiculo: consumoPorVeiculo.length,
          custo_por_periodo: custoPorPeriodo.length,
          consumo_vs_producao: consumoVsProducao.length,
          total: consumoPorVeiculo.length + custoPorPeriodo.length + consumoVsProducao.length,
        },
        periodo_aplicado: data?.periodo || { tipo: activeFilters?.periodo || "mes" },
        veiculos_considerados: Number(rawIndicadores?.veiculosConsiderados || 0),
      });

      setOverview(normalizedOverview);
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
      <div className="space-y-4 px-1 pb-20 sm:space-y-6 sm:px-0 sm:pb-0">
        <AccordionSection
          id="inteligencia-filtros"
          title="Filtros operacionais"
          description="Período, veículo, motorista e tipo de análise"
          defaultOpenDesktop={true}
          defaultOpenMobile={false}
          contentClassName="!p-0"
        >
          <IntelligenceFiltersCard
            filters={filters}
            onChange={onFiltersChange}
            vehicleOptions={vehicleOptions}
            driverOptions={driverOptions}
            embedded
          />
        </AccordionSection>

        <section className="fc-card border-zinc-800/80 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="fc-erp-eyebrow">Análise executiva</p>
              <p className="mt-1 text-sm text-zinc-400">Atualize o diagnóstico e as ações com base no recorte atual.</p>
            </div>
            <button
              type="button"
              className="fc-btn fc-btn-empresa-primary w-full rounded-md px-4 py-3 text-sm font-semibold transition-all duration-300 sm:w-auto"
              onClick={onGenerateAnalysis}
              disabled={analysisLoading}
            >
              {analysisLoading ? "Gerando análise..." : "Gerar Análise Inteligente"}
            </button>
          </div>
          {analysisError ? <p className="mt-3 text-sm text-red-400">{analysisError}</p> : null}
        </section>

        <AccordionSection
          id="inteligencia-resumo"
          title="Leitura executiva"
          description={periodoLabel}
          defaultOpenDesktop={true}
          defaultOpenMobile={true}
        >
          {overviewLoading ? (
            <SummarySkeleton />
          ) : !hasOperationalData ? (
            <section className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-300">
              Sem dados para o período selecionado
            </section>
          ) : (
            <section className="transition-all duration-300">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <article
                className={`rounded-xl border p-4 ${
                  statusGeral.tone === "critical"
                    ? "border-red-900/80 bg-red-950/25"
                    : statusGeral.tone === "warning"
                      ? "border-amber-900/80 bg-amber-950/20"
                      : statusGeral.tone === "ok"
                        ? "border-emerald-900/80 bg-emerald-950/20"
                        : "border-zinc-800/90 bg-zinc-950/50"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">1. Status geral</p>
                <div className="mt-2 inline-flex rounded-full border border-current px-3 py-1 text-xs font-semibold">
                  {statusGeral.label}
                </div>
                <p className="mt-2 text-sm text-zinc-200">{statusGeral.detail}</p>
              </article>

              <InsightCard title="2. Diagnóstico principal" tone={statusGeral.tone === "critical" ? "critical" : "default"}>
                <p className="font-medium">{diagnosticoPrincipal}</p>
              </InsightCard>

              <InsightCard title="4. Impacto financeiro" tone={impactoFinanceiro.exposicaoSemProducao > 0 ? "warning" : "default"}>
                <div className="space-y-1">
                  <p>
                    <span className="text-zinc-400">Custo total:</span> {fmtCurrency(impactoFinanceiro.custoTotal)}
                  </p>
                  <p>
                    <span className="text-zinc-400">Preço médio:</span>{" "}
                    {impactoFinanceiro.precoMedio != null ? fmtCurrency(impactoFinanceiro.precoMedio) : "Sem base"}
                  </p>
                  <p>
                    <span className="text-zinc-400">Consumo:</span> {fmtNumber(impactoFinanceiro.litros)} L
                  </p>
                  {impactoFinanceiro.exposicaoSemProducao > 0 ? (
                    <p className="text-amber-300">
                      Exposição sem produção: {fmtCurrency(impactoFinanceiro.exposicaoSemProducao)}
                    </p>
                  ) : null}
                </div>
              </InsightCard>

              <InsightCard title="3. Gargalos" tone={gargalos[0]?.includes("Nenhum gargalo") ? "ok" : "warning"}>
                <div className="space-y-1">
                  {gargalos.slice(0, 4).map((item) => (
                    <p key={item} className="text-sm">
                      - {item}
                    </p>
                  ))}
                </div>
              </InsightCard>

              <InsightCard title="5. Ações recomendadas" tone="default">
                <div className="space-y-1">
                  {acoesRecomendadas.slice(0, 4).map((item) => (
                    <p key={item} className="text-sm">
                      - {item}
                    </p>
                  ))}
                </div>
              </InsightCard>

              <InsightCard title="Indicadores rápidos" tone="default">
                <p className="break-words">{indicadorTexto}</p>
              </InsightCard>
            </div>
            </section>
          )}
        </AccordionSection>

        {overviewError ? <p className="text-sm text-red-400">{overviewError}</p> : null}

        <AccordionSection
          id="inteligencia-graficos"
          title="6. Gráficos de apoio"
          description="Visual para consumo, custo e produção"
          defaultOpenDesktop={true}
          defaultOpenMobile={false}
        >
          <IntelligenceChartsPanel
            pieData={chartData.pieData}
            lineData={chartData.lineData}
            barData={chartData.barData}
            loading={overviewLoading}
            embedded
          />
        </AccordionSection>
      </div>
    </BIDashboardShell>
  );
}
