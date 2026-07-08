import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SkeletonRows from "../../../../components/SkeletonRows";
import ConfirmActionModal from "../../../../components/ConfirmActionModal";
import BIDashboardShell from "../../bi/components/BIDashboardShell";
import BIChartCard from "../../bi/components/BIChartCard";
import TransportPlannedVsActualBars from "../components/TransportPlannedVsActualBars";
import TransportPlanExecutadoPizza from "../components/TransportPlanExecutadoPizza";
import { TransportProvider } from "../../contexts/TransportContext";
import { useTransportMetrics } from "../../hooks/useTransportMetrics";
import EmpresaModuleErrorPanel from "../../shared/components/EmpresaModuleErrorPanel";
import AccordionSection from "../../shared/components/AccordionSection";
import TooltipInfo from "../../shared/components/TooltipInfo";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtTon = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtPct = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

const fmtCountLabel = (count, singular, plural) => {
  const n = Number(count) || 0;
  return `${fmtInt(n)} ${n === 1 ? singular : plural}`;
};

function getTransportCount(row, material = "todos") {
  if (material === "esteril") {
    const esteril = Number(row?.viagens_esteril);
    return Number.isFinite(esteril) ? esteril : 0;
  }
  if (material === "rocha_pulmao") {
    const rochaPulmao = Number(row?.viagens_rocha_pulmao);
    return Number.isFinite(rochaPulmao) ? rochaPulmao : 0;
  }
  if (material === "rocha_armacao") {
    const rochaArmacao = Number(row?.viagens_rocha_armacao);
    return Number.isFinite(rochaArmacao) ? rochaArmacao : 0;
  }
  if (material === "rocha") {
    const rocha = Number(row?.viagens_rocha);
    return Number.isFinite(rocha) ? rocha : 0;
  }
  const viagens = Number(row?.viagens);
  if (Number.isFinite(viagens) && viagens > 0) return viagens;
  const romaneios = Number(row?.romaneios);
  return Number.isFinite(romaneios) ? romaneios : 0;
}

function materialTitulo(material) {
  if (material === "esteril") return "Estéril";
  if (material === "rocha_pulmao") return "Rocha Pulmão";
  if (material === "rocha_armacao") return "Rocha Armação";
  return "Todos os materiais";
}

