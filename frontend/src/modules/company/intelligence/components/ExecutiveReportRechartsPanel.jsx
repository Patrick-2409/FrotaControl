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

function ChartGuide({ guide }) {
  if (!guide) return null;
  return (
    <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">O que mostra</p>
        <p className="mt-1 text-sm text-slate-700">{guide.oQue}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Como interpretar</p>
        <p className="mt-1 text-sm text-slate-700">{guide.como}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Impacto</p>
        <p className="mt-1 text-sm text-slate-700">{guide.impacto}</p>
      </div>
    </div>
  );
}

function ReportChartCard({ title, subtitle, children, guide, className = "" }) {
  return (
    <article className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <header>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </header>
      <div className="mt-4 h-[320px] w-full">{children}</div>
      <ChartGuide guide={guide} />
    </article>
  );
}

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

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {showCombustivel && enrichedPie.length > 1 ? (
        <ReportChartCard
          title={CHART_GUIDES.consumoPorVeiculo.titulo}
          subtitle="Participação percentual por veículo"
          guide={CHART_GUIDES.consumoPorVeiculo}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={enrichedPie}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={118}
                innerRadius={52}
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
          guide={CHART_GUIDES.custoPorPeriodo}
          className={enrichedPie.length <= 1 ? "xl:col-span-2" : ""}
        >
          {hasRows(lineData) ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={REPORT_COLORS.grid} />
                <XAxis dataKey="periodo" stroke={REPORT_COLORS.axis} fontSize={11} tickFormatter={fmtDateTick} />
                <YAxis stroke={REPORT_COLORS.axis} fontSize={11} tickFormatter={(v) => fmtNum(v)} />
                <Tooltip {...REPORT_TOOLTIP} formatter={(value) => [fmtMoney(value), "Custo"]} />
                <Line
                  type="monotone"
                  dataKey="custo"
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
          guide={CHART_GUIDES.consumoVsProducao}
          className="xl:col-span-2"
        >
          {hasRows(barData) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={REPORT_COLORS.grid} />
                <XAxis dataKey="periodo" stroke={REPORT_COLORS.axis} fontSize={11} tickFormatter={fmtDateTick} />
                <YAxis stroke={REPORT_COLORS.axis} fontSize={11} />
                <Tooltip {...REPORT_TOOLTIP} formatter={(value, name) => [fmtNum(value), name]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="consumo" name="Consumo (L)" fill={REPORT_COLORS.consumo} radius={[6, 6, 0, 0]} />
                <Bar dataKey="producao" name="Produção (viagens)" fill={REPORT_COLORS.producao} radius={[6, 6, 0, 0]} />
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
