import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_GUIDES } from "../utils/chartGuides";
import { REPORT_COLORS, REPORT_TOOLTIP } from "../utils/reportChartColors";

const fmtNum = (value, digits = 0) =>
  Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function KpiMini({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function ExecutiveReportParteDiaria({ parteDiaria = {}, loading = false }) {
  const indicadores = parteDiaria?.indicadores || {};
  const atividades = Array.isArray(parteDiaria?.atividades_por_veiculo) ? parteDiaria.atividades_por_veiculo : [];
  const produtividade = Array.isArray(parteDiaria?.produtividade_por_dia) ? parteDiaria.produtividade_por_dia : [];
  const chartData = produtividade.map((row) => ({
    periodo: row.periodo,
    registros: Number(row.registros || 0),
    horas: Number(row.totalHoras || 0),
  }));

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-48 rounded bg-slate-200" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Parte diária</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">Atividades, produtividade e uso operacional</h2>
        <p className="mt-1 text-sm text-slate-600">
          Leitura de registros de apoio: horas lançadas, cobertura por veículo e ritmo diário.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiMini label="Registros" value={fmtNum(indicadores.totalParteDiaria)} hint="Partes diárias no período" />
        <KpiMini label="Horas totais" value={`${fmtNum(indicadores.totalHorasParteDiaria, 1)} h`} hint="Soma de horas operacionais" />
        <KpiMini label="Média por registro" value={`${fmtNum(indicadores.mediaHorasPorRegistro, 1)} h`} hint="Produtividade média" />
        <KpiMini label="Veículos ativos (PD)" value={fmtNum(indicadores.veiculosComParteDiaria)} hint="Com lançamento no período" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Atividades por veículo</h3>
          <p className="mt-1 text-sm text-slate-500">Top veículos por volume de registros e horas.</p>
          {atividades.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Veículo</th>
                    <th className="py-2 pr-3">Registros</th>
                    <th className="py-2 pr-3">Horas</th>
                    <th className="py-2">Km</th>
                  </tr>
                </thead>
                <tbody>
                  {atividades.map((row) => (
                    <tr key={`${row.veiculoId}-${row.veiculo}`} className="border-b border-slate-100">
                      <td className="py-2.5 pr-3 font-medium text-slate-800">
                        {row.veiculo}
                        <span className="ml-1 text-xs text-slate-400">{row.placa}</span>
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-slate-700">{fmtNum(row.registros)}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-slate-700">{fmtNum(row.totalHoras, 1)}</td>
                      <td className="py-2.5 tabular-nums text-slate-700">{fmtNum(row.totalKm, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Nenhuma parte diária registrada no escopo filtrado.
            </p>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">{CHART_GUIDES.parteDiariaProdutividade.titulo}</h3>
          <p className="mt-1 text-sm text-slate-500">Registros e horas por dia.</p>
          <div className="mt-4 h-[280px]">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={REPORT_COLORS.grid} />
                  <XAxis
                    dataKey="periodo"
                    stroke={REPORT_COLORS.axis}
                    fontSize={10}
                    tickFormatter={(v) => {
                      const raw = String(v || "");
                      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                        const [, mm, dd] = raw.split("-");
                        return `${dd}/${mm}`;
                      }
                      return raw.slice(0, 6);
                    }}
                  />
                  <YAxis stroke={REPORT_COLORS.axis} fontSize={10} />
                  <Tooltip {...REPORT_TOOLTIP} />
                  <Bar dataKey="registros" name="Registros" fill={REPORT_COLORS.primary} radius={[5, 5, 0, 0]} />
                  <Bar dataKey="horas" name="Horas" fill={REPORT_COLORS.success} radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                Sem série diária de produtividade
              </div>
            )}
          </div>
          <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">O que mostra</p>
              <p className="mt-1 text-sm text-slate-700">{CHART_GUIDES.parteDiariaProdutividade.oQue}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Como interpretar</p>
              <p className="mt-1 text-sm text-slate-700">{CHART_GUIDES.parteDiariaProdutividade.como}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Impacto</p>
              <p className="mt-1 text-sm text-slate-700">{CHART_GUIDES.parteDiariaProdutividade.impacto}</p>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
