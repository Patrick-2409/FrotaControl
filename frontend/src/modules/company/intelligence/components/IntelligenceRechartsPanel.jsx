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

const PIE_COLORS = ["#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#6b7280"];
const hasRows = (rows) => Array.isArray(rows) && rows.length > 0;

function ChartCard({ title, subtitle, children, className = "" }) {
  return (
    <article className={`rounded-xl border border-zinc-800/90 bg-zinc-950/50 p-4 ${className}`}>
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      {subtitle ? <p className="mt-1 text-xs text-zinc-400">{subtitle}</p> : null}
      <div className="mt-3 h-56 w-full overflow-x-auto sm:h-64">
        <div className="h-full min-w-[340px]">{children}</div>
      </div>
    </article>
  );
}

function ChartEmptyState() {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950/60 px-3 text-center text-xs text-zinc-500">
      Sem dados para o período selecionado
    </div>
  );
}

export default function IntelligenceRechartsPanel({ pieData, lineData, barData }) {
  return (
    <>
      <ChartCard title="Consumo por veículo" subtitle="Participação no período">
        {hasRows(pieData) ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={94} innerRadius={42}>
                {pieData.map((entry, index) => (
                  <Cell key={`pie-cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 10 }}
                labelStyle={{ color: "#d4d4d8" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmptyState />
        )}
      </ChartCard>

      <ChartCard title="Custo por período" subtitle="Evolução do custo operacional">
        {hasRows(lineData) ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="periodo" stroke="#a1a1aa" fontSize={12} />
              <YAxis stroke="#a1a1aa" fontSize={12} />
              <Tooltip
                contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 10 }}
                labelStyle={{ color: "#d4d4d8" }}
              />
              <Line type="monotone" dataKey="custo" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
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
              <XAxis dataKey="periodo" stroke="#a1a1aa" fontSize={12} />
              <YAxis stroke="#a1a1aa" fontSize={12} />
              <Tooltip
                contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 10 }}
                labelStyle={{ color: "#d4d4d8" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="consumo" name="Consumo" fill="#ca8a04" radius={[6, 6, 0, 0]} />
              <Bar dataKey="producao" name="Produção" fill="#16a34a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmptyState />
        )}
      </ChartCard>
    </>
  );
}
