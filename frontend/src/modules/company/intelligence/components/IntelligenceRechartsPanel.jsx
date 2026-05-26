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

function ChartCard({ title, subtitle, children, className = "" }) {
  return (
    <article className={`rounded-xl border border-zinc-800/90 bg-zinc-950/50 p-4 sm:p-5 ${className}`}>
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      {subtitle ? <p className="mt-1 text-xs text-zinc-400">{subtitle}</p> : null}
      <div className="mt-4 h-64 w-full sm:h-72">{children}</div>
    </article>
  );
}

export default function IntelligenceRechartsPanel({ pieData, lineData, barData }) {
  return (
    <>
      <ChartCard title="Consumo por veículo" subtitle="Participação no período">
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
      </ChartCard>

      <ChartCard title="Custo por período" subtitle="Evolução do custo operacional">
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
      </ChartCard>

      <ChartCard
        title="Consumo vs produção"
        subtitle="Comparativo consolidado por período"
        className="lg:col-span-2"
      >
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
      </ChartCard>
    </>
  );
}