function fmtShortDateBr(ymd) {
  if (!ymd || typeof ymd !== "string") return "—";
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function fmtDiaBr(ymd) {
  if (!ymd || typeof ymd !== "string") return "—";
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function pctTone(p) {
  if (p >= 100) return "text-emerald-300";
  if (p >= 70) return "text-amber-200";
  return "text-rose-300";
}

function EmpresaTransportePageContent() {
  const { operations: tr, metrics: prod, materialTab, setMaterialTab } = useTransportMetrics();
  const [confirmClearPlanOpen, setConfirmClearPlanOpen] = useState(false);
  const trendSorted = useMemo(
    () => [...(prod.trend || [])].sort((a, b) => new Date(a.dia) - new Date(b.dia)),
    [prod.trend]
  );

  const maxTrend = useMemo(() => {
    if (!trendSorted.length) return 1;
    return Math.max(1, ...trendSorted.map((d) => getTransportCount(d, materialTab)));
  }, [materialTab, trendSorted]);

  const viagensResumoFiltrado = useMemo(() => {
    const resumo = tr.viagensResumo || {};
    const esterilTon = Number(resumo.total_toneladas_esteril || 0);
    const rochaPulmaoTon = Number(resumo.total_toneladas_rocha_pulmao || 0);
    const rochaArmacaoTon = Number(resumo.total_toneladas_rocha_armacao || 0);
    const rochaTon = Number(resumo.total_toneladas_rocha || rochaPulmaoTon + rochaArmacaoTon);
    const esterilViagens = Number(resumo.total_viagens_esteril || 0);
    const rochaPulmaoViagens = Number(resumo.total_viagens_rocha_pulmao || 0);
    const rochaArmacaoViagens = Number(resumo.total_viagens_rocha_armacao || 0);
    const rochaViagens = Number(resumo.total_viagens_rocha || rochaPulmaoViagens + rochaArmacaoViagens);

    if (materialTab === "esteril") {
      return {
        total_viagens_esteril: esterilViagens,
        total_viagens_rocha_pulmao: 0,
        total_viagens_rocha_armacao: 0,
        total_viagens_rocha: 0,
        total_toneladas_esteril: esterilTon,
        total_toneladas_rocha_pulmao: 0,
        total_toneladas_rocha_armacao: 0,
        total_toneladas_rocha: 0,
      };
    }
    if (materialTab === "rocha_pulmao") {
      return {
        total_viagens_esteril: 0,
        total_viagens_rocha_pulmao: rochaPulmaoViagens,
        total_viagens_rocha_armacao: 0,
        total_viagens_rocha: rochaPulmaoViagens,
        total_toneladas_esteril: 0,
        total_toneladas_rocha_pulmao: rochaPulmaoTon,
        total_toneladas_rocha_armacao: 0,
        total_toneladas_rocha: rochaPulmaoTon,
      };
    }
    if (materialTab === "rocha_armacao") {
      return {
        total_viagens_esteril: 0,
        total_viagens_rocha_pulmao: 0,
        total_viagens_rocha_armacao: rochaArmacaoViagens,
        total_viagens_rocha: rochaArmacaoViagens,
        total_toneladas_esteril: 0,
        total_toneladas_rocha_pulmao: 0,
        total_toneladas_rocha_armacao: rochaArmacaoTon,
        total_toneladas_rocha: rochaArmacaoTon,
      };
    }
    return {
      total_viagens_esteril: esterilViagens,
      total_viagens_rocha_pulmao: rochaPulmaoViagens,
      total_viagens_rocha_armacao: rochaArmacaoViagens,
      total_viagens_rocha: rochaViagens,
      total_toneladas_esteril: esterilTon,
      total_toneladas_rocha_pulmao: rochaPulmaoTon,
      total_toneladas_rocha_armacao: rochaArmacaoTon,
      total_toneladas_rocha: rochaTon,
    };
  }, [materialTab, tr.viagensResumo]);

  const comparacaoFiltrada = useMemo(() => {
    if (!tr.comparacao) return null;
    if (materialTab === "todos") return tr.comparacao;
    if (materialTab === "esteril") {
      return {
        ...tr.comparacao,
        planejado_esteril: tr.comparacao.planejado_esteril,
        planejado_rocha: 0,
        executado_esteril: tr.comparacao.executado_esteril,
        executado_rocha_pulmao: 0,
        executado_rocha_armacao: 0,
        executado_rocha: 0,
        percentual_esteril: tr.comparacao.percentual_esteril,
        percentual_rocha_pulmao: 0,
        percentual_rocha_armacao: 0,
        percentual_rocha: 0,
        percentual_total: tr.comparacao.percentual_esteril,
      };
    }
    if (materialTab === "rocha_pulmao") {
      return {
        ...tr.comparacao,
        planejado_esteril: 0,
        planejado_rocha: tr.comparacao.planejado_rocha,
        executado_esteril: 0,
        executado_rocha_pulmao: tr.comparacao.executado_rocha_pulmao,
        executado_rocha_armacao: 0,
        executado_rocha: tr.comparacao.executado_rocha_pulmao,
        percentual_esteril: 0,
        percentual_rocha_pulmao: tr.comparacao.percentual_rocha_pulmao,
        percentual_rocha_armacao: 0,
        percentual_rocha: tr.comparacao.percentual_rocha_pulmao,
        percentual_total: tr.comparacao.percentual_rocha_pulmao,
      };
    }
    return {
      ...tr.comparacao,
      planejado_esteril: 0,
      planejado_rocha: tr.comparacao.planejado_rocha,
      executado_esteril: 0,
      executado_rocha_pulmao: 0,
      executado_rocha_armacao: tr.comparacao.executado_rocha_armacao,
      executado_rocha: tr.comparacao.executado_rocha_armacao,
      percentual_esteril: 0,
      percentual_rocha_pulmao: 0,
      percentual_rocha_armacao: tr.comparacao.percentual_rocha_armacao,
      percentual_rocha: tr.comparacao.percentual_rocha_armacao,
      percentual_total: tr.comparacao.percentual_rocha_armacao,
    };
  }, [materialTab, tr.comparacao]);

  const metaPlanejadaFiltrada = useMemo(() => {
    if (!comparacaoFiltrada) return 0;
    return Number(comparacaoFiltrada.planejado_esteril || 0) + Number(comparacaoFiltrada.planejado_rocha || 0);
  }, [comparacaoFiltrada]);

  const executadoFiltrado = useMemo(() => {
    if (!comparacaoFiltrada) return 0;
    return Number(comparacaoFiltrada.executado_esteril || 0) + Number(comparacaoFiltrada.executado_rocha || 0);
  }, [comparacaoFiltrada]);

  const pctTotalFiltrado = Number(comparacaoFiltrada?.percentual_total ?? 0);
  const materialAtualLabel = materialTitulo(materialTab);

  const pageLoading = prod.loading && !prod.stats;

  if (pageLoading) {
    return (
      <BIDashboardShell eyebrow="Indicadores" title="Transporte" lead="">
        <div className="fc-card p-8">
          <SkeletonRows rows={5} />
        </div>
      </BIDashboardShell>
    );
  }

  if (!prod.loading && !prod.stats && prod.statsError) {
    return (
      <BIDashboardShell eyebrow="Indicadores" title="Transporte" lead="">
        <EmpresaModuleErrorPanel
          title="Indicadores de transporte indisponíveis"
          description={prod.statsError}
          onRetry={prod.refetchStats}
        />
      </BIDashboardShell>
    );
  }

  if (!prod.stats) {
    return (
      <BIDashboardShell eyebrow="Indicadores" title="Transporte" lead="">
        <EmpresaModuleErrorPanel
          title="Transporte"
          description="Não foi possível carregar os indicadores. Confirme se continua ligado e tente outra vez."
          onRetry={prod.refetchStats}
        />
      </BIDashboardShell>
    );
  }

  const totalToneladasPeriodo =
    tr.viagensResumo != null
      ? Number(viagensResumoFiltrado.total_toneladas_esteril || 0) +
        Number(viagensResumoFiltrado.total_toneladas_rocha_pulmao || 0) +
        Number(viagensResumoFiltrado.total_toneladas_rocha_armacao || 0)
      : 0;

  const pctTotal = pctTotalFiltrado;
  const historicoTitle = `Histórico semanal de transporte${materialTab === "todos" ? "" : ` — ${materialAtualLabel}`}`;
  const historicoLead =
    materialTab === "todos"
      ? "Últimos 7 dias de operação (lançamentos do apontador)"
      : `Últimos 7 dias de lançamentos de ${materialAtualLabel.toLowerCase()}`;
  const materialCards = [
    materialTab === "todos" || materialTab === "esteril"
      ? {
          key: "esteril",
          label: "Estéril",
          labelClass: "text-zinc-500",
          toneladas: viagensResumoFiltrado.total_toneladas_esteril,
          viagens: viagensResumoFiltrado.total_viagens_esteril,
        }
      : null,
    materialTab === "todos" || materialTab === "rocha_pulmao"
      ? {
          key: "rocha_pulmao",
          label: "Rocha Pulmão",
          labelClass: "text-amber-200/80",
          toneladas: viagensResumoFiltrado.total_toneladas_rocha_pulmao,
          viagens: viagensResumoFiltrado.total_viagens_rocha_pulmao,
        }
      : null,
    materialTab === "todos" || materialTab === "rocha_armacao"
      ? {
          key: "rocha_armacao",
          label: "Rocha Armação",
          labelClass: "text-fuchsia-200/80",
          toneladas: viagensResumoFiltrado.total_toneladas_rocha_armacao,
          viagens: viagensResumoFiltrado.total_viagens_rocha_armacao,
        }
      : null,
  ].filter(Boolean);

  return (
    <BIDashboardShell eyebrow="Indicadores" title="Transporte" lead="Toneladas, metas e planejamento do período.">
      {tr.temAlertasTransporte ? (
        <div
          role="status"
          className="fc-erp-alert-panel fc-erp-alert-panel--amber space-y-3 rounded-xl border border-amber-500/30 bg-amber-950/25 p-4 text-sm text-zinc-100 sm:p-5"
        >
          <p className="fc-erp-eyebrow text-amber-200/90">Alertas</p>
          {tr.alertasTransporte.veiculos_sem_capacidade > 0 ? (
            <p className="flex items-start gap-3 font-medium leading-snug">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/95" aria-hidden />
              <span>
                {tr.alertasTransporte.veiculos_sem_capacidade === 1
                  ? "1 veículo sem capacidade definida"
                  : `${fmtInt(tr.alertasTransporte.veiculos_sem_capacidade)} veículos sem capacidade definida`}
              </span>
            </p>
          ) : null}
          {tr.alertasTransporte.custo_alto ? (
            <p className="flex items-start gap-3 font-medium leading-snug">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/95" aria-hidden />
              <span>Custo operacional elevado no período</span>
            </p>
          ) : null}
          {tr.alertasTransporte.meta_risco ? (
            <p className="flex items-start gap-3 font-medium leading-snug">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/95" aria-hidden />
              <span>Produção abaixo da meta</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <AccordionSection
        id="transporte-resumo-rapido"
        title="Dashboard rápido"
        description="Produção total e divisão por material no período."
        defaultOpenDesktop
        defaultOpenMobile
        className={`overflow-hidden rounded-2xl border-2 ${
          tr.comparacao && metaPlanejadaFiltrada > 0
            ? pctTotal >= 100
              ? "border-emerald-500/35 bg-emerald-950/20"
              : pctTotal >= 70
                ? "border-amber-500/35 bg-amber-950/15"
                : "border-rose-500/35 bg-rose-950/15"
            : "border-zinc-700 bg-zinc-950/80"
        }`}
      >
        <section className="p-2 sm:p-3" aria-label="Total de toneladas no período">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <span>Toneladas</span>
          <TooltipInfo text="Volume total transportado no período." />
        </p>
        {tr.viagensLoading ? (
          <div className="mt-4">
            <SkeletonRows rows={2} />
          </div>
        ) : tr.viagensError ? (
          <p className="mt-2 text-sm text-rose-300">{tr.viagensError}</p>
        ) : (
          <>
            <p className="mt-2 font-mono text-4xl font-black tabular-nums tracking-tight text-zinc-50 sm:text-5xl md:text-6xl">
              {fmtTon(totalToneladasPeriodo)} <span className="text-2xl font-bold text-zinc-400 sm:text-3xl">t</span>
            </p>
            <div className={`mt-6 grid gap-3 ${materialCards.length > 1 ? "sm:grid-cols-2" : ""}`}>
              {materialCards.map((card) => (
                <div key={card.key} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                  <p className={`text-xs ${card.labelClass}`}>{card.label}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-zinc-100">
                    {tr.viagensResumo ? `${fmtTon(card.toneladas)} t` : "—"}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                    {fmtCountLabel(card.viagens, "viagem", "viagens")}
                    <TooltipInfo text="Quantidade de viagens lançadas pelo apontador para este material." />
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
        </section>
      </AccordionSection>

      <AccordionSection
        id="transporte-filtros"
        title="Filtros e material"
        description="Ajuste período e tipo de material sem perder contexto."
        defaultOpenDesktop
        defaultOpenMobile={false}
        className="fc-erp-panel space-y-5 rounded-2xl"
      >
        <section className="p-1" aria-labelledby="transporte-porto-title">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="transporte-porto-title" className="fc-erp-h1 text-lg text-zinc-100 md:text-xl">
            Período e material
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Período do resumo de viagens">
            {[
              { id: "dia", label: "Dia" },
              { id: "semana", label: "Semana" },
              { id: "mes", label: "Mês" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  const mesmoPeriodo = tr.periodoFiltro === p.id;
                  tr.setPeriodoFiltro(p.id);
                  if (mesmoPeriodo) void tr.refetchViagens();
                  void prod.refetchStats();
                }}
                className={`fc-btn rounded-md border px-3 py-2 text-sm font-medium transition ${
                  tr.periodoFiltro === p.id
                    ? "border-amber-500/50 bg-zinc-800/80 text-zinc-50 shadow-inner"
                    : "border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-zinc-800/80 pt-4" role="group" aria-label="Tipo de material">
          {[
            { id: "todos", label: "Todos" },
            { id: "esteril", label: "Estéril" },
            { id: "rocha_pulmao", label: "Rocha Pulmão" },
            { id: "rocha_armacao", label: "Rocha Armação" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMaterialTab(t.id)}
              className={`fc-btn rounded-md border px-3 py-2 text-sm font-medium transition ${
                materialTab === t.id
                  ? "border-amber-500/50 bg-zinc-800/80 text-zinc-50 shadow-inner"
                  : "border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!tr.viagensLoading && tr.viagensResumo && totalToneladasPeriodo <= 0 ? (
          <p className="text-sm text-zinc-500">
            {materialTab === "todos"
              ? "Sem toneladas com capacidade registrada neste período."
              : `Sem toneladas de ${materialAtualLabel.toLowerCase()} com capacidade registrada neste período.`}
          </p>
        ) : null}
        </section>
      </AccordionSection>

      <AccordionSection
        id="transporte-planejado-executado"
        title="Planejado vs executado"
        description="Comparativo visual de metas e produção."
        defaultOpenDesktop
        defaultOpenMobile={false}
      >
        <BIChartCard title="Planejado vs executado" className="mt-1" bodyClassName="min-h-[10rem]">
        {tr.comparLoading ? (
          <SkeletonRows rows={3} />
        ) : tr.comparError ? (
          <EmpresaModuleErrorPanel
            title="Não foi possível carregar o comparativo"
            description={tr.comparError}
            onRetry={() => {
              void tr.refetchComparacao();
            }}
          />
        ) : tr.comparacao ? (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-center lg:gap-12 xl:gap-16">
              <div className="flex shrink-0 justify-center lg:flex-1 lg:justify-center">
                <TransportPlanExecutadoPizza
                  totalToneladasEsteril={Number(viagensResumoFiltrado.total_toneladas_esteril ?? 0)}
                  totalToneladasRochaPulmao={Number(viagensResumoFiltrado.total_toneladas_rocha_pulmao ?? 0)}
                  totalToneladasRochaArmacao={Number(viagensResumoFiltrado.total_toneladas_rocha_armacao ?? 0)}
                  materialFilter={materialTab}
                />
              </div>
              <div className="flex w-full min-w-0 flex-col justify-center gap-5 sm:max-w-md lg:max-w-none lg:flex-1">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Meta total</p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-zinc-100 sm:text-3xl">
                    {fmtTon(metaPlanejadaFiltrada)} t
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Executado</p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-zinc-100 sm:text-3xl">
                    {fmtTon(executadoFiltrado)} t
                  </p>
                </div>
                <div
                  className={`rounded-xl border px-4 py-4 sm:px-5 sm:py-5 ${
                    pctTotal >= 100
                      ? "border-emerald-500/35 bg-emerald-950/20"
                      : pctTotal >= 70
                        ? "border-amber-500/35 bg-amber-950/20"
                        : "border-rose-500/35 bg-rose-950/20"
                  }`}
                >
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    <span>Meta / atingimento</span>
                    <TooltipInfo text="Percentual de cumprimento da meta definida para o período." />
                  </p>
                  <p className={`mt-1 text-4xl font-black tabular-nums tracking-tight sm:text-5xl ${pctTone(pctTotal)}`}>
                    {fmtPct(pctTotal)}%
                  </p>
                </div>
              </div>
            </div>
            <TransportPlannedVsActualBars comparacao={comparacaoFiltrada} materialFilter={materialTab} />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Comparativo indisponível.</p>
        )}
        </BIChartCard>
      </AccordionSection>

      <AccordionSection
        id="transporte-historico"
        title="Histórico semanal"
        description="Evolução diária e ritmo da operação."
        defaultOpenDesktop={false}
        defaultOpenMobile={false}
      >
        <section aria-labelledby="hist-semanal">
        <h3 id="hist-semanal" className="text-base font-semibold text-zinc-100">
          {historicoTitle}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">{historicoLead}</p>
        <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-3">
          <div className="flex h-20 items-end gap-2 sm:h-24">
            {trendSorted.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">Sem transporte</div>
            ) : (
              trendSorted.map((row) => {
                const lancamentos = getTransportCount(row, materialTab);
                const h = Math.max(8, Math.round((lancamentos / maxTrend) * 100));
                const barClass = lancamentos > 0 ? "bg-amber-500/90" : "bg-zinc-700";
                const tooltip = `${fmtShortDateBr(row.dia)} • ${fmtCountLabel(lancamentos, "lançamento", "lançamentos")}`;
                return (
                  <div key={`hist-bar-${row.dia}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div className="flex h-16 w-full items-end sm:h-20" title={tooltip} aria-label={tooltip}>
                      <div className={`w-full rounded-sm ${barClass}`} style={{ height: `${h}%` }} />
                    </div>
                    <span className="text-[10px] text-zinc-500">{fmtShortDateBr(row.dia)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                <th className="pb-2 pr-3">Dia</th>
                <th className="pb-2 pr-3">Operação</th>
                <th className="pb-2">Ritmo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {trendSorted.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-zinc-500">
                    Sem dados.
                  </td>
                </tr>
              ) : (
                trendSorted.map((row) => {
                  const v = getTransportCount(row, materialTab);
                  const transporteLabel = v > 0 ? fmtCountLabel(v, "lançamento", "lançamentos") : "Sem transporte";
                  const w = Math.round((v / maxTrend) * 100);
                  return (
                    <tr key={row.dia}>
                      <td className="py-2.5 pr-3 text-zinc-300">{fmtDiaBr(row.dia)}</td>
                      <td className="py-2.5 pr-3 font-semibold tabular-nums text-zinc-100">
                        {transporteLabel}
                      </td>
                      <td className="py-2.5">
                        <div className="h-2 min-w-[80px] overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className={`h-2 rounded-full ${v > 0 ? "bg-amber-500/90" : "bg-zinc-700"}`}
                            style={{ width: `${v > 0 ? w : 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </section>
      </AccordionSection>

      <AccordionSection
        id="transporte-planejamento"
        title="Planejamento"
        description="Defina metas e período de forma centralizada."
        defaultOpenDesktop={false}
        defaultOpenMobile={false}
      >
        <section aria-labelledby="planejamento-form">
        <h3 id="planejamento-form" className="text-base font-semibold text-zinc-100">
          Planejamento
        </h3>
        <p className="mt-1 text-xs text-zinc-500">Edite datas e metas, ou zere as metas do período ativo.</p>

        {metaPlanejadaFiltrada <= 0 && tr.comparacao ? (
          <p className="mt-3 text-sm text-amber-200/90">Sem meta ativa para hoje. Defina datas que incluam hoje.</p>
        ) : null}

        <form className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={tr.submitPlanejamento}>
          <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
            <span className="fc-erp-eyebrow">Início</span>
            <input
              type="date"
              required
              className="fc-input rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={tr.planForm.data_inicio}
              onChange={(ev) => tr.setPlanForm((p) => ({ ...p, data_inicio: ev.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
            <span className="fc-erp-eyebrow">Fim</span>
            <input
              type="date"
              required
              className="fc-input rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={tr.planForm.data_fim}
              onChange={(ev) => tr.setPlanForm((p) => ({ ...p, data_fim: ev.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
            <span className="fc-erp-eyebrow">Meta estéril (t)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="fc-input rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={tr.planForm.meta_esteril_ton}
              onChange={(ev) => tr.setPlanForm((p) => ({ ...p, meta_esteril_ton: ev.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
            <span className="fc-erp-eyebrow">Meta rocha (t)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="fc-input rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={tr.planForm.meta_rocha_ton}
              onChange={(ev) => tr.setPlanForm((p) => ({ ...p, meta_rocha_ton: ev.target.value }))}
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={tr.planSaving}
              className="fc-btn rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-50"
            >
              {tr.planSaving ? "Salvando…" : "Salvar planejamento"}
            </button>
            <button
              type="button"
              disabled={tr.planSaving}
              onClick={() => void tr.reloadPlanejamentoAtual()}
              className="fc-btn rounded-md border border-zinc-600 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
            >
              Carregar plano vigente
            </button>
            <button
              type="button"
              disabled={tr.planSaving}
              onClick={() => setConfirmClearPlanOpen(true)}
              className="fc-btn rounded-md border border-rose-500/40 bg-rose-950/30 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-950/50 disabled:opacity-50"
            >
              Zerar metas do período ativo
            </button>
          </div>
        </form>
        </section>
      </AccordionSection>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/empresa/dashboard"
          className="fc-btn inline-flex rounded-md border border-zinc-600 px-4 py-3 text-center text-sm font-semibold text-zinc-200 hover:border-zinc-500"
        >
          Painel executivo
        </Link>
        <Link
          to="/empresa/relatorios"
          className="fc-btn inline-flex rounded-md border border-zinc-600 px-4 py-3 text-center text-sm font-semibold text-zinc-200"
        >
          Relatórios
        </Link>
      </div>

      <ConfirmActionModal
        open={confirmClearPlanOpen}
        title="Zerar metas do planejamento ativo"
        description="As metas de estéril e rocha do período atual serão zeradas."
        consequence="A referência de desempenho do período ficará em zero até novo preenchimento."
        confirmLabel="Zerar metas"
        confirmLoadingLabel="Zerando..."
        tone="warning"
        loading={tr.planSaving}
        onClose={() => {
          if (tr.planSaving) return;
          setConfirmClearPlanOpen(false);
        }}
        onConfirm={() => {
          void (async () => {
            try {
              await tr.clearPlanejamentoMetas();
            } finally {
              setConfirmClearPlanOpen(false);
            }
          })();
        }}
      />
    </BIDashboardShell>
  );
}

export default function EmpresaTransportePage() {
  return (
    <TransportProvider>
      <EmpresaTransportePageContent />
    </TransportProvider>
  );
}
