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
import { CHART_COLORS, CHART_TOOLTIP_EXPLANATIONS } from "../utils/chartColors";
import {
  BiPieLegend,
  enrichPieChartData,
  formatPieSliceLabel,
  fmtChartNum,
  PieConsumoTooltip,
  useChartBreakpoint,
} from "../utils/pieChartHelpers";
import TooltipInfo from "../../shared/components/TooltipInfo";

const hasRows = (rows) => Array.isArray(rows) && rows.length > 0;
const fmtDateTick = (value) => {
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [, mm, dd] = raw.split("-");
    return `${dd}/${mm}`;
  }
  return String(value || "").slice(0, 6);
};

function DarkTooltip({ active, payload, label, explanation, labelFormatter, valueFormatter }) {
  if (!active || !payload?.length) return null;
  const title = labelFormatter ? labelFormatter(label) : label;
  return (
    <div
      className="max-w-[260px] rounded-xl border border-zinc-600 p-3 shadow-lg"
      style={{ backgroundColor: "#111827" }}
    >
      {title ? <p className="mb-2 text-xs font-semibold text-zinc-200">{title}</p> : null}
      <ul className="space-y-1">
        {payload.map((entry, index) => {
          const formatted = valueFormatter
            ? valueFormatter(entry.value, entry.name, entry, index)
            : [entry.value, entry.name];
          const displayValue = Array.isArray(formatted) ? formatted[0] : formatted;
          const displayName = Array.isArray(formatted) ? formatted[1] : entry.name;
          return (
            <li key={`${entry.name}-${index}`} className="flex items-start gap-2 text-sm text-zinc-100">
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              <span>
                <span className="font-medium">{displayName}:</span> {displayValue}
              </span>
            </li>
          );
        })}
      </ul>
      {explanation ? <p className="mt-2 border-t border-zinc-700 pt-2 text-[11px] text-zinc-400">{explanation}</p> : null}
    </div>
  );
}

function ChartCard({ title, subtitle, helpText, children, className = "", legend, chartClassName = "h-[260px] sm:h-[240px]" }) {
  return (
    <article className={`rounded-xl border border-zinc-800/90 bg-zinc-950/50 p-4 sm:p-5 ${className}`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100 sm:text-base">
        <span>{title}</span>
        {helpText ? <TooltipInfo text={helpText} /> : null}
      </p>
      {subtitle ? <p className="mt-1 text-xs text-zinc-400 sm:text-sm">{subtitle}</p> : null}
      <div className={`mt-3 w-full overflow-hidden ${chartClassName}`}>
        {children}
      </div>
      {legend ?? null}
    </article>
  );
}

function ChartEmptyState() {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950/60 px-3 text-center text-xs text-zinc-500 sm:text-sm">
      Sem dados suficientes no período
    </div>
  );
}

function PieSingleDataInfo() {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 text-center text-xs text-zinc-200 sm:text-sm">
      Somente um veículo no período: gráfico de participação ocultado para priorizar leitura objetiva.
    </div>
  );
}

function ConsumoPorVeiculoPieChart({ pieData }) {
  const isMobile = useChartBreakpoint();
  const enrichedPieData = enrichPieChartData(pieData);
  const pieLength = enrichedPieData.length;
  const hasComparativePieData = pieLength > 1;

  if (!hasComparativePieData) {
    return pieLength === 1 ? (
      <ChartCard title="Consumo por veículo" subtitle="Participação no período">
        <PieSingleDataInfo />
      </ChartCard>
    ) : null;
  }

  const outerRadius = isMobile ? 68 : 92;
  const innerRadius = isMobile ? 28 : 42;

  return (
    <ChartCard
      title="Consumo por veículo"
      subtitle="Participação percentual — paleta BI de alto contraste"
      helpText="Mostra quais veículos concentram maior consumo e participação."
      chartClassName="h-auto min-h-0"
      legend={isMobile ? <BiPieLegend items={enrichedPieData} className="mt-4" /> : null}
    >
      <div className={`flex ${isMobile ? "flex-col gap-3" : "flex-row items-center gap-5"}`}>
        <div
          className={`flex shrink-0 items-center justify-center ${isMobile ? "mx-auto h-[168px] w-full max-w-[240px]" : "h-[220px] flex-1"}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={enrichedPieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={outerRadius}
                innerRadius={innerRadius}
                stroke="#0B1220"
                strokeWidth={2}
                paddingAngle={1}
                labelLine={false}
                label={(props) => formatPieSliceLabel(props, isMobile)}
              >
                {enrichedPieData.map((entry, index) => (
                  <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<PieConsumoTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {!isMobile ? (
          <div className="min-w-0 flex-1 border-l border-zinc-800 pl-4">
            <BiPieLegend items={enrichedPieData} />
          </div>
        ) : null}
      </div>
    </ChartCard>
  );
}

export default function IntelligenceRechartsPanel({ pieData, lineData, barData }) {
  return (
    <>
      <ConsumoPorVeiculoPieChart pieData={pieData} />

      <ChartCard
        title="Custo por período"
        subtitle="Linha azul — tendência de custo diário"
        helpText="Use para identificar aceleração de custo ao longo das datas."
        legend={
          <p className="mt-3 text-xs text-zinc-400 sm:text-sm">
            <span className="mr-2 inline-block h-3 w-3 rounded-sm bg-[#3B82F6]" aria-hidden /> Custo diário (R$)
          </p>
        }
      >
        {hasRows(lineData) ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="periodo" stroke="#d4d4d8" fontSize={10} tickFormatter={fmtDateTick} />
              <YAxis stroke="#d4d4d8" fontSize={10} />
              <Tooltip
                content={
                  <DarkTooltip
                    explanation={CHART_TOOLTIP_EXPLANATIONS.lineCusto}
                    labelFormatter={(label) => `Data: ${label}`}
                    valueFormatter={(value) => [
                      Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
                      "Custo",
                    ]}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#D4D4D8" }} payload={[{ value: "Custo (R$)", type: "line", color: CHART_COLORS.line }]} />
              <Line
                type="monotone"
                dataKey="custo"
                name="Custo (R$)"
                stroke={CHART_COLORS.line}
                strokeWidth={3}
                dot={{ r: 3, strokeWidth: 1, fill: "#111827" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmptyState />
        )}
      </ChartCard>

      <ChartCard
        title="Consumo vs produção"
        subtitle="Vermelho = consumo · Verde = produção"
        helpText="Comparativo lado a lado por data."
        className="lg:col-span-2"
        legend={
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400 sm:text-sm">
            <span>
              <span className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-[#EF4444]" aria-hidden /> Consumo (L)
            </span>
            <span>
              <span className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-[#10B981]" aria-hidden /> Produção (viagens)
            </span>
          </div>
        }
      >
        {hasRows(barData) ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="periodo" stroke="#d4d4d8" fontSize={10} tickFormatter={fmtDateTick} />
              <YAxis stroke="#d4d4d8" fontSize={10} />
              <Tooltip
                content={
                  <DarkTooltip
                    explanation={CHART_TOOLTIP_EXPLANATIONS.barConsumoProducao}
                    labelFormatter={(label) => `Data: ${label}`}
                    valueFormatter={(value, name) => [`${fmtChartNum(value)}`, name]}
                  />
                }
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "#D4D4D8" }}
                payload={[
                  { value: "Consumo (L)", type: "square", color: CHART_COLORS.consumo },
                  { value: "Produção", type: "square", color: CHART_COLORS.producao },
                ]}
              />
              <Bar dataKey="consumo" name="Consumo (L)" fill={CHART_COLORS.consumo} radius={[6, 6, 0, 0]} />
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
