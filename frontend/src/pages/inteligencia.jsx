import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import BIDashboardShell from "../modules/company/bi/components/BIDashboardShell";
import IntelligenceFiltersCard from "../modules/company/intelligence/components/IntelligenceFiltersCard";
import IntelligenceChartsPanel from "../modules/company/intelligence/components/IntelligenceChartsPanel";
import IntelligenceExecutivePanel from "../modules/company/intelligence/components/IntelligenceExecutivePanel";
import { ExecutiveRegraDeOuroCard, resolveRegraDeOuro } from "../modules/company/intelligence/components/ExecutiveRegraDeOuroCard";
import {
  downloadInteligenciaPdf,
  parseBlobErrorMessage,
} from "../modules/company/intelligence/utils/pdfDownload";
import { getDadosGraficos } from "../modules/company/intelligence/utils/overviewInteligencia";
import AccordionSection from "../modules/company/shared/components/AccordionSection";
import api, { extractApiErrorMessage, getFriendlyApiErrorMessage } from "../services/api";
import { emitToast } from "../services/uiEvents";

const DEFAULT_FILTERS = {
  periodo: "mes",
  veiculoId: "todos",
  motoristaId: "todos",
  tipoAnalise: "geral",
};

const DEFAULT_VEHICLE_OPTIONS = [{ value: "todos", label: "Todos os veículos" }];
const DEFAULT_DRIVER_OPTIONS = [{ value: "todos", label: "Todos os motoristas" }];
const INTELIGENCIA_SECTIONS = ["executivo", "combustivel", "frota", "transporte"];

