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
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_GUIDES } from "../utils/chartGuides";
import {
  buildBarDiscussion,
  buildLineDiscussion,
  buildLineStats,
  buildPieDiscussion,
  buildPieLegendItems,
  CHART_LEGEND_ITEMS,
} from "../utils/chartInsights";
import {
  ColorLegend,
  createExecutiveTooltip,
  ExecutiveChartTooltip,
  LineCostDataTable,
  ReportChartCard,
  StaticLegend,
} from "./ChartReportBlocks";
import {
  CHART_TOOLTIP_EXPLANATIONS,
  REPORT_COLORS,
  reportColorByIndex,
} from "../utils/reportChartColors";

const hasRows = (rows) => Array.isArray(rows) && rows.length > 0;
const fmtNum = (value) => Number(value || 0).toLocaleString("pt-BR");
const fmtMoney = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtMoneyAxis = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "R$ 0";
  if (Math.abs(n) >= 1000) {
    return `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
};
const fmtDateTick = (value) => {
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [, mm, dd] = raw.split("-");
    return `${dd}/${mm}`;
  }
  return raw.slice(0, 6);
};

const PieTooltip = createExecutiveTooltip({
  explanation: CHART_TOOLTIP_EXPLANATIONS.pieConsumo,
  valueFormatter: (value, _name, item) => [
    `${fmtNum(value)} L (${Number(item?.payload?.percent || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`,
    item?.payload?.name || "Veículo",
  ],
});

function ChartEmpty() {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
      Sem dados suficientes no período selecionado
    </div>
  );
}

export default function ExecutiveReportRechartsPanel({ pieData = [], lineData = [], barData = [], tipoAnalise = "geral" }) {
  const tipo = String(tipoAnalise || "geral").toLowerCase();
  const showCombustivel = tipo === "geral" || tipo === "combustivel" || tipo === "frota";
  const showTransporte = tipo === "geral" || tipo === "transporte";

  const pieTotal = pieData.reduce((acc, item) => acc + Number(item?.value || 0), 0);
  const enrichedPie = pieData.map((item, index) => ({
    ...item,
    color: reportColorByIndex(index),
    percent: pieTotal > 0 ? (Number(item?.value || 0) / pieTotal) * 100 : 0,
  }));
  const pieLegend = buildPieLegendItems(pieData);
  const pieDiscussion = buildPieDiscussion(pieData);
  const lineStats = buildLineStats(lineData);
  const lineDiscussion = buildLineDiscussion(lineData);
  const barDiscussion = buildBarDiscussion(barData);
  const lineTooltipValueFormatter = (value) => {
    const custo = Number(value);
    const vsMedia =
      lineStats?.media > 0
        ? `${(((custo - lineStats.media) / lineStats.media) * 100).toFixed(1)}% vs média`
        : "";
    return [`${fmtMoney(value)}${vsMedia ? ` (${vsMedia})` : ""}`, CHART_LEGEND_ITEMS.custo.short];
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {showCombustivel && enrichedPie.length > 1 ? (
        <ReportChartCard
          title={CHART_GUIDES.consumoPorVeiculo.titulo}
          subtitle="Participação percentual por veículo — paleta Power BI"
          guideKey="consumoPorVeiculo"
          legend={<ColorLegend title="Legenda — cor por veículo" items={pieLegend} required />}
          discussion={pieDiscussion}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={enrichedPie}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="44%"
                outerRadius={96}
                innerRadius={42}
                stroke="#FFFFFF"
                strokeWidth={2}
                labelLine={false}
                label={({ percent }) => (percent >= 0.07 ? `${(percent * 100).toFixed(0)}%` : "")}
              >
                {enrichedPie.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                payload={pieLegend.map((item) => ({
                  value: item.label,
                  type: "square",
                  color: item.color,
                }))}
              />
            </PieChart>
          </ResponsiveContainer>
        </ReportChartCard>
      ) : null}

      {showCombustivel ? (
        <ReportChartCard
          title={CHART_GUIDES.custoPorPeriodo.titulo}
          subtitle="Azul = custo diário · Laranja tracejado = média de referência"
          guideKey="custoPorPeriodo"
          className={enrichedPie.length <= 1 ? "xl:col-span-2" : ""}
          legend={
            <StaticLegend
              title="Legenda"
              items={[
                { color: CHART_LEGEND_ITEMS.custo.color, label: CHART_LEGEND_ITEMS.custo.label },
                { color: CHART_LEGEND_ITEMS.media.color, label: CHART_LEGEND_ITEMS.media.label },
              ]}
            />
          }
          extra={<LineCostDataTable stats={lineStats} />}
          discussion={lineDiscussion}
        >
          {hasRows(lineData) && lineStats ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 28, right: 20, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={REPORT_COLORS.grid} />
                <XAxis
                  dataKey="periodo"
                  stroke={REPORT_COLORS.axis}
                  fontSize={11}
                  tickFormatter={fmtDateTick}
                  label={{ value: "Data", position: "insideBottom", offset: -2, fill: REPORT_COLORS.axis, fontSize: 11 }}
                />
                <YAxis
                  stroke={REPORT_COLORS.axis}
                  fontSize={11}
                  width={68}
                  tickFormatter={fmtMoneyAxis}
                  label={{
                    value: "Custo (R$)",
                    angle: -90,
                    position: "insideLeft",
                    fill: REPORT_COLORS.axis,
                    fontSize: 11,
                    style: { textAnchor: "middle" },
                  }}
                />
                <Tooltip
                  content={
                    <ExecutiveChartTooltip
                      explanation={CHART_TOOLTIP_EXPLANATIONS.lineCusto}
                      labelFormatter={(label) => `Data: ${fmtDateTick(label)}`}
                      valueFormatter={lineTooltipValueFormatter}
                    />
                  }
                />
                <Legend
                  verticalAlign="top"
                  wrapperStyle={{ fontSize: 12, paddingBottom: 4 }}
                  payload={[
                    { value: CHART_LEGEND_ITEMS.custo.label, type: "line", color: REPORT_COLORS.line },
                    { value: CHART_LEGEND_ITEMS.media.label, type: "line", color: CHART_LEGEND_ITEMS.media.color },
                  ]}
                />
                <ReferenceLine
                  y={lineStats.media}
                  stroke={CHART_LEGEND_ITEMS.media.color}
                  strokeDasharray="8 4"
                  strokeWidth={2}
                  label={{
                    value: `Média ${fmtMoney(lineStats.media)}`,
                    position: "insideTopRight",
                    fill: CHART_LEGEND_ITEMS.media.color,
                    fontSize: 11,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="custo"
                  name={CHART_LEGEND_ITEMS.custo.label}
                  stroke={REPORT_COLORS.line}
                  strokeWidth={3}
                  dot={{ r: 5, fill: "#FFFFFF", stroke: REPORT_COLORS.line, strokeWidth: 2 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty />
          )}
        </ReportChartCard>
      ) : null}

      {showTransporte ? (
        <ReportChartCard
          title={CHART_GUIDES.consumoVsProducao.titulo}
          subtitle="Vermelho = consumo (L) · Verde = produção (viagens)"
          guideKey="consumoVsProducao"
          className="xl:col-span-2"
          legend={
            <StaticLegend
              title="Legenda"
              items={[
                { color: CHART_LEGEND_ITEMS.consumo.color, label: CHART_LEGEND_ITEMS.consumo.label },
                { color: CHART_LEGEND_ITEMS.producao.color, label: CHART_LEGEND_ITEMS.producao.label },
              ]}
            />
          }
          discussion={barDiscussion}
        >
          {hasRows(barData) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 28, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={REPORT_COLORS.grid} />
                <XAxis dataKey="periodo" stroke={REPORT_COLORS.axis} fontSize={11} tickFormatter={fmtDateTick} />
                <YAxis stroke={REPORT_COLORS.axis} fontSize={11} />
                <Tooltip
                  content={
                    <ExecutiveChartTooltip
                      explanation={CHART_TOOLTIP_EXPLANATIONS.barConsumoProducao}
                      labelFormatter={(label) => `Data: ${fmtDateTick(label)}`}
                      valueFormatter={(value, name) => [fmtNum(value), name]}
                    />
                  }
                />
                <Legend
                  verticalAlign="top"
                  wrapperStyle={{ fontSize: 12, paddingBottom: 4 }}
                  payload={[
                    { value: CHART_LEGEND_ITEMS.consumo.label, type: "square", color: REPORT_COLORS.consumo },
                    { value: CHART_LEGEND_ITEMS.producao.label, type: "square", color: REPORT_COLORS.producao },
                  ]}
                />
                <Bar
                  dataKey="consumo"
                  name={CHART_LEGEND_ITEMS.consumo.label}
                  fill={REPORT_COLORS.consumo}
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="producao"
                  name={CHART_LEGEND_ITEMS.producao.label}
                  fill={REPORT_COLORS.producao}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty />
          )}
        </ReportChartCard>
      ) : null}
    </div>
  );
}
