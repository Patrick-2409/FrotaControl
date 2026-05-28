import { Component, useEffect, useState } from "react";
import { CHART_GUIDES } from "../utils/chartGuides";
import { REPORT_COLORS, reportColorById } from "../utils/reportChartColors";

const hasRows = (rows) => Array.isArray(rows) && rows.length > 0;
const fmtNum = (value) => Number(value || 0).toLocaleString("pt-BR");
const maxFrom = (values) => {
  const max = Math.max(...values, 0);
  return max <= 0 ? 1 : max;
};

class ChartsErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

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

function FallbackChartsPanel({ pieData, lineData, barData, tipoAnalise }) {
  const tipo = String(tipoAnalise || "geral").toLowerCase();
  const showCombustivel = tipo === "geral" || tipo === "combustivel" || tipo === "frota";
  const showTransporte = tipo === "geral" || tipo === "transporte";
  const pieTotal = pieData.reduce((acc, item) => acc + Number(item?.value || 0), 0);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {showCombustivel && pieData.length > 1 ? (
        <ReportChartCard
          title={CHART_GUIDES.consumoPorVeiculo.titulo}
          subtitle="Participação percentual por veículo"
          guide={CHART_GUIDES.consumoPorVeiculo}
        >
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div
              className="h-44 w-44 rounded-full border border-slate-200"
              style={{
                background: (() => {
                  let cursor = 0;
                  const stops = pieData.map((item, index) => {
                    const value = Number(item?.value || 0);
                    const pct = pieTotal > 0 ? (value / pieTotal) * 100 : 0;
                    const start = cursor;
                    cursor += pct;
                    return `${reportColorById(item?.veiculo_id ?? item?.name ?? index)} ${start}% ${cursor}%`;
                  });
                  return stops.length ? `conic-gradient(${stops.join(", ")})` : "#E2E8F0";
                })(),
              }}
            />
            <div className="grid w-full gap-1 px-2">
              {pieData.map((item, index) => (
                <div key={item.name} className="flex justify-between text-xs text-slate-600">
                  <span>{item.name}</span>
                  <span>{fmtNum(item.value)} L</span>
                </div>
              ))}
            </div>
          </div>
        </ReportChartCard>
      ) : null}

      {showCombustivel ? (
        <ReportChartCard
          title={CHART_GUIDES.custoPorPeriodo.titulo}
          subtitle="Tendência diária de custo"
          guide={CHART_GUIDES.custoPorPeriodo}
          className={pieData.length <= 1 ? "xl:col-span-2" : ""}
        >
          {hasRows(lineData) ? (
            <svg viewBox="0 0 520 200" className="h-full w-full">
              <polyline
                fill="none"
                stroke={REPORT_COLORS.line}
                strokeWidth="3"
                points={lineData
                  .map((item, index) => {
                    const maxY = maxFrom(lineData.map((row) => Number(row.custo || 0)));
                    const x = 28 + (464 * index) / Math.max(1, lineData.length - 1);
                    const y = 180 - (150 * Number(item.custo || 0)) / maxY;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            </svg>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados</div>
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
            <div className="flex h-full items-end gap-2 px-2 pb-2">
              {barData.map((item) => {
                const maxY = maxFrom(barData.flatMap((row) => [Number(row.consumo || 0), Number(row.producao || 0)]));
                return (
                  <div key={item.periodo} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-52 w-full items-end justify-center gap-1">
                      <div
                        className="w-3 rounded-t bg-red-500"
                        style={{ height: `${Math.max((Number(item.consumo || 0) / maxY) * 100, 4)}%` }}
                        title={`Consumo ${fmtNum(item.consumo)}`}
                      />
                      <div
                        className="w-3 rounded-t bg-emerald-600"
                        style={{ height: `${Math.max((Number(item.producao || 0) / maxY) * 100, 4)}%` }}
                        title={`Produção ${fmtNum(item.producao)}`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">{String(item.periodo).slice(5)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados</div>
          )}
        </ReportChartCard>
      ) : null}
    </div>
  );
}

export default function ExecutiveReportCharts(props) {
  const [RechartsPanel, setRechartsPanel] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    import("./ExecutiveReportRechartsPanel")
      .then((module) => {
        if (!mounted) return;
        if (typeof module?.default === "function") {
          setRechartsPanel(() => module.default);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (mounted) setFailed(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const fallback = <FallbackChartsPanel {...props} />;

  if (failed || typeof RechartsPanel !== "function") {
    return fallback;
  }

  return (
    <ChartsErrorBoundary fallback={fallback}>
      <RechartsPanel {...props} />
    </ChartsErrorBoundary>
  );
}
