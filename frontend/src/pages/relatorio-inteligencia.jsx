import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CompanyLogo from "../components/CompanyLogo";
import IntelligenceFiltersCard from "../modules/company/intelligence/components/IntelligenceFiltersCard";
import ExecutiveReportCharts from "../modules/company/intelligence/components/ExecutiveReportCharts";
import ExecutiveReportParteDiaria from "../modules/company/intelligence/components/ExecutiveReportParteDiaria";
import { mapOrigemIa, SourceBadge } from "../modules/company/intelligence/components/ChartReportBlocks";
import { useAuth } from "../services/auth";
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

function resolveExecutiveStatus({ overview, relatorio, loading }) {
  if (loading) return { label: "PROCESSANDO", detail: "Carregando dados do relatório..." };
  const inconsistencias = overview?.inconsistencias || [];
  if (inconsistencias.length > 0) {
    return {
      label: "CRÍTICO",
      detail: `${inconsistencias.length} inconsistência(s) de dados — corrigir antes de decidir.`,
    };
  }
  const status = overview?.status_operacao;
  if (status?.label) {
    const normalized = String(status.label).toUpperCase();
    if (normalized.includes("CRÍT") || normalized.includes("CRIT")) {
      return { label: "CRÍTICO", detail: status.detail || status.descricao || "Operação com risco elevado." };
    }
    if (normalized.includes("ATEN")) {
      return { label: "ATENÇÃO", detail: status.detail || status.descricao || "Pontos que exigem acompanhamento." };
    }
    return { label: "OK", detail: status.detail || status.descricao || "Operação dentro do esperado." };
  }
  const indicadores = overview?.indicadores || {};
  if (toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens) === 0 && toNumber(indicadores.totalLitros) > 0) {
    return { label: "CRÍTICO", detail: "Consumo registrado sem produção de transporte no período." };
  }
  if (toNumber(indicadores.veiculosOciosos) > 0) {
    return { label: "ATENÇÃO", detail: `${fmtNumber(indicadores.veiculosOciosos)} veículo(s) ocioso(s) no escopo.` };
  }
  if (relatorio?.prioridadeInconsistencia) {
    return { label: "CRÍTICO", detail: "Prioridade na correção de dados operacionais." };
  }
  return { label: "OK", detail: "Indicadores coerentes no recorte selecionado." };
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

