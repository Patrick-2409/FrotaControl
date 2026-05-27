import { useCallback, useEffect, useMemo, useState } from "react";
import BIDashboardShell from "../modules/company/bi/components/BIDashboardShell";
import IntelligenceFiltersCard from "../modules/company/intelligence/components/IntelligenceFiltersCard";
import IntelligenceChartsPanel from "../modules/company/intelligence/components/IntelligenceChartsPanel";
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

const getFilenameFromDisposition = (contentDisposition, fallback = "inteligencia-operacional.pdf") => {
  const raw = String(contentDisposition || "");
  const utf8Match = raw.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).replace(/["']/g, "").trim() || fallback;
    } catch {
      return utf8Match[1].replace(/["']/g, "").trim() || fallback;
    }
  }
  const simpleMatch = raw.match(/filename\s*=\s*"?([^";]+)"?/i);
  return simpleMatch?.[1]?.trim() || fallback;
};

const parseBlobErrorMessage = async (error, fallback) => {
  const maybeBlob = error?.response?.data;
  if (maybeBlob instanceof Blob) {
    try {
      const raw = await maybeBlob.text();
      const parsed = JSON.parse(raw);
      return parsed?.message || parsed?.error || fallback;
    } catch {
      return fallback;
    }
  }
  return getFriendlyApiErrorMessage(error) || extractApiErrorMessage(error) || fallback;
};

const triggerPdfDownload = (url, filename) => {
  if (!url) return false;
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "inteligencia-operacional.pdf";
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch {
    return false;
  }
};

