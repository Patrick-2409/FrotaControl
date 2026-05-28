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
import { CHART_GUIDES } from "../utils/chartGuides";
import {
  buildBarDiscussion,
  buildLineDiscussion,
  buildPieDiscussion,
  buildPieLegendItems,
  CHART_LEGEND_ITEMS,
} from "../utils/chartInsights";
import { ColorLegend, ReportChartCard, StaticLegend } from "./ChartReportBlocks";
import { REPORT_COLORS, REPORT_TOOLTIP, reportColorById } from "../utils/reportChartColors";

const hasRows = (rows) => Array.isArray(rows) && rows.length > 0;
const fmtNum = (value) => Number(value || 0).toLocaleString("pt-BR");
const fmtMoney = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateTick = (value) => {
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [, mm, dd] = raw.split("-");
    return `${dd}/${mm}`;
  }
  return raw.slice(0, 6);
};

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
  const enrichedPie = pieData.map((item) => ({
    ...item,
    percent: pieTotal > 0 ? (Number(item?.value || 0) / pieTotal) * 100 : 0,
  }));
  const pieLegend = buildPieLegendItems(pieData);
  const pieDiscussion = buildPieDiscussion(pieData);
  const lineDiscussion = buildLineDiscussion(lineData);
  const barDiscussion = buildBarDiscussion(barData);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {showCombustivel && enrichedPie.length > 1 ? (
        <ReportChartCard
          title={CHART_GUIDES.consumoPorVeiculo.titulo}
          subtitle="Participação percentual por veículo"
          guideKey="consumoPorVeiculo"
          legend={<ColorLegend title="Legenda — cor por veículo" items={pieLegend} />}
          discussion={pieDiscussion}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={enrichedPie}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="46%"
                outerRadius={100}
                innerRadius={44}
                stroke="#FFFFFF"
                strokeWidth={2}
                labelLine={false}
                label={({ percent }) => (percent >= 0.07 ? `${(percent * 100).toFixed(0)}%` : "")}
              >
                {enrichedPie.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={reportColorById(entry?.veiculo_id ?? entry?.name ?? index)} />
                ))}
              </Pie>
              <Tooltip
                {...REPORT_TOOLTIP}
                formatter={(value, _name, item) => [
                  `${fmtNum(value)} L (${Number(item?.payload?.percent || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`,
                  item?.payload?.name || "Veículo",
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </ReportChartCard>
      ) : null}

      {showCombustivel ? (
        <ReportChartCard
          title={CHART_GUIDES.custoPorPeriodo.titulo}
          subtitle="Tendência diária de custo"
          guideKey="custoPorPeriodo"
          className={enrichedPie.length <= 1 ? "xl:col-span-2" : ""}
          legend={
            <StaticLegend
              title="Legenda"
              items={[{ color: CHART_LEGEND_ITEMS.custo.color, label: CHART_LEGEND_ITEMS.custo.label }]}
            />
          }
          discussion={lineDiscussion}
        >
          {hasRows(lineData) ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={REPORT_COLORS.grid} />
                <XAxis dataKey="periodo" stroke={REPORT_COLORS.axis} fontSize={11} tickFormatter={fmtDateTick} />
                <YAxis stroke={REPORT_COLORS.axis} fontSize={11} tickFormatter={(v) => fmtNum(v)} />
                <Tooltip {...REPORT_TOOLTIP} formatter={(value) => [fmtMoney(value), CHART_LEGEND_ITEMS.custo.short]} />
                <Legend
                  verticalAlign="top"
                  wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
                  payload={[{ value: CHART_LEGEND_ITEMS.custo.label, type: "line", color: REPORT_COLORS.line }]}
                />
                <Line
                  type="monotone"
                  dataKey="custo"
                  name={CHART_LEGEND_ITEMS.custo.label}
                  stroke={REPORT_COLORS.line}
                  strokeWidth={3}
                  dot={{ r: 4, fill: REPORT_COLORS.line, strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
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
          subtitle="Comparativo transporte por data"
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
                <Tooltip {...REPORT_TOOLTIP} formatter={(value, name) => [fmtNum(value), name]} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12, paddingBottom: 4 }} />
                <Bar dataKey="consumo" name={CHART_LEGEND_ITEMS.consumo.label} fill={REPORT_COLORS.consumo} radius={[6, 6, 0, 0]} />
                <Bar dataKey="producao" name={CHART_LEGEND_ITEMS.producao.label} fill={REPORT_COLORS.producao} radius={[6, 6, 0, 0]} />
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
