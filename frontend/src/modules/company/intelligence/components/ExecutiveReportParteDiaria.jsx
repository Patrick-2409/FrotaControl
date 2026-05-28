import { CHART_GUIDES } from "../utils/chartGuides";
import { buildParteDiariaDiscussion, CHART_LEGEND_ITEMS } from "../utils/chartInsights";
import { ChartDiscussion, ChartGuideBlock, StaticLegend } from "./ChartReportBlocks";
import { REPORT_COLORS } from "../utils/reportChartColors";

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
  const parteDiariaDiscussion = buildParteDiariaDiscussion(chartData, atividades, indicadores);
  const topAtividade = atividades.length
    ? [...atividades].sort((a, b) => Number(b.registros || 0) - Number(a.registros || 0))[0]
    : null;

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
            <>
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
              {topAtividade ? (
                <ChartDiscussion
                  title="Leitura da tabela"
                  points={[
                    `Veículo líder: ${topAtividade.veiculo} concentra ${fmtNum(topAtividade.registros)} registro(s) e ${fmtNum(topAtividade.totalHoras, 1)} h.`,
                    `Cobertura: ${fmtNum(indicadores.veiculosComParteDiaria)} veículo(s) com lançamento no período filtrado.`,
                  ]}
                />
              ) : null}
            </>
          ) : (
            <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Nenhuma parte diária registrada no escopo filtrado.
            </p>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">{CHART_GUIDES.parteDiariaProdutividade.titulo}</h3>
          <p className="mt-1 text-sm text-slate-500">Registros e horas por dia.</p>
          <StaticLegend
            title="Legenda"
            items={[
              { color: CHART_LEGEND_ITEMS.registros.color, label: CHART_LEGEND_ITEMS.registros.label },
              { color: CHART_LEGEND_ITEMS.horas.color, label: CHART_LEGEND_ITEMS.horas.label },
            ]}
          />
          <div className="mt-3 h-[280px]">
            {chartData.length ? (
              <div className="flex h-full items-end gap-2 px-2 pb-2">
                {chartData.map((item) => {
                  const maxY = Math.max(
                    ...chartData.flatMap((row) => [Number(row.registros || 0), Number(row.horas || 0)]),
                    1
                  );
                  return (
                    <div key={item.periodo} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div className="flex h-full w-full max-h-52 items-end justify-center gap-1">
                        <div
                          className="w-3 rounded-t"
                          style={{
                            backgroundColor: REPORT_COLORS.primary,
                            height: `${Math.max((Number(item.registros || 0) / maxY) * 100, 4)}%`,
                          }}
                          title={`Registros ${fmtNum(item.registros)}`}
                        />
                        <div
                          className="w-3 rounded-t"
                          style={{
                            backgroundColor: REPORT_COLORS.success,
                            height: `${Math.max((Number(item.horas || 0) / maxY) * 100, 4)}%`,
                          }}
                          title={`Horas ${fmtNum(item.horas, 1)}`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {String(item.periodo).includes("-") ? String(item.periodo).slice(5).replace("-", "/") : item.periodo}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                Sem série diária de produtividade
              </div>
            )}
          </div>
            <ChartDiscussion points={parteDiariaDiscussion} source="dados" />
          <ChartGuideBlock guideKey="parteDiariaProdutividade" />
        </article>
      </div>
    </section>
  );
}
