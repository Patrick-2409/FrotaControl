import { Component, useEffect, useState } from "react";
import { CHART_COLORS } from "../utils/chartColors";
import { BiPieLegend, enrichPieChartData } from "../utils/pieChartHelpers";
import TooltipInfo from "../../shared/components/TooltipInfo";

const ENABLE_RECHARTS = String(import.meta.env.VITE_ENABLE_RECHARTS || "").trim().toLowerCase() === "true";

const fmt = (value) => Number(value || 0).toLocaleString("pt-BR");

const maxFrom = (values) => {
  const max = Math.max(...values, 0);
  return max <= 0 ? 1 : max;
};

const hasRows = (rows) => Array.isArray(rows) && rows.length > 0;

function ChartCard({ title, subtitle, helpText, children, className = "" }) {
  const isPie = className.includes("chart-card-pie");
  return (
    <article className={`rounded-xl border border-zinc-800/90 bg-zinc-950/50 p-4 sm:p-5 ${className}`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100 sm:text-base">
        <span>{title}</span>
        {helpText ? <TooltipInfo text={helpText} /> : null}
      </p>
      {subtitle ? <p className="mt-1 text-xs text-zinc-400 sm:text-sm">{subtitle}</p> : null}
      <div className={`mt-3 w-full overflow-hidden ${isPie ? "h-auto" : "h-[220px] sm:h-[240px]"}`}>
        <div className={isPie ? "w-full" : "h-full w-full"}>{children}</div>
      </div>
    </article>
  );
}

function ChartEmptyState() {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950/60 px-3 text-center text-xs text-zinc-500">
      Sem dados suficientes no período
    </div>
  );
}

class ChartErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // fallback visual em caso de erro runtime dos gráficos
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function PieFallbackChart({ data }) {
  const enriched = enrichPieChartData(data);
  const total = enriched.reduce((acc, item) => acc + Number(item.value || 0), 0);
  let currentAngle = -90;
  const segments = enriched.map((item) => {
    const value = Number(item.value || 0);
    const angle = total > 0 ? (value / total) * 360 : 0;
    const segment = {
      color: item.color,
      from: currentAngle,
      to: currentAngle + angle,
    };
    currentAngle += angle;
    return segment;
  });

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-5">
      <div className="mx-auto flex h-[168px] w-full max-w-[240px] shrink-0 items-center justify-center md:h-[220px] md:max-w-none md:flex-1">
        <div
          className="relative h-40 w-40 rounded-full border border-zinc-700/70 sm:h-44 sm:w-44"
          style={{
            background: `conic-gradient(${segments
              .map((seg) => `${seg.color} ${seg.from}deg ${seg.to}deg`)
              .join(", ")})`,
          }}
          aria-label="Consumo por veículo"
        />
      </div>
      <div className="min-w-0 flex-1 md:border-l md:border-zinc-800 md:pl-4">
        <BiPieLegend items={enriched} />
      </div>
    </div>
  );
}

function PieSingleDataInfo() {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 text-center text-xs text-zinc-200">
      Somente um veículo no período: gráfico de participação ocultado para priorizar leitura objetiva.
    </div>
  );
}

