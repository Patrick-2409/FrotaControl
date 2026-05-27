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
const compactTick = (value) => String(value || "").slice(0, 7);
const compactLabel = (value) => {
  const text = String(value || "");
  return text.length > 18 ? `${text.slice(0, 18)}...` : text;
};

function ChartCard({ title, subtitle, children, className = "" }) {
  return (
    <article className={`rounded-xl border border-zinc-800/90 bg-zinc-950/50 p-4 ${className}`}>
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      {subtitle ? <p className="mt-1 text-xs text-zinc-400">{subtitle}</p> : null}
      <div className="mt-3 h-[220px] max-h-[220px] w-full overflow-x-auto overflow-y-hidden">
        <div className="h-full min-w-[340px] sm:min-w-full">{children}</div>
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
  return (
    <div className="mt-2 grid grid-cols-1 gap-1 px-1">
      {data.map((item, index) => {
        const color = getColorById(item?.veiculo_id ?? item?.name ?? index);
        return (
          <div key={`pie-legend-${index}`} className="flex items-center gap-2 text-xs">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
            <span title={item.name} className="truncate font-medium" style={{ color }}>
              {compactLabel(item.name)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function IntelligenceRechartsPanel({ pieData, lineData, barData }) {
  const pieLength = Array.isArray(pieData) ? pieData.length : 0;
  const hasComparativePieData = pieLength > 1;
  return (
    <>
      {hasComparativePieData ? (
        <ChartCard title="Consumo por veículo" subtitle="Participação no período">
          <div className="h-full min-w-[360px] sm:min-w-full">
            <ResponsiveContainer width="100%" height="82%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={104}
                  innerRadius={46}
                  stroke="#0B1220"
                  strokeWidth={2}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getColorById(entry?.veiculo_id ?? entry?.name ?? index)} />
                  ))}
                </Pie>
                <Tooltip {...CHART_TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <PieLegendList data={pieData} />
          </div>
        </ChartCard>
      ) : pieLength === 1 ? (
        <ChartCard title="Consumo por veículo" subtitle="Participação no período">
          <PieSingleDataInfo />
        </ChartCard>
      ) : null}

      <ChartCard title="Custo por período" subtitle="Evolução do custo operacional">
        {hasRows(lineData) ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="periodo" stroke="#d4d4d8" fontSize={10} tickFormatter={compactTick} />
              <YAxis stroke="#d4d4d8" fontSize={10} />
              <Tooltip {...CHART_TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="custo" stroke={CHART_COLORS.line} strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmptyState />
        )}
      </ChartCard>

      <ChartCard
        title="Consumo vs produção"
        subtitle="Comparativo consolidado por período"
        className="lg:col-span-2"
      >
        {hasRows(barData) ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="periodo" stroke="#d4d4d8" fontSize={10} tickFormatter={compactTick} />
              <YAxis stroke="#d4d4d8" fontSize={10} />
              <Tooltip {...CHART_TOOLTIP_STYLE} />
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
