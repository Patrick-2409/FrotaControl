import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CompanyLogo from "../components/CompanyLogo";
import IntelligenceFiltersCard from "../modules/company/intelligence/components/IntelligenceFiltersCard";
import ExecutiveReportCharts from "../modules/company/intelligence/components/ExecutiveReportCharts";
import ExecutiveReportParteDiaria from "../modules/company/intelligence/components/ExecutiveReportParteDiaria";
import { ExecutiveReportIndex, ExecutiveReportSection } from "../modules/company/intelligence/components/ExecutiveReportSection";
import ExecutiveInconsistenciasBlock from "../modules/company/intelligence/components/ExecutiveInconsistenciasBlock";
import { ExecutiveRegraDeOuroCard, resolveRegraDeOuro } from "../modules/company/intelligence/components/ExecutiveRegraDeOuroCard";
import ExecutiveMioPanel, { ExecutiveMioNarrativeBlock } from "../modules/company/intelligence/components/ExecutiveMioPanel";
import ExecutiveRiskPanel, {
  ExecutiveFinancialRiskBlock,
  ExecutiveImmediateActionBlock,
} from "../modules/company/intelligence/components/ExecutiveRiskPanel";
import { mapOrigemIa } from "../modules/company/intelligence/components/ChartReportBlocks";
import { useAuth } from "../services/auth";
import { getDadosGraficos } from "../modules/company/intelligence/utils/overviewInteligencia";
import { downloadInteligenciaPdf, parseBlobErrorMessage } from "../modules/company/intelligence/utils/pdfDownload";
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

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toSelectValue = (value) => {
  if (value == null) return "todos";
  const normalized = String(value).trim();
  return normalized || "todos";
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

const fmtNumber = (value, digits = 0) =>
  toNumber(value, 0).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtCurrency = (value) =>
  toNumber(value, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const compactDate = (isoDate) => {
  if (!isoDate) return "-";
  const raw = String(isoDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [y, m, d] = raw.split("-");
  return `${d}/${m}/${y}`;
};

const STATUS_STYLES = {
  CRÍTICO: { bg: "bg-red-50", border: "border-red-300", text: "text-red-800", badge: "bg-red-600" },
  ATENÇÃO: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-900", badge: "bg-amber-500" },
  OK: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-900", badge: "bg-emerald-600" },
  ESTÁVEL: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-900", badge: "bg-emerald-600" },
  PROCESSANDO: { bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-700", badge: "bg-slate-500" },
};

function resolveExecutiveStatus({ overview, loading }) {
  if (loading) return { label: "PROCESSANDO", detail: "Carregando dados do relatório..." };

  if (overview?.status) {
    const normalized = String(overview.status).toUpperCase();
    const detail = overview.resumo || overview.status_operacao?.descricao || "";
    if (normalized.includes("CRIT")) return { label: "CRÍTICO", detail };
    if (normalized.includes("ALERT")) return { label: "ATENÇÃO", detail };
    return { label: "OK", detail };
  }

  const status = overview?.status_operacao;
  if (status?.label) {
    const normalized = String(status.label).toUpperCase();
    if (normalized.includes("CRÍT") || normalized.includes("CRIT")) {
      return { label: "CRÍTICO", detail: status.detail || status.descricao || "" };
    }
    if (normalized.includes("ATEN")) {
      return { label: "ATENÇÃO", detail: status.detail || status.descricao || "" };
    }
    return { label: "OK", detail: status.detail || status.descricao || "" };
  }

  return { label: "OK", detail: overview?.resumo || "" };
}

function KpiCard({ label, value, sub }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </article>
  );
}

const REPORT_SECTIONS = [
  { id: "regra-de-ouro", icon: "⚖️", label: "Regra de ouro" },
  { id: "painel-executivo", icon: "🎯", label: "Painel Executivo" },
  { id: "o-que-aconteceu", icon: "📌", label: "O que aconteceu" },
  { id: "por-que-importa", icon: "❗", label: "Por que isso importa" },
  { id: "acao-prioritaria", icon: "🚀", label: "Ação prioritária" },
  { id: "top-riscos", icon: "🔥", label: "Top 5 riscos operacionais" },
  { id: "acao-imediata", icon: "⚡", label: "Ação imediata recomendada" },
  { id: "risco-financeiro-estimado", icon: "💸", label: "Risco financeiro estimado" },
  { id: "resumo-executivo", icon: "📊", label: "Resumo Executivo" },
  { id: "inconsistencias", icon: "⚠️", label: "Inconsistências detectadas" },
  { id: "indicadores", icon: "📈", label: "Indicadores principais" },
  { id: "graficos", icon: "📉", label: "Gráficos explicados" },
  { id: "diagnostico-ia", icon: "🧠", label: "Diagnóstico da IA" },
  { id: "impacto-financeiro", icon: "💰", label: "Impacto financeiro" },
  { id: "recomendacoes", icon: "🛠️", label: "Recomendações" },
];

export default function RelatorioInteligenciaPage() {
  const { user } = useAuth();
  const reportRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    periodo: searchParams.get("periodo") || DEFAULT_FILTERS.periodo,
    veiculoId: toSelectValue(searchParams.get("veiculoId")),
    motoristaId: toSelectValue(searchParams.get("motoristaId")),
    tipoAnalise: searchParams.get("tipoAnalise") || DEFAULT_FILTERS.tipoAnalise,
  }));
  const [vehicleOptions, setVehicleOptions] = useState(DEFAULT_VEHICLE_OPTIONS);
  const [driverOptions, setDriverOptions] = useState(DEFAULT_DRIVER_OPTIONS);
  const [overview, setOverview] = useState(null);
  const [relatorio, setRelatorio] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [compactPdfLoading, setCompactPdfLoading] = useState(false);
  const [htmlPdfLoading, setHtmlPdfLoading] = useState(false);
  const [error, setError] = useState("");
  const isPdfExportMode = searchParams.get("pdfExport") === "1";

  const indicadores = overview?.indicadores || {};
  const tipoAnalise = filters.tipoAnalise || "geral";

  const chartData = useMemo(() => {
    const graficos = getDadosGraficos(overview);
    return {
      pieData: (graficos.consumo_por_veiculo || []).map((item) => ({
        veiculo_id: item?.veiculo_id ?? item?.veiculoId ?? item?.veiculo,
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

  const kpiCards = useMemo(() => {
    const tipo = String(tipoAnalise).toLowerCase();
    const totalFrota = toNumber(indicadores.totalVeiculosEscopo);
    const cards = [];
    if (tipo === "geral" || tipo === "combustivel" || tipo === "frota") {
      cards.push({ label: "Custo total", value: fmtCurrency(indicadores.totalValor), sub: "Abastecimentos no período" });
      cards.push({ label: "Consumo", value: `${fmtNumber(indicadores.totalLitros, 1)} L`, sub: "Litros no escopo" });
      if (indicadores.precoMedio != null) {
        cards.push({ label: "Preço médio", value: `R$ ${fmtNumber(indicadores.precoMedio, 2)}/L`, sub: "Valor ÷ litros" });
      }
    }
    if (tipo === "geral" || tipo === "transporte") {
      cards.push({
        label: "Viagens transporte",
        value: fmtNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens),
        sub: "Produção registrada",
      });
    }
    if (totalFrota > 0) {
      cards.push({
        label: "Frota ativa",
        value: `${fmtNumber(indicadores.veiculosAtivos)}/${fmtNumber(totalFrota)}`,
        sub: "Viagem, abastecimento ou parte diária",
      });
      cards.push({
        label: "Ociosidade",
        value: fmtNumber(indicadores.veiculosOciosos),
        sub: "Veículos sem movimento",
      });
    }
    return cards;
  }, [indicadores, tipoAnalise]);

  const status = useMemo(
    () => resolveExecutiveStatus({ overview, loading }),
    [overview, loading]
  );
  const statusStyle = STATUS_STYLES[status.label] || STATUS_STYLES.PROCESSANDO;

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
        ...vehiclesItems.map((item) => ({ value: String(item.id), label: `${item.nome || "Sem nome"} (${item.placa || "-"})` })),
      ]);
      setDriverOptions([
        DEFAULT_DRIVER_OPTIONS[0],
        ...usersItems
          .filter((u) => u.role === "MOTORISTA")
          .map((u) => ({ value: String(u.id), label: u.nome || `Motorista ${u.id}` })),
      ]);
    } catch {
      setVehicleOptions(DEFAULT_VEHICLE_OPTIONS);
      setDriverOptions(DEFAULT_DRIVER_OPTIONS);
    }
  }, []);

  const loadReport = useCallback(async (activeFilters) => {
    setLoading(true);
    setAnalysisLoading(true);
    setError("");
    try {
      const params = buildApiFilters(activeFilters);
      const { data } = await api.post("/inteligencia/gerar", {
        periodo: params.periodo,
        veiculo_id: params.veiculoId ?? null,
        motorista_id: params.motoristaId ?? null,
        tipo_analise: params.tipoAnalise,
      });
      const overviewData = data?.overview || data?.inteligencia || null;
      setOverview(overviewData);
      setRelatorio(data?.relatorio || null);
      setMeta({
        periodo: overviewData?.periodo || data?.periodo,
        tipoAnalise: params.tipoAnalise,
      });
    } catch (err) {
      setOverview(null);
      setRelatorio(null);
      setError(getFriendlyApiErrorMessage(err) || extractApiErrorMessage(err) || "Falha ao carregar relatório.");
    } finally {
      setLoading(false);
      setAnalysisLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiltersOptions();
  }, [loadFiltersOptions]);

  useEffect(() => {
    void loadReport(filters);
  }, [filters, loadReport]);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set("periodo", filters.periodo);
    next.set("tipoAnalise", filters.tipoAnalise);
    if (filters.veiculoId !== "todos") next.set("veiculoId", filters.veiculoId);
    if (filters.motoristaId !== "todos") next.set("motoristaId", filters.motoristaId);
    setSearchParams(next, { replace: true });
  }, [filters, setSearchParams]);

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

  useEffect(() => {
    if (!isPdfExportMode) return undefined;
    document.body.classList.add("fc-pdf-export-mode");
    return () => {
      document.body.classList.remove("fc-pdf-export-mode");
    };
  }, [isPdfExportMode]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (loading || analysisLoading || error) {
      window.__FC_REPORT_PDF_READY__ = false;
      document.documentElement.removeAttribute("data-fc-report-pdf-ready");
      return undefined;
    }

    let cancelled = false;
    const markReady = () => {
      if (cancelled) return;
      window.__FC_REPORT_PDF_READY__ = true;
      document.documentElement.setAttribute("data-fc-report-pdf-ready", "true");
    };

    const timer = window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(markReady));
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.__FC_REPORT_PDF_READY__ = false;
      document.documentElement.removeAttribute("data-fc-report-pdf-ready");
    };
  }, [loading, analysisLoading, error, overview, relatorio, chartData]);

  const requestLayoutPdf = useCallback(async () => {
    emitToast("Gerando PDF fiel ao layout da tela (Puppeteer)...", "info");
    const periodo = filters.periodo || "mes";
    const fallbackName = `relatorio-inteligencia-${periodo}.pdf`;
    const result = await downloadInteligenciaPdf(filters, { fallbackName });
    if (result?.disabled) {
      emitToast(result.mensagem, "warning");
      return;
    }
    emitToast(`PDF baixado (${result.filename}).`, "success");
  }, [filters]);

  const handleExportPdf = useCallback(async () => {
    if (loading || analysisLoading) {
      emitToast("Aguarde o relatório terminar de carregar.", "warning");
      return;
    }
    setHtmlPdfLoading(true);
    try {
      await requestLayoutPdf();
    } catch (err) {
      const message = await parseBlobErrorMessage(err, "Falha ao gerar PDF. Tente novamente em alguns segundos.");
      console.error("Falha ao exportar PDF:", err);
      emitToast(message, "error");
    } finally {
      setHtmlPdfLoading(false);
    }
  }, [loading, analysisLoading, requestLayoutPdf]);

  const handleDownloadCompactPdf = useCallback(async () => {
    if (loading || analysisLoading) {
      emitToast("Aguarde o relatório terminar de carregar.", "warning");
      return;
    }
    setCompactPdfLoading(true);
    try {
      await requestLayoutPdf();
    } catch (err) {
      const message = await parseBlobErrorMessage(err, "Falha ao gerar PDF no servidor.");
      emitToast(message, "error");
    } finally {
      setCompactPdfLoading(false);
    }
  }, [loading, analysisLoading, requestLayoutPdf]);

  const resumoExecutivo = overview?.resumo || relatorio?.resumoExecutivo || relatorio?.resumo_executivo || "";
  const diagnostico =
    relatorio?.diagnosticoDetalhado ||
    overview?.complemento_gpt?.diagnostico ||
    (Array.isArray(overview?.problemas) && overview.problemas.length ? overview.problemas.join(" ") : "") ||
    relatorio?.diagnostico ||
    "";
  const impactoFinanceiro =
    overview?.complemento_gpt?.impacto ||
    relatorio?.impactoFinanceiro ||
    relatorio?.impacto_financeiro ||
    overview?.contexto?.separacao?.combustivel?.resumo ||
    "";
  const acoes = Array.isArray(overview?.recomendacoes)
    ? overview.recomendacoes
    : Array.isArray(relatorio?.acoes)
      ? relatorio.acoes
      : relatorio?.acoes_recomendadas || [];
  const riscos = Array.isArray(relatorio?.riscos)
    ? relatorio.riscos
    : Array.isArray(relatorio?.riscos_operacionais)
      ? relatorio.riscos_operacionais
      : Array.isArray(overview?.problemas)
        ? overview.problemas
        : [];
  const observacaoHistorico =
    overview?.contexto?.operacional?.observacaoHistorico ||
    relatorio?.observacaoHistorico ||
    relatorio?.observacao_historico ||
    "";
  const inconsistencias = overview?.inconsistencias || overview?.problemas || [];
  const inconsistenciasDetalhadas = overview?.inconsistencias_detalhadas || [];
  const hasInconsistencias = inconsistencias.length > 0 || inconsistenciasDetalhadas.length > 0;
  const contextoOperacional = overview?.contexto_operacional || overview?.contexto?.operacional || null;
  const insightsAutomaticos = useMemo(() => {
    const raw = overview?.insights || overview?.insights_automaticos || [];
    return raw.map((item) => (typeof item === "string" ? { tipo: "INSIGHT", mensagem: item } : item));
  }, [overview]);
  const regraDeOuro = useMemo(() => resolveRegraDeOuro({ overview, relatorio }), [overview, relatorio]);
  const painelExecutivo = overview?.painel_executivo || overview?.mio?.painel_executivo || null;
  const narrativaExecutiva = overview?.narrativa_executiva || overview?.mio?.narrativa_executiva || null;
  const topRiscos = overview?.top_riscos || overview?.priorizacao?.top_riscos || [];
  const acaoImediata = overview?.acao_imediata || overview?.priorizacao?.acao_imediata || null;
  const riscoFinanceiroEstimado =
    overview?.risco_financeiro_estimado || overview?.priorizacao?.risco_financeiro_estimado || null;
  const modulosLeitura = overview?.modulos_leitura || relatorio?.analiseModulos || relatorio?.analise_modulos || {};
  const modulos = {
    combustivel: modulosLeitura.combustivel?.leitura || modulosLeitura.combustivel || "",
    transporte: modulosLeitura.transporte?.leitura || modulosLeitura.transporte || "",
    frota: modulosLeitura.frota?.leitura || modulosLeitura.frota || "",
    apoio: modulosLeitura.frota?.leitura || modulosLeitura.apoio || "",
  };
  const origemIa = mapOrigemIa(overview?.origem || relatorio?.origem);
  const origemLabel =
    overview?.origem === "motor_operacional+gpt" || relatorio?.origem === "motor_operacional+gpt"
      ? "Motor operacional + complemento GPT (diagnóstico, impacto e recomendações adicionais)."
      : overview?.origem === "motor_operacional" || relatorio?.origem === "motor_operacional"
        ? "Texto gerado pelo motor operacional com base nos lançamentos do período."
        : relatorio?.origem === "openai"
        ? "Resposta gerada pela IA com base nos lançamentos do período."
        : relatorio?.origem === "cache"
          ? "Resposta reutilizada (cache) — mesmos filtros e dados anteriores."
          : relatorio?.origem === "limit"
            ? "Limite diário de IA atingido — texto gerado por regras automáticas."
            : overview?.origem || relatorio?.origem
              ? "Texto gerado por regras automáticas com seus dados."
              : "";

  return (
    <div className="fc-report-page min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link to="/inteligencia/executivo" className="text-sm font-medium text-blue-700 hover:text-blue-800">
            ← Voltar para Inteligência
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadReport(filters)}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? "Atualizando..." : "Atualizar relatório"}
            </button>
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={loading || analysisLoading || htmlPdfLoading}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60"
            >
              {htmlPdfLoading ? "Gerando PDF..." : "Baixar PDF (layout BI)"}
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadCompactPdf()}
              disabled={loading || compactPdfLoading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {compactPdfLoading ? "Gerando..." : "Baixar PDF (servidor)"}
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700 print:hidden">
          <p className="font-semibold text-slate-900">Relatório alimentado pelo backend</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Layout, KPIs e gráficos</strong> vêm dos lançamentos reais (abastecimentos, viagens, parte
              diária). Ao lançar dados novos, clique em «Atualizar relatório».
            </li>
            <li>
              <strong>Resumo, diagnóstico, insights e ações</strong> vêm do endpoint <code>/inteligencia/overview</code>{" "}
              (motor operacional, sem GPT).
            </li>
            <li>
              <strong>Baixar PDF (layout BI)</strong> gera o PDF a partir da página renderizada (Puppeteer no servidor),
              com os mesmos gráficos, cores e textos exibidos na tela.
            </li>
          </ul>
        </div>

        <div
          ref={reportRef}
          className="fc-report-document rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none sm:p-8"
        >
          <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
            <div className="flex min-w-0 items-start gap-4">
              <CompanyLogo
                logoUrl={user?.logo_url}
                companyName={user?.empresa_nome || user?.nome || "Empresa"}
                className="!h-14 !w-14 !rounded-xl !border-slate-200 !bg-white"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Relatório Executivo</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Inteligência Operacional</h1>
                <p className="mt-1 text-sm text-slate-600">{user?.empresa_nome || user?.nome || "Empresa"}</p>
                <p className="mt-2 text-sm text-slate-500">
                  {compactDate(meta?.periodo?.inicio)} → {compactDate(meta?.periodo?.fim)} · Escopo:{" "}
                  <span className="font-medium uppercase text-slate-700">{tipoAnalise}</span>
                </p>
              </div>
            </div>
            <div
              className={`rounded-2xl border px-6 py-4 text-center ${statusStyle.bg} ${statusStyle.border}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Status</p>
              <p className={`mt-1 text-3xl font-black tracking-tight ${statusStyle.text}`}>{status.label}</p>
              <p className="mt-2 max-w-xs text-sm text-slate-600">{status.detail}</p>
            </div>
          </header>

          <div className="mt-6 print:hidden">
            <IntelligenceFiltersCard
              filters={filters}
              onChange={onFiltersChange}
              vehicleOptions={vehicleOptions}
              driverOptions={driverOptions}
              embedded
              variant="light"
            />
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          ) : null}

          {contextoOperacional?.baseEmTeste ? (
            <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-semibold">Base em fase inicial (teste)</p>
              <p className="mt-1">
                {contextoOperacional.totalVeiculos} veículo(s) no escopo · {contextoOperacional.veiculosAtivos} ativo(s)
                {contextoOperacional.periodoInicial && contextoOperacional.periodoFinal
                  ? ` · ${compactDate(contextoOperacional.periodoInicial)} → ${compactDate(contextoOperacional.periodoFinal)}`
                  : ""}
                . Análises preliminares — aguardar mais lançamentos para padrão consolidado.
              </p>
            </div>
          ) : null}

          <ExecutiveReportIndex sections={REPORT_SECTIONS} />

          <div id="regra-de-ouro" className="mt-8 scroll-mt-6">
            <ExecutiveRegraDeOuroCard regra={regraDeOuro} loading={loading} />
          </div>

          <div className="mt-8 space-y-8">
            <ExecutiveReportSection
              id="painel-executivo"
              icon="🎯"
              title="Painel Executivo"
              subtitle="Scores calculados pelo Motor de Inteligência Operacional (MIO) com base nos lançamentos reais"
              source="dados"
              tone="default"
            >
              <ExecutiveMioPanel painelExecutivo={painelExecutivo} loading={loading} />
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="o-que-aconteceu"
              icon="📌"
              title="O que aconteceu"
              subtitle="Síntese factual derivada da correlação entre módulos operacionais"
              source="dados"
              tone="default"
              isEmpty={!loading && !narrativaExecutiva?.o_que_aconteceu}
              emptyMessage="Sem eventos correlacionados no período."
            >
              <ExecutiveMioNarrativeBlock narrativa={narrativaExecutiva?.o_que_aconteceu} loading={loading} />
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="por-que-importa"
              icon="❗"
              title="Por que isso importa"
              subtitle="Impacto executivo do principal achado operacional"
              source="dados"
              tone={status.label === "CRÍTICO" ? "critical" : "default"}
              isEmpty={!loading && !narrativaExecutiva?.por_que_importa}
              emptyMessage="Sem impacto prioritário identificado."
            >
              <ExecutiveMioNarrativeBlock narrativa={narrativaExecutiva?.por_que_importa} loading={loading} />
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="acao-prioritaria"
              icon="🚀"
              title="Ação prioritária"
              subtitle="Recomendação imediata com base nos dados do período"
              source="dados"
              tone="default"
              isEmpty={!loading && !narrativaExecutiva?.acao_prioritaria}
              emptyMessage="Nenhuma ação prioritária derivada dos dados."
            >
              <ExecutiveMioNarrativeBlock narrativa={narrativaExecutiva?.acao_prioritaria} loading={loading} />
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="top-riscos"
              icon="🔥"
              title="Top 5 Riscos Operacionais"
              subtitle="Priorização automática por score de risco (0–100) — financeiro, operacional, recorrência e confiabilidade"
              source="dados"
              tone="default"
              isEmpty={!loading && !topRiscos.length}
              emptyMessage="Nenhum risco operacional prioritário no período."
            >
              <ExecutiveRiskPanel topRiscos={topRiscos} loading={loading} />
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="acao-imediata"
              icon="⚡"
              title="Ação imediata recomendada"
              subtitle="Uma única ação prioritária derivada do risco de maior pontuação"
              source="dados"
              tone={topRiscos[0]?.classificacao === "CRITICO" ? "critical" : "default"}
              isEmpty={!loading && !acaoImediata}
              emptyMessage="Sem ação imediata derivada dos riscos identificados."
            >
              <ExecutiveImmediateActionBlock acao={acaoImediata} loading={loading} />
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="risco-financeiro-estimado"
              icon="💸"
              title="Risco financeiro estimado"
              subtitle="Exposição potencial calculada com base nos valores reais do período"
              source="dados"
              tone="warning"
              isEmpty={!loading && !riscoFinanceiroEstimado?.mensagem}
              emptyMessage="Estimativa financeira indisponível para o recorte."
            >
              <ExecutiveFinancialRiskBlock riscoFinanceiro={riscoFinanceiroEstimado} loading={loading} />
            </ExecutiveReportSection>
          </div>

          <div className="mt-8 space-y-8">
            <ExecutiveReportSection
              id="resumo-executivo"
              icon="📊"
              title="Resumo Executivo"
              subtitle="Síntese para decisão — gerada pelo motor operacional com base nos lançamentos do período"
              source={origemIa}
              tone={status.label === "CRÍTICO" ? "critical" : "default"}
              isEmpty={!loading && !resumoExecutivo}
              emptyMessage={overview?.mensagem || "Sem resumo para o escopo selecionado."}
            >
              <p className="text-base font-medium leading-relaxed text-slate-900">
                {loading ? "Carregando..." : resumoExecutivo}
              </p>
              {!loading && (overview?.status_operacao?.label || relatorio?.statusOperacao) ? (
                <p className="mt-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">Status operacional:</span>{" "}
                  {overview?.status_operacao?.label || relatorio?.statusOperacao}
                </p>
              ) : null}
              {!loading && origemLabel ? <p className="mt-2 text-xs text-slate-500">{origemLabel}</p> : null}
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="inconsistencias"
              icon="⚠️"
              title="Inconsistências detectadas"
              subtitle="Validação cruzada viagens × abastecimento por veículo de transporte"
              source="dados"
              tone={hasInconsistencias ? "critical" : "default"}
            >
              <ExecutiveInconsistenciasBlock
                inconsistenciasDetalhadas={inconsistenciasDetalhadas}
                inconsistencias={inconsistencias}
              />
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="indicadores"
              icon="📈"
              title="Indicadores principais"
              subtitle="KPIs operacionais e financeiros do recorte selecionado"
              source="dados"
              isEmpty={!loading && kpiCards.length === 0}
              emptyMessage="Sem indicadores para o período e filtros atuais."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {loading
                  ? [1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                    ))
                  : kpiCards.map((card) => (
                      <KpiCard key={card.label} {...card} />
                    ))}
              </div>
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="graficos"
              icon="📉"
              title="Gráficos explicados"
              subtitle="Visualização dos dados reais com leitura automática abaixo de cada gráfico (regras, não GPT)"
              source="dados"
            >
              {insightsAutomaticos.length > 0 ? (
                <ul className="mb-6 space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  {insightsAutomaticos.map((item) => (
                    <li key={`${item.tipo}-${item.mensagem}`} className="text-sm text-slate-800">
                      <span className="mr-2 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        Insight
                      </span>
                      {item.mensagem}
                    </li>
                  ))}
                </ul>
              ) : null}
              {loading ? (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-[420px] animate-pulse rounded-2xl bg-slate-100" />
                  ))}
                </div>
              ) : (
                <ExecutiveReportCharts
                  pieData={chartData.pieData}
                  lineData={chartData.lineData}
                  barData={chartData.barData}
                  tipoAnalise={tipoAnalise}
                />
              )}
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="diagnostico-ia"
              icon="🧠"
              title="Diagnóstico operacional"
              subtitle="Interpretação contextual dos indicadores — transporte vs apoio"
              source={origemIa}
              tone={hasInconsistencias ? "critical" : "default"}
              isEmpty={!loading && !diagnostico && !modulos.combustivel && !modulos.transporte}
              emptyMessage={overview?.mensagem || "Sem diagnóstico disponível para o escopo."}
            >
              <div className="space-y-4 text-sm leading-relaxed text-slate-800">
                <p className="text-base font-medium text-slate-900">
                  {loading ? "Carregando..." : diagnostico || overview?.resumo || ""}
                </p>
                {(modulos.combustivel || modulos.transporte || modulos.apoio || modulos.frota) && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {modulos.combustivel ? (
                      <article className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Combustível</p>
                        <p className="mt-2">{modulos.combustivel}</p>
                      </article>
                    ) : null}
                    {modulos.transporte ? (
                      <article className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transporte</p>
                        <p className="mt-2">{modulos.transporte}</p>
                      </article>
                    ) : null}
                    {modulos.apoio || modulos.frota ? (
                      <article className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Apoio</p>
                        <p className="mt-2">{modulos.apoio || modulos.frota}</p>
                      </article>
                    ) : null}
                  </div>
                )}
                {observacaoHistorico ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">
                    <span className="font-semibold">Qualidade dos dados:</span> {observacaoHistorico}
                  </p>
                ) : null}
              </div>
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="impacto-financeiro"
              icon="💰"
              title="Impacto financeiro"
              subtitle="Consequência econômica dos indicadores no período"
              source={origemIa}
              tone="finance"
              isEmpty={!loading && !impactoFinanceiro && !toNumber(indicadores.totalValor)}
              emptyMessage={overview?.mensagem || "Impacto financeiro não calculado — verifique lançamentos de abastecimento."}
            >
              <p className="text-base font-medium leading-relaxed text-slate-900">
                {loading ? "Carregando..." : impactoFinanceiro}
              </p>
              {!loading && toNumber(indicadores.totalValor) > 0 ? (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <KpiCard label="Custo total" value={fmtCurrency(indicadores.totalValor)} sub="Combustível" />
                  <KpiCard
                    label="Transporte"
                    value={fmtCurrency(indicadores.totalValorTransporte)}
                    sub={`${fmtNumber(indicadores.totalLitrosTransporte, 1)} L`}
                  />
                  <KpiCard
                    label="Apoio"
                    value={fmtCurrency(indicadores.totalValorApoio)}
                    sub={`${fmtNumber(indicadores.totalLitrosApoio, 1)} L`}
                  />
                </div>
              ) : null}
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="recomendacoes"
              icon="🛠️"
              title="Recomendações"
              subtitle="Ações práticas priorizadas pelo motor operacional para o recorte analisado"
              source={origemIa}
              tone="action"
              isEmpty={!loading && !acoes.length && !riscos.length}
              emptyMessage={overview?.mensagem || "Nenhuma recomendação específica para o escopo."}
            >
              {acoes.length > 0 ? (
                <div className="mb-6">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Ações recomendadas</p>
                  <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-800">
                    {acoes.slice(0, 8).map((acao) => (
                      <li key={acao}>{acao}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {riscos.length > 0 ? (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Riscos operacionais</p>
                  <ul className="list-disc space-y-2 pl-5 text-sm text-slate-800">
                    {riscos.slice(0, 6).map((risco) => (
                      <li key={risco}>{risco}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </ExecutiveReportSection>

            <ExecutiveReportSection
              id="parte-diaria"
              icon="📋"
              title="Parte diária (apoio)"
              subtitle="Produtividade de veículos de apoio no período"
              source="dados"
              className="fc-report-section-parte-diaria"
            >
              <ExecutiveReportParteDiaria parteDiaria={overview?.parte_diaria} loading={loading} embedded />
            </ExecutiveReportSection>
          </div>

          <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
            Gerado em {new Date().toLocaleString("pt-BR")} · FrotaControl Inteligência · Layout HTML premium (base para PDF)
          </footer>
        </div>
      </div>
    </div>
  );
}