function LineFallbackChart({ data }) {
  const width = 520;
  const height = 200;
  const padX = 28;
  const padY = 20;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const maxY = maxFrom(data.map((item) => Number(item.custo || 0)));
  const points = data
    .map((item, index) => {
      const x = padX + (chartW * index) / Math.max(1, data.length - 1);
      const y = padY + chartH - (chartH * Number(item.custo || 0)) / maxY;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      <rect x="0" y="0" width={width} height={height} rx="10" fill="#09090b" stroke="#27272a" />
      <polyline fill="none" stroke={CHART_COLORS.line} strokeWidth="3" points={points} />
    </svg>
  );
}

function BarsFallbackChart({ data }) {
  const maxY = maxFrom(
    data.flatMap((item) => [Number(item.consumo || 0), Number(item.producao || 0)])
  );
  return (
    <div className="flex h-full items-end gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      {data.map((item) => {
        const consumoPct = (Number(item.consumo || 0) / maxY) * 100;
        const producaoPct = (Number(item.producao || 0) / maxY) * 100;
        return (
          <div key={`bar-${item.periodo}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-44 w-full items-end justify-center gap-1">
              <div
                className="w-3 rounded-t"
                style={{ backgroundColor: CHART_COLORS.consumo, height: `${Math.max(consumoPct, 4)}%` }}
                title={`Consumo ${fmt(item.consumo)}`}
              />
              <div
                className="w-3 rounded-t"
                style={{ backgroundColor: CHART_COLORS.producao, height: `${Math.max(producaoPct, 4)}%` }}
                title={`Produção ${fmt(item.producao)}`}
              />
            </div>
            <span className="text-[10px] text-zinc-400">{item.periodo}</span>
          </div>
        );
      })}
    </div>
  );
}

function FallbackChartsPanel({ pieData, lineData, barData }) {
  const pieLength = Array.isArray(pieData) ? pieData.length : 0;
  const hasComparativePieData = pieLength > 1;
  return (
    <>
      {hasComparativePieData ? (
        <ChartCard
          title="Consumo por veículo"
          subtitle="Participação percentual por veículo no período."
          helpText="Mostra quais veículos concentram maior consumo e participação."
          className="chart-card-pie"
        >
          <PieFallbackChart data={pieData} />
        </ChartCard>
      ) : pieLength === 1 ? (
        <ChartCard title="Consumo por veículo" subtitle="Participação no período">
          <PieSingleDataInfo />
        </ChartCard>
      ) : null}

      <ChartCard
        title="Custo por período"
        subtitle="Linha temporal de custo para leitura de tendência."
        helpText="Use para identificar aceleração de custo ao longo das datas."
      >
        {hasRows(lineData) ? <LineFallbackChart data={lineData} /> : <ChartEmptyState />}
      </ChartCard>

      <ChartCard
        title="Consumo vs produção"
        subtitle="Comparativo lado a lado por data real."
        helpText="Consumo em vermelho e produção em verde para leitura direta de eficiência."
        className="lg:col-span-2"
      >
        {hasRows(barData) ? <BarsFallbackChart data={barData} /> : <ChartEmptyState />}
      </ChartCard>
    </>
  );
}

export default function IntelligenceChartsPanel({
  pieData = [],
  lineData = [],
  barData = [],
  loading = false,
  embedded = false,
}) {
  const [RechartsChartsPanel, setRechartsChartsPanel] = useState(null);
  const [rechartsFailed, setRechartsFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!ENABLE_RECHARTS) return () => {};
    import("./IntelligenceRechartsPanel")
      .then((module) => {
        if (!mounted) return;
        const ImportedPanel = module?.default || null;
        if (typeof ImportedPanel === "function") {
          setRechartsChartsPanel(() => ImportedPanel);
        } else {
          setRechartsFailed(true);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setRechartsFailed(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const canUseRecharts = ENABLE_RECHARTS && !rechartsFailed && typeof RechartsChartsPanel === "function";

  const content = (
    <>
      {!embedded ? <p className="fc-erp-eyebrow">Gráficos</p> : null}
      {!embedded ? <h2 className="mt-1 text-lg font-semibold text-zinc-100">Visão visual da operação</h2> : null}
      {!embedded ? (
        <p className="mt-2 text-sm text-zinc-400">
          Distribuição de consumo, evolução de custo e comparação entre consumo e produção.
        </p>
      ) : null}

      <div className={`${embedded ? "" : "mt-4"} grid grid-cols-1 gap-4 lg:grid-cols-2`}>
        <ChartErrorBoundary fallback={<FallbackChartsPanel pieData={pieData} lineData={lineData} barData={barData} />}>
          {loading ? (
            <article className="rounded-xl border border-zinc-800/90 bg-zinc-950/50 p-4 lg:col-span-2">
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-44 rounded bg-zinc-800/80" />
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="h-[220px] rounded-xl border border-zinc-800/80 bg-zinc-900/80" />
                  <div className="h-[220px] rounded-xl border border-zinc-800/80 bg-zinc-900/80" />
                </div>
                <div className="h-[220px] rounded-xl border border-zinc-800/80 bg-zinc-900/80" />
              </div>
            </article>
          ) : canUseRecharts ? (
            <RechartsChartsPanel pieData={pieData} lineData={lineData} barData={barData} />
          ) : (
            <FallbackChartsPanel pieData={pieData} lineData={lineData} barData={barData} />
          )}
        </ChartErrorBoundary>
      </div>
    </>
  );

  if (embedded) return content;
  return <section className="fc-card border-zinc-800/80 p-4 sm:p-5">{content}</section>;
}