const EMPTY_OVERVIEW = {
  vazio: true,
  status: "OK",
  resumo: "",
  problemas: [],
  insights: [],
  recomendacoes: [],
  contexto: {},
  dados_graficos: {},
  modulos_leitura: {},
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

const compactDate = (isoDate) => {
  if (!isoDate) return "-";
  const raw = String(isoDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [y, m, d] = raw.split("-");
  return `${d}/${m}/${y}`;
};

function InsightCard({ title, children, tone = "default" }) {
  const toneMap = {
    default: "card-info",
    critical: "card-danger border-red-900/80 bg-red-950/25",
    warning: "card-warning border-amber-900/80 bg-amber-950/20",
    ok: "card-info border-emerald-900/80 bg-emerald-950/20",
  };
  return (
    <article className={`card rounded-2xl p-5 sm:p-6 ${toneMap[tone] || toneMap.default}`}>
      <p className="text-sm font-bold uppercase tracking-widest text-zinc-500 sm:text-xs">{title}</p>
      <div className="mt-4 text-zinc-200">{children}</div>
    </article>
  );
}

export default function InteligenciaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [vehicleOptions, setVehicleOptions] = useState(DEFAULT_VEHICLE_OPTIONS);
  const [driverOptions, setDriverOptions] = useState(DEFAULT_DRIVER_OPTIONS);
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [analysis, setAnalysis] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [compactPdfLoading, setCompactPdfLoading] = useState(false);
  const currentPathSection = String(location.pathname || "")
    .split("/")
    .filter(Boolean)
    .slice(-1)[0];
  const activeSection = INTELIGENCIA_SECTIONS.includes(currentPathSection) ? currentPathSection : "executivo";

  const hasOperationalData = useMemo(() => !overview?.vazio, [overview]);

  const regraDeOuro = useMemo(() => resolveRegraDeOuro({ overview }), [overview]);

  const chartData = useMemo(() => {
    const graficos = getDadosGraficos(overview);
    return {
      pieData: (graficos.consumo_por_veiculo || []).map((item) => ({
        veiculo_id: item?.veiculo_id ?? item?.veiculoId ?? item?.veiculo ?? "sem-id",
        name: item?.veiculo || "Sem veículo",
        value: toNumber(item?.litros),
      })),
      lineData: (graficos.custo_por_periodo || []).map((item) => ({
        periodo: item?.periodo || "-",
        custo: toNumber(item?.custo),
      })),
      barData: (graficos.consumo_vs_producao || []).map((item) => ({
        periodo: item?.periodo || "-",
        consumo: toNumber(item?.consumo),
        producao: toNumber(item?.producao),
      })),
    };
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

  const moduloCombustivel = useMemo(() => {
    const mod = overview?.modulos_leitura?.combustivel || {};
    return {
      consumoTotal: toNumber(mod.consumoTotal ?? resumoOperacional.totalLitros),
      custoTotal: toNumber(mod.custoTotal ?? resumoOperacional.totalValor),
      precoMedio: mod.precoMedio ?? resumoOperacional.precoMedio,
      leitura: mod.leitura || "",
    };
  }, [overview, resumoOperacional]);

  const moduloTransporte = useMemo(() => {
    const mod = overview?.modulos_leitura?.transporte || {};
    return {
      viagens: toNumber(mod.viagens ?? resumoOperacional.totalViagens),
      leitura: mod.leitura || "",
    };
  }, [overview, resumoOperacional]);

  const moduloFrota = useMemo(() => {
    const mod = overview?.modulos_leitura?.frota || {};
    return {
      veiculosAtivos: toNumber(mod.veiculosAtivos ?? resumoOperacional.veiculosAtivos),
      veiculosOciosos: toNumber(mod.veiculosOciosos ?? resumoOperacional.veiculosOciosos),
      leitura: mod.leitura || "",
    };
  }, [overview, resumoOperacional]);

  const periodoLabel = useMemo(() => {
    const inicio = overview?.periodo?.inicio;
    const fim = overview?.periodo?.fim;
    if (!inicio && !fim) return "";
    return `${compactDate(inicio)} até ${compactDate(fim)}`;
  }, [overview]);

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
      setOverview(data && typeof data === "object" ? data : EMPTY_OVERVIEW);
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

  const gerarAnalise = useCallback(async () => {
    setAnalysisLoading(true);
    setAnalysisError("");
    try {
      const apiFilters = buildApiFilters(filters);
      const payload = {
        periodo: apiFilters.periodo,
        veiculo_id: apiFilters.veiculoId ?? null,
        motorista_id: apiFilters.motoristaId ?? null,
        tipo_analise: apiFilters.tipoAnalise,
      };
      const { data } = await api.post("/inteligencia/gerar", payload);
      setAnalysis(data || null);
      if (data?.overview) {
        setOverview(data.overview);
      } else if (data?.inteligencia) {
        setOverview((prev) => ({ ...prev, ...data.inteligencia }));
      }
      const origemGpt = data?.gpt?.origem;
      if (origemGpt === "openai" || origemGpt === "cache") {
        emitToast("Análise gerada com complemento IA sobre os dados do motor operacional.");
      } else if (origemGpt === "limit") {
        emitToast("Limite diário de IA atingido — apenas motor operacional aplicado.", "warning");
      } else {
        emitToast("Análise gerada pelo motor operacional (IA indisponível).", "warning");
      }
    } catch (error) {
      console.error("Erro ao gerar análise:", error);
      setAnalysis(null);
      const friendlyMessage = await parseBlobErrorMessage(error, "Falha ao gerar análise inteligente.");
      setAnalysisError(friendlyMessage);
      emitToast(friendlyMessage, "error");
    } finally {
      setAnalysisLoading(false);
    }
  }, [filters]);

  const baixarPdfCompacto = useCallback(async () => {
    setCompactPdfLoading(true);
    try {
      const result = await downloadInteligenciaPdf(filters);
      if (result?.disabled) {
        emitToast(result.mensagem, "warning");
        return;
      }
      emitToast(`PDF compacto baixado (${result.filename}). Formato diferente do relatório HTML.`, "success");
    } catch (error) {
      const friendlyMessage = await parseBlobErrorMessage(error, "Falha ao gerar PDF no servidor.");
      emitToast(friendlyMessage, "error");
    } finally {
      setCompactPdfLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadFiltersOptions();
  }, [loadFiltersOptions]);

  useEffect(() => {
    void loadOverview(filters);
  }, [filters, loadOverview]);

  useEffect(() => {
    if (INTELIGENCIA_SECTIONS.includes(currentPathSection)) return;
    navigate("/inteligencia/executivo", { replace: true });
  }, [currentPathSection, navigate]);

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

  const reportHref = useMemo(() => {
    const params = new URLSearchParams(buildApiFilters(filters));
    return `/relatorio-inteligencia?${params.toString()}`;
  }, [filters]);

  return (
    <BIDashboardShell
      eyebrow="Inteligência"
      title="Central de Inteligência Operacional"
      lead="Análise automatizada da operação com base em dados reais"
    >
      <div className="space-y-5 px-2 pb-24 sm:space-y-6 sm:px-0 sm:pb-0">
        <AccordionSection
          id="inteligencia-filtros"
          title="Filtros operacionais"
          description="Período, veículo, motorista e tipo de análise"
          defaultOpenDesktop={false}
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

        <AccordionSection
          id="inteligencia-modulos"
          title="Módulos da inteligência"
          description="Executivo, combustível, frota e transporte"
          defaultOpenDesktop
          defaultOpenMobile
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {INTELIGENCIA_SECTIONS.map((section) => {
              const labels = {
                executivo: "Executivo",
                combustivel: "Combustível",
                frota: "Frota",
                transporte: "Transporte",
              };
              const active = activeSection === section;
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => navigate(`/inteligencia/${section}`)}
                  className={`fc-btn rounded-md border px-3 py-2 text-sm font-semibold ${
                    active
                      ? "border-sky-500/70 bg-sky-900/30 text-sky-100"
                      : "border-zinc-700 bg-zinc-900/60 text-zinc-300"
                  }`}
                >
                  {labels[section]}
                </button>
              );
            })}
          </div>
        </AccordionSection>

        <AccordionSection
          id="inteligencia-geracao"
          title="Gerar análise"
          description="Atualize o diagnóstico para o recorte selecionado"
          defaultOpenDesktop={false}
          defaultOpenMobile={false}
        >
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="fc-btn fc-btn-empresa-primary w-full rounded-md px-4 py-3 text-sm font-semibold transition-all duration-300"
              onClick={gerarAnalise}
              disabled={analysisLoading}
            >
              {analysisLoading ? "Gerando análise..." : "Gerar Análise Inteligente"}
            </button>
            <Link
              to={reportHref}
              className="fc-btn w-full rounded-md border border-sky-700/60 bg-sky-950/30 px-4 py-3 text-center text-sm font-semibold text-sky-100 transition-all duration-300 hover:border-sky-500"
            >
              Abrir relatório HTML (BI) — PDF visual
            </Link>
            <button
              type="button"
              className="fc-btn w-full rounded-md border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-100 transition-all duration-300 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void baixarPdfCompacto()}
              disabled={analysisLoading || compactPdfLoading}
            >
              {compactPdfLoading ? "Gerando PDF..." : "PDF compacto (servidor — formato antigo)"}
            </button>
            <p className="text-xs text-zinc-500">
              O PDF fiel ao layout BI está em «Relatório HTML → Baixar PDF (layout BI)».
            </p>
            {analysisError ? <p className="text-sm text-red-400">{analysisError}</p> : null}
          </div>
        </AccordionSection>

        <AccordionSection
          id="inteligencia-resumo"
          title="Painel executivo"
          description={periodoLabel}
          defaultOpenDesktop
          defaultOpenMobile
        >
          {activeSection === "executivo" ? (
            <div className="space-y-5 sm:space-y-6">
              <ExecutiveRegraDeOuroCard
                regra={regraDeOuro}
                loading={overviewLoading || analysisLoading}
              />
              <IntelligenceExecutivePanel
                overview={overview}
                loading={overviewLoading}
                error={overviewError}
                periodoLabel={periodoLabel}
              />
            </div>
          ) : overviewLoading ? (
            <div className="animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-5">
              <div className="h-4 w-36 rounded bg-zinc-800/80" />
              <div className="mt-4 h-24 rounded-xl bg-zinc-800/60" />
            </div>
          ) : !hasOperationalData ? (
            (overview?.mensagem || overview?.resumo) ? (
              <section className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-5 text-base text-zinc-300 sm:p-6 sm:text-sm">
                {overview.mensagem || overview.resumo}
              </section>
            ) : null
          ) : (
            <section className="transition-all duration-300">
              {activeSection === "combustivel" ? (
                <div className="grid grid-cols-1 gap-5 sm:gap-6">
                  <InsightCard title="Combustível" tone={impactoFinanceiro.exposicaoSemProducao > 0 ? "warning" : "default"}>
                    <div className="space-y-2 text-base sm:text-sm">
                      <p>
                        <span className="text-zinc-400">Consumo total:</span> {fmtNumber(moduloCombustivel.consumoTotal)} L
                      </p>
                      <p>
                        <span className="text-zinc-400">Custo total:</span> {fmtCurrency(moduloCombustivel.custoTotal)}
                      </p>
                      {moduloCombustivel.precoMedio != null ? (
                        <p>
                          <span className="text-zinc-400">Preço médio:</span> {fmtCurrency(moduloCombustivel.precoMedio)}
                        </p>
                      ) : null}
                      {moduloCombustivel.leitura ? <p className="text-zinc-300">{moduloCombustivel.leitura}</p> : null}
                    </div>
                  </InsightCard>
                </div>
              ) : null}

              {activeSection === "transporte" ? (
                <div className="grid grid-cols-1 gap-5 sm:gap-6">
                  <InsightCard title="Transporte" tone={moduloTransporte.viagens === 0 ? "warning" : "ok"}>
                    <div className="space-y-2 text-base sm:text-sm">
                      <p>
                        <span className="text-zinc-400">Viagens:</span> {fmtNumber(moduloTransporte.viagens)}
                      </p>
                      {moduloTransporte.leitura ? <p className="text-zinc-300">{moduloTransporte.leitura}</p> : null}
                    </div>
                  </InsightCard>
                </div>
              ) : null}

              {activeSection === "frota" ? (
                <div className="grid grid-cols-1 gap-5 sm:gap-6">
                  <InsightCard title="Frota" tone={moduloFrota.veiculosOciosos > 0 ? "warning" : "ok"}>
                    <div className="space-y-2 text-base sm:text-sm">
                      <p>
                        <span className="text-zinc-400">Veículos ativos:</span> {fmtNumber(moduloFrota.veiculosAtivos)}
                      </p>
                      <p>
                        <span className="text-zinc-400">Veículos ociosos:</span> {fmtNumber(moduloFrota.veiculosOciosos)}
                      </p>
                      {moduloFrota.leitura ? <p className="text-zinc-300">{moduloFrota.leitura}</p> : null}
                    </div>
                  </InsightCard>
                </div>
              ) : null}
            </section>
          )}
        </AccordionSection>

        {overviewError && activeSection !== "executivo" ? (
          <p className="px-2 text-base text-red-400 sm:px-0 sm:text-sm">{overviewError}</p>
        ) : null}

        <AccordionSection
          id="inteligencia-graficos"
          title="Gráficos de apoio"
          description={
            activeSection === "combustivel"
              ? "Consumo por veículo e custo por período"
              : activeSection === "transporte"
                ? "Consumo vs produção por período"
                : activeSection === "executivo"
                  ? "Leitura visual consolidada dos principais indicadores"
                  : "Visão de apoio para o módulo selecionado"
          }
          defaultOpenDesktop={false}
          defaultOpenMobile={false}
        >
          <IntelligenceChartsPanel
            pieData={activeSection === "frota" || activeSection === "transporte" ? [] : chartData.pieData}
            lineData={activeSection === "frota" || activeSection === "transporte" ? [] : chartData.lineData}
            barData={activeSection === "frota" || activeSection === "combustivel" ? [] : chartData.barData}
            loading={overviewLoading}
            embedded
          />
        </AccordionSection>
      </div>
    </BIDashboardShell>
  );
}
