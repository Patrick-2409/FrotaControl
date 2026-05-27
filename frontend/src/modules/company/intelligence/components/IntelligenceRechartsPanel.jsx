import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, getColorById } from "../utils/chartColors";

const hasRows = (rows) => Array.isArray(rows) && rows.length > 0;
const compactTick = (value) => String(value || "").slice(0, 6);
const compactLabel = (value) => {
  const text = String(value || "");
  return text.length > 18 ? `${text.slice(0, 18)}...` : text;
};
const fmtNum = (value) => Number(value || 0).toLocaleString("pt-BR");
const fmtPct = (value) => `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const fmtDateTick = (value) => {
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [, mm, dd] = raw.split("-");
    return `${dd}/${mm}`;
  }
  return compactTick(raw);
};

function ChartCard({ title, subtitle, helpText, children, className = "" }) {
  return (
    <article className={`rounded-xl border border-zinc-800/90 bg-zinc-950/50 p-4 ${className}`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <span>{title}</span>
        {helpText ? (
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-600 text-[10px] text-zinc-300"
            title={helpText}
          >
            i
          </span>
        ) : null}
      </p>
      {subtitle ? <p className="mt-1 text-xs text-zinc-400">{subtitle}</p> : null}
      <div className="mt-3 h-[260px] w-full overflow-hidden sm:h-[240px]">
        <div className="h-full w-full">{children}</div>
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

function PieSingleDataInfo() {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 text-center text-xs text-zinc-200">
      Somente um veículo no período: gráfico de participação ocultado para priorizar leitura objetiva.
    </div>
  );
}

function PieLegendList({ data }) {
  const maxValue = Math.max(...data.map((item) => Number(item?.value || 0)), 0);
  return (
    <div className="mt-2 grid grid-cols-1 gap-1.5 px-1">
      {data.map((item, index) => {
        const color = getColorById(item?.veiculo_id ?? item?.name ?? index);
        const isTop = Number(item?.value || 0) === maxValue && maxValue > 0;
        return (
          <div
            key={`pie-legend-${index}`}
            className={`grid grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md px-2 py-1 text-xs ${
              isTop ? "border border-emerald-600/40 bg-emerald-950/20" : ""
            }`}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
            <span title={item.name} className="truncate font-medium" style={{ color }}>
              {compactLabel(item.name)}
            </span>
            <span className="tabular-nums text-zinc-300">{fmtNum(item.value)} L</span>
            <span className="tabular-nums text-zinc-400">{fmtPct(item.percent)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function IntelligenceRechartsPanel({ pieData, lineData, barData }) {
  const pieTotal = (Array.isArray(pieData) ? pieData : []).reduce((acc, item) => acc + Number(item?.value || 0), 0);
  const enrichedPieData = (Array.isArray(pieData) ? pieData : []).map((item) => ({
    ...item,
    percent: pieTotal > 0 ? (Number(item?.value || 0) / pieTotal) * 100 : 0,
  }));
  const pieLength = Array.isArray(pieData) ? pieData.length : 0;
  const hasComparativePieData = pieLength > 1;
  return (
    <>
      {hasComparativePieData ? (
        <ChartCard
          title="Consumo por veículo"
          subtitle="Participação percentual por veículo no período."
          helpText="Mostra quais veículos concentram maior consumo e participação."
        >
          <div className="h-full w-full">
            <ResponsiveContainer width="100%" height="82%">
              <PieChart>
                <Pie
                  data={enrichedPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={108}
                  innerRadius={46}
                  stroke="#0B1220"
                  strokeWidth={2}
                  labelLine={false}
                  label={({ percent }) => (percent >= 0.07 ? `${(percent * 100).toFixed(0)}%` : "")}
                >
                  {enrichedPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getColorById(entry?.veiculo_id ?? entry?.name ?? index)} />
                  ))}
                </Pie>
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(value, _name, item) => {
                    const pct = item?.payload?.percent ?? 0;
                    return [`${fmtNum(value)} L (${fmtPct(pct)})`, item?.payload?.name || "Veículo"];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <PieLegendList data={enrichedPieData} />
          </div>
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
        {hasRows(lineData) ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="periodo" stroke="#d4d4d8" fontSize={10} tickFormatter={fmtDateTick} />
              <YAxis stroke="#d4d4d8" fontSize={10} />
              <Tooltip
                {...CHART_TOOLTIP_STYLE}
                labelFormatter={(label) => `Data: ${label}`}
                formatter={(value) => [
                  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
                  "Custo",
                ]}
              />
              <Line
                type="monotone"
                dataKey="custo"
                stroke={CHART_COLORS.line}
                strokeWidth={4}
                dot={{ r: 4, strokeWidth: 1, fill: "#111827" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmptyState />
        )}
      </ChartCard>

      <ChartCard
        title="Consumo vs produção"
        subtitle="Comparativo lado a lado por data real."
        helpText="Consumo em vermelho e produção em verde para leitura direta de eficiência."
        className="lg:col-span-2"
      >
        {hasRows(barData) ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="periodo" stroke="#d4d4d8" fontSize={10} tickFormatter={fmtDateTick} />
              <YAxis stroke="#d4d4d8" fontSize={10} />
              <Tooltip
                {...CHART_TOOLTIP_STYLE}
                labelFormatter={(label) => `Data: ${label}`}
                formatter={(value, name) => [`${fmtNum(value)}`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="consumo" name="Consumo" fill={CHART_COLORS.consumo} radius={[6, 6, 0, 0]} />
              <Bar dataKey="producao" name="Produção" fill={CHART_COLORS.producao} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmptyState />
        )}
      </ChartCard>
    </>
  );
}