function InsightBlock({ title, children, tone = "default", source }) {
  const tones = {
    default: "border-slate-200 bg-white",
    critical: "border-red-200 bg-red-50",
    action: "border-blue-200 bg-blue-50",
  };
  return (
    <article className={`rounded-xl border p-5 shadow-sm ${tones[tone] || tones.default}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
        {source ? <SourceBadge type={source} /> : null}
      </div>
      <div className="mt-3 text-sm leading-relaxed text-slate-800">{children}</div>
    </article>
  );
}

export default function RelatorioInteligenciaPage() {
  const { user } = useAuth();
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
  const [error, setError] = useState("");

  const indicadores = overview?.indicadores || {};
  const tipoAnalise = filters.tipoAnalise || "geral";

  const chartData = useMemo(
    () => ({
      pieData: (overview?.consumo_por_veiculo || []).map((item) => ({
        veiculo_id: item?.veiculo_id ?? item?.veiculoId ?? item?.veiculo,
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
    () => resolveExecutiveStatus({ overview, relatorio, loading: loading || analysisLoading }),
    [overview, relatorio, loading, analysisLoading]
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
      const [overviewRes, analysisRes] = await Promise.all([
        api.get("/inteligencia/overview", { params }),
        api.post("/inteligencia/gerar", {
          periodo: params.periodo,
          veiculo_id: params.veiculoId ?? null,
          motorista_id: params.motoristaId ?? null,
          tipo_analise: params.tipoAnalise,
        }),
      ]);
      setOverview(overviewRes.data || null);
      setRelatorio(analysisRes.data?.relatorio || null);
      setMeta({
        periodo: overviewRes.data?.periodo || analysisRes.data?.periodo,
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

  const handleExportPdf = () => {
    emitToast("Exportação direta deste layout HTML em breve. Use Inteligência → Gerar PDF.", "info");
  };

  const resumoExecutivo =
    relatorio?.resumoExecutivo ||
    relatorio?.resumo_executivo ||
    relatorio?.problemaPrincipal ||
    "Aguardando análise inteligente para o escopo selecionado.";
  const diagnostico = relatorio?.diagnosticoDetalhado || relatorio?.diagnostico || "";
  const acoes = Array.isArray(relatorio?.acoes) ? relatorio.acoes : relatorio?.acoes_recomendadas || [];
  const riscos = Array.isArray(relatorio?.riscos) ? relatorio.riscos : [];
  const inconsistencias = overview?.inconsistencias || [];
  const modulos = relatorio?.analiseModulos || relatorio?.analise_modulos || {};
  const origemIa = mapOrigemIa(relatorio?.origem);
  const origemLabel =
    relatorio?.origem === "openai"
      ? "Resposta gerada pela IA com base nos lançamentos do período."
      : relatorio?.origem === "cache"
        ? "Resposta reutilizada (cache) — mesmos filtros e dados anteriores."
        : relatorio?.origem === "limit"
          ? "Limite diário de IA atingido — texto gerado por regras automáticas."
          : "IA indisponível ou sem chave — texto gerado por regras automáticas com seus dados.";

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
              onClick={handleExportPdf}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
            >
              Exportar PDF
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none sm:p-8">
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

          {inconsistencias.length > 0 ? (
            <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-5">
              <p className="text-sm font-bold uppercase tracking-wide text-red-800">Erro de dados detectado</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-900">
                {inconsistencias.slice(0, 5).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <InsightBlock
              title="Resumo executivo"
              tone={status.label === "CRÍTICO" ? "critical" : "default"}
              source={origemIa}
            >
              <p className="text-base font-medium text-slate-900">{loading ? "Carregando..." : resumoExecutivo}</p>
              {!loading && relatorio?.origem ? (
                <p className="mt-2 text-xs text-slate-500">{origemLabel}</p>
              ) : null}
            </InsightBlock>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Indicadores</p>
                <SourceBadge type="dados" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {loading
                  ? [1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)
                  : kpiCards.map((card) => <KpiCard key={card.label} {...card} />)}
              </div>
            </div>
          </section>

          <section className="mt-10">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Análise visual</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Gráficos operacionais</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Números e curvas vêm dos seus abastecimentos, viagens e partes diárias. A leitura abaixo de cada gráfico
                  é automática (não é GPT).
                </p>
              </div>
              <SourceBadge type="dados" />
            </header>
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
          </section>

          <section className="mt-10 border-t border-slate-200 pt-10">
            <ExecutiveReportParteDiaria parteDiaria={overview?.parte_diaria} loading={loading} />
          </section>

          <section className="mt-10 border-t border-slate-200 pt-10">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Inteligência artificial</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Diagnóstico e ações</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Ao abrir ou atualizar o relatório, o sistema envia os indicadores do período para a IA (ou usa regras
                  se o limite/chave não permitir).
                </p>
              </div>
              <SourceBadge type={origemIa} />
            </header>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <InsightBlock title="Diagnóstico" tone={inconsistencias.length ? "critical" : "default"} source={origemIa}>
                {analysisLoading ? "Gerando análise..." : diagnostico || "Sem diagnóstico disponível."}
              </InsightBlock>
              <InsightBlock title="Ações recomendadas" tone="action" source={origemIa}>
                {acoes.length ? (
                  <ul className="list-disc space-y-2 pl-5">
                    {acoes.slice(0, 6).map((acao) => (
                      <li key={acao}>{acao}</li>
                    ))}
                  </ul>
                ) : (
                  "Nenhuma ação específica gerada para o escopo."
                )}
              </InsightBlock>
            </div>

            {(modulos.combustivel || modulos.transporte || modulos.apoio || modulos.frota) && (
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                {modulos.combustivel ? (
                  <InsightBlock title="Combustível" source={origemIa}>
                    <p>{modulos.combustivel}</p>
                  </InsightBlock>
                ) : null}
                {modulos.transporte ? (
                  <InsightBlock title="Transporte" source={origemIa}>
                    <p>{modulos.transporte}</p>
                  </InsightBlock>
                ) : null}
                {modulos.apoio || modulos.frota ? (
                  <InsightBlock title="Apoio" source={origemIa}>
                    <p>{modulos.apoio || modulos.frota}</p>
                  </InsightBlock>
                ) : null}
              </div>
            )}

            {riscos.length > 0 ? (
              <div className="mt-6">
                <InsightBlock title="Riscos operacionais" source={origemIa}>
                  <ul className="list-disc space-y-2 pl-5">
                    {riscos.slice(0, 5).map((risco) => (
                      <li key={risco}>{risco}</li>
                    ))}
                  </ul>
                </InsightBlock>
              </div>
            ) : null}
          </section>

          <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
            Gerado em {new Date().toLocaleString("pt-BR")} · FrotaControl Inteligência · Layout HTML premium (base para PDF)
          </footer>
        </div>
      </div>
    </div>
  );
}
