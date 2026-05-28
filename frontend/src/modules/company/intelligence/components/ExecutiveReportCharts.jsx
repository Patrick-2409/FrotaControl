import { Component, useEffect, useState } from "react";
import { CHART_GUIDES } from "../utils/chartGuides";
import {
  buildBarDiscussion,
  buildLineDiscussion,
  buildLineStats,
  buildPieDiscussion,
  buildPieLegendItems,
  CHART_LEGEND_ITEMS,
} from "../utils/chartInsights";
import { ColorLegend, LineCostDataTable, ReportChartCard, StaticLegend } from "./ChartReportBlocks";
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

function FallbackChartsPanel({ pieData, lineData, barData, tipoAnalise }) {
  const tipo = String(tipoAnalise || "geral").toLowerCase();
  const showCombustivel = tipo === "geral" || tipo === "combustivel" || tipo === "frota";
  const showTransporte = tipo === "geral" || tipo === "transporte";
  const pieTotal = pieData.reduce((acc, item) => acc + Number(item?.value || 0), 0);
  const pieLegend = buildPieLegendItems(pieData);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {showCombustivel && pieData.length > 1 ? (
        <ReportChartCard
          title={CHART_GUIDES.consumoPorVeiculo.titulo}
          subtitle="Participação percentual por veículo"
          guideKey="consumoPorVeiculo"
          legend={<ColorLegend title="Legenda — cor por veículo" items={pieLegend} />}
          discussion={buildPieDiscussion(pieData)}
        >
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div
              className="h-40 w-40 rounded-full border border-slate-200"
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
          </div>
        </ReportChartCard>
      ) : null}

      {showCombustivel ? (
        <ReportChartCard
          title={CHART_GUIDES.custoPorPeriodo.titulo}
          subtitle="Eixo Y = reais (R$) · linha laranja = média diária"
          guideKey="custoPorPeriodo"
          className={pieData.length <= 1 ? "xl:col-span-2" : ""}
          legend={
            <StaticLegend
              title="Legenda"
              items={[
                { color: CHART_LEGEND_ITEMS.custo.color, label: CHART_LEGEND_ITEMS.custo.label },
                { color: CHART_LEGEND_ITEMS.media.color, label: CHART_LEGEND_ITEMS.media.label },
              ]}
            />
          }
          extra={<LineCostDataTable stats={buildLineStats(lineData)} />}
          discussion={buildLineDiscussion(lineData)}
        >
          {hasRows(lineData) ? (
            (() => {
              const stats = buildLineStats(lineData);
              const maxY = maxFrom(lineData.map((row) => Number(row.custo || 0)));
              const mediaY = stats ? 180 - (150 * stats.media) / maxY : null;
              return (
                <svg viewBox="0 0 520 220" className="h-full w-full" role="img" aria-label="Gráfico de linha de custo">
                  <text x="8" y="14" fill="#475569" fontSize="10">
                    Custo (R$)
                  </text>
                  {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                    const y = 180 - 150 * pct;
                    const val = maxY * pct;
                    return (
                      <g key={pct}>
                        <line x1="48" y1={y} x2="500" y2={y} stroke="#E2E8F0" strokeWidth="1" />
                        <text x="44" y={y + 3} fill="#64748B" fontSize="9" textAnchor="end">
                          {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : Math.round(val)}
                        </text>
                      </g>
                    );
                  })}
                  {mediaY != null ? (
                    <>
                      <line x1="48" y1={mediaY} x2="500" y2={mediaY} stroke="#D97706" strokeWidth="2" strokeDasharray="8 4" />
                      <text x="502" y={mediaY + 3} fill="#D97706" fontSize="9">
                        média
                      </text>
                    </>
                  ) : null}
                  <polyline
                    fill="none"
                    stroke={REPORT_COLORS.line}
                    strokeWidth="3"
                    points={lineData
                      .map((item, index) => {
                        const x = 48 + (452 * index) / Math.max(1, lineData.length - 1);
                        const y = 180 - (150 * Number(item.custo || 0)) / maxY;
                        return `${x},${y}`;
                      })
                      .join(" ")}
                  />
                  {lineData.map((item, index) => {
                    const x = 48 + (452 * index) / Math.max(1, lineData.length - 1);
                    const y = 180 - (150 * Number(item.custo || 0)) / maxY;
                    return <circle key={item.periodo} cx={x} cy={y} r="4" fill="#fff" stroke={REPORT_COLORS.line} strokeWidth="2" />;
                  })}
                </svg>
              );
            })()
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados</div>
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
          discussion={buildBarDiscussion(barData)}
        >
          {hasRows(barData) ? (
            <div className="flex h-full items-end gap-2 px-2 pb-2">
              {barData.map((item) => {
                const maxY = maxFrom(barData.flatMap((row) => [Number(row.consumo || 0), Number(row.producao || 0)]));
                return (
                  <div key={item.periodo} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-52 w-full items-end justify-center gap-1">
                      <div
                        className="w-3 rounded-t"
                        style={{
                          backgroundColor: REPORT_COLORS.consumo,
                          height: `${Math.max((Number(item.consumo || 0) / maxY) * 100, 4)}%`,
                        }}
                        title={`${CHART_LEGEND_ITEMS.consumo.short}: ${fmtNum(item.consumo)}`}
                      />
                      <div
                        className="w-3 rounded-t"
                        style={{
                          backgroundColor: REPORT_COLORS.producao,
                          height: `${Math.max((Number(item.producao || 0) / maxY) * 100, 4)}%`,
                        }}
                        title={`${CHART_LEGEND_ITEMS.producao.short}: ${fmtNum(item.producao)}`}
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
