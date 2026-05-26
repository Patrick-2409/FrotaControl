import { Component, useEffect, useState } from "react";

const ENABLE_RECHARTS = String(import.meta.env.VITE_ENABLE_RECHARTS || "").trim().toLowerCase() === "true";
const PIE_COLORS = ["#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#6b7280"];

const fmt = (value) => Number(value || 0).toLocaleString("pt-BR");

const maxFrom = (values) => {
  const max = Math.max(...values, 0);
  return max <= 0 ? 1 : max;
};

const hasRows = (rows) => Array.isArray(rows) && rows.length > 0;

function ChartCard({ title, subtitle, children, className = "" }) {
  return (
    <article className={`rounded-xl border border-zinc-800/90 bg-zinc-950/50 p-4 sm:p-5 ${className}`}>
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      {subtitle ? <p className="mt-1 text-xs text-zinc-400">{subtitle}</p> : null}
      <div className="mt-4 h-64 w-full sm:h-72">{children}</div>
    </article>
  );
}

function ChartEmptyState() {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950/60 px-3 text-center text-xs text-zinc-500">
      Sem dados no filtro selecionado.
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

function PieLegend({ data }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-1">
      {data.map((item, index) => (
        <div key={`legend-${item.name}`} className="flex items-center gap-2 text-xs text-zinc-300">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
            aria-hidden
          />
          <span className="truncate">{item.name}</span>
          <span className="ml-auto tabular-nums text-zinc-400">{fmt(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function PieFallbackChart({ data }) {
  const total = data.reduce((acc, item) => acc + Number(item.value || 0), 0);
  let currentAngle = -90;
  const segments = data.map((item, index) => {
    const value = Number(item.value || 0);
    const angle = total > 0 ? (value / total) * 360 : 0;
    const segment = {
      color: PIE_COLORS[index % PIE_COLORS.length],
      from: currentAngle,
      to: currentAngle + angle,
    };
    currentAngle += angle;
    return segment;
  });
  return (
    <div className="flex h-full items-center justify-center">
      <div
        className="h-40 w-40 rounded-full border border-zinc-700/70"
        style={{
          background: `conic-gradient(${segments
            .map((seg) => `${seg.color} ${seg.from}deg ${seg.to}deg`)
            .join(", ")})`,
        }}
        aria-label="Consumo por veículo"
      />
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
      <polyline fill="none" stroke="#2563eb" strokeWidth="3" points={points} />
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
                className="w-3 rounded-t bg-amber-600"
                style={{ height: `${Math.max(consumoPct, 4)}%` }}
                title={`Consumo ${fmt(item.consumo)}`}
              />
              <div
                className="w-3 rounded-t bg-emerald-600"
                style={{ height: `${Math.max(producaoPct, 4)}%` }}
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
  return (
    <>
      <ChartCard title="Consumo por veículo" subtitle="Participação no período">
        {hasRows(pieData) ? (
          <>
            <PieFallbackChart data={pieData} />
            <PieLegend data={pieData} />
          </>
        ) : (
          <ChartEmptyState />
        )}
      </ChartCard>

      <ChartCard title="Custo por período" subtitle="Evolução do custo operacional">
        {hasRows(lineData) ? <LineFallbackChart data={lineData} /> : <ChartEmptyState />}
      </ChartCard>

      <ChartCard
        title="Consumo vs produção"
        subtitle="Comparativo consolidado por período"
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

  return (
    <section className="fc-card border-zinc-800/80 p-4 sm:p-5">
      <p className="fc-erp-eyebrow">Gráficos</p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-100">Visão visual da operação</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Distribuição de consumo, evolução de custo e comparação entre consumo e produção.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartErrorBoundary fallback={<FallbackChartsPanel pieData={pieData} lineData={lineData} barData={barData} />}>
          {loading ? (
            <article className="rounded-xl border border-zinc-800/90 bg-zinc-950/50 p-4 text-sm text-zinc-400 lg:col-span-2">
              Carregando dados reais dos gráficos...
            </article>
          ) : canUseRecharts ? (
            <RechartsChartsPanel pieData={pieData} lineData={lineData} barData={barData} />
          ) : (
            <FallbackChartsPanel pieData={pieData} lineData={lineData} barData={barData} />
          )}
        </ChartErrorBoundary>
      </div>
    </section>
  );
}