function SummarySkeleton() {
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 sm:p-5">
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-36 rounded bg-zinc-800/80" />
        <div className="h-9 w-2/3 rounded bg-zinc-800/70" />
        <div className="grid grid-cols-1 gap-3">
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
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState("");
  const [pdfFilename, setPdfFilename] = useState("inteligencia-operacional.pdf");

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
        veiculo_id: item?.veiculo_id ?? item?.veiculoId ?? item?.veiculo ?? "sem-id",
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

  const moduloCombustivel = useMemo(
    () => ({
      consumoTotal: resumoOperacional.totalLitros,
      custoTotal: resumoOperacional.totalValor,
      precoMedio: resumoOperacional.precoMedio,
      insight:
        resumoOperacional.totalLitros > 0
          ? "Consumo registrado no período selecionado."
          : "Sem consumo registrado no período selecionado.",
    }),
    [resumoOperacional]
  );

  const moduloTransporte = useMemo(
    () => ({
      viagens: resumoOperacional.totalViagens,
      insight:
        resumoOperacional.totalViagens > 0
          ? "Há produção registrada no recorte atual."
          : "0 viagens registradas no período.",
    }),
    [resumoOperacional]
  );

  const moduloFrota = useMemo(
    () => ({
      veiculosAtivos: resumoOperacional.veiculosAtivos,
      veiculosOciosos: resumoOperacional.veiculosOciosos,
      insight:
        resumoOperacional.veiculosOciosos > 0
          ? `${fmtNumber(resumoOperacional.veiculosOciosos)} veículo(s) ocioso(s) no período.`
          : "Sem ociosidade relevante no recorte atual.",
    }),
    [resumoOperacional]
  );

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

      const pdfResponse = await api.post("/inteligencia/pdf", payload, {
        responseType: "blob",
        skipGlobalErrorToast: true,
      });
      const nextFilename = getFilenameFromDisposition(
        pdfResponse?.headers?.["content-disposition"],
        `inteligencia-${apiFilters.periodo || "mes"}.pdf`
      );
      const blobUrl = URL.createObjectURL(pdfResponse.data);
      setPdfDownloadUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return blobUrl;
      });
      setPdfFilename(nextFilename);

      const downloaded = triggerPdfDownload(blobUrl, nextFilename);
      if (downloaded) {
        emitToast("Análise gerada e PDF baixado com sucesso.");
      } else {
        emitToast("PDF gerado. Toque em 'Baixar PDF agora'.", "warning");
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

  const baixarPdfAgora = useCallback(() => {
    if (!pdfDownloadUrl) {
      emitToast("Gere uma análise antes de baixar o PDF.", "warning");
      return;
    }
    const downloaded = triggerPdfDownload(pdfDownloadUrl, pdfFilename);
    if (!downloaded) {
      window.open(pdfDownloadUrl, "_blank", "noopener,noreferrer");
    }
  }, [pdfDownloadUrl, pdfFilename]);

  useEffect(() => {
    void loadFiltersOptions();
  }, [loadFiltersOptions]);

  useEffect(() => {
    void loadOverview(filters);
  }, [filters, loadOverview]);

  useEffect(
    () => () => {
      if (pdfDownloadUrl) URL.revokeObjectURL(pdfDownloadUrl);
    },
    [pdfDownloadUrl]
  );

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
    >
      <div className="space-y-4 px-1 pb-20 sm:space-y-6 sm:px-0 sm:pb-0">
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
              {analysisLoading ? "Gerando análise e PDF..." : "Gerar Análise Inteligente"}
            </button>
            <button
              type="button"
              className="fc-btn w-full rounded-md border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-100 transition-all duration-300 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={baixarPdfAgora}
              disabled={analysisLoading || !pdfDownloadUrl}
            >
              Baixar PDF agora
            </button>
            {analysisError ? <p className="text-sm text-red-400">{analysisError}</p> : null}
          </div>
        </AccordionSection>

        <AccordionSection
          id="inteligencia-resumo"
          title="Leitura executiva"
          description={periodoLabel}
          defaultOpenDesktop={false}
          defaultOpenMobile={false}
        >
          {overviewLoading ? (
            <SummarySkeleton />
          ) : !hasOperationalData ? (
            <section className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-300">
              Sem dados para o período selecionado
            </section>
          ) : (
            <section className="transition-all duration-300">
              <div className="grid grid-cols-1 gap-3">
                <InsightCard title="1. Combustível" tone={impactoFinanceiro.exposicaoSemProducao > 0 ? "warning" : "default"}>
                  <div className="space-y-1">
                    <p>
                      <span className="text-zinc-400">Consumo total:</span> {fmtNumber(moduloCombustivel.consumoTotal)} L
                    </p>
                    <p>
                      <span className="text-zinc-400">Custo total:</span> {fmtCurrency(moduloCombustivel.custoTotal)}
                    </p>
                    <p>
                      <span className="text-zinc-400">Preço médio:</span>{" "}
                      {moduloCombustivel.precoMedio != null ? fmtCurrency(moduloCombustivel.precoMedio) : "Sem base"}
                    </p>
                    <p className="text-zinc-300">{moduloCombustivel.insight}</p>
                  </div>
                </InsightCard>

                <InsightCard title="2. Transporte" tone={moduloTransporte.viagens === 0 ? "warning" : "ok"}>
                  <div className="space-y-1">
                    <p>
                      <span className="text-zinc-400">Viagens:</span> {fmtNumber(moduloTransporte.viagens)}
                    </p>
                    <p className="text-zinc-300">{moduloTransporte.insight}</p>
                  </div>
                </InsightCard>

                <InsightCard title="3. Frota" tone={moduloFrota.veiculosOciosos > 0 ? "warning" : "ok"}>
                  <div className="space-y-1">
                    <p>
                      <span className="text-zinc-400">Veículos ativos:</span> {fmtNumber(moduloFrota.veiculosAtivos)}
                    </p>
                    <p>
                      <span className="text-zinc-400">Veículos ociosos:</span> {fmtNumber(moduloFrota.veiculosOciosos)}
                    </p>
                    <p className="text-zinc-300">{moduloFrota.insight}</p>
                  </div>
                </InsightCard>

                <InsightCard title="4. Resumo executivo" tone={statusGeral.tone === "critical" ? "critical" : "default"}>
                  <div className="space-y-2">
                    <div className="inline-flex rounded-full border border-current px-3 py-1 text-xs font-semibold">
                      Status: {statusGeral.label}
                    </div>
                    <p className="text-sm text-zinc-300">{statusGeral.detail}</p>
                    <p className="font-medium">{diagnosticoPrincipal}</p>
                    <div className="space-y-1">
                      {acoesRecomendadas.slice(0, 3).map((item) => (
                        <p key={item} className="text-sm">
                          - {item}
                        </p>
                      ))}
                    </div>
                  </div>
                </InsightCard>
              </div>
            </section>
          )}
        </AccordionSection>

        {overviewError ? <p className="text-sm text-red-400">{overviewError}</p> : null}

        <AccordionSection
          id="inteligencia-graficos"
          title="5. Gráficos de apoio"
          description="Visual para consumo, custo e produção"
          defaultOpenDesktop={false}
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
