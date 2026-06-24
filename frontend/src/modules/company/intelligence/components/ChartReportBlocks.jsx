/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef } from "react";
import { CHART_GUIDES } from "../utils/chartGuides";

const fmtMoney = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDateCell = (iso) => {
  const raw = String(iso || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${d}/${m}/${y}`;
  }
  return raw;
};

export function SourceBadge({ type = "dados" }) {
  const styles = {
    ia: "bg-violet-100 text-violet-800 border-violet-200",
    dados: "bg-slate-100 text-slate-700 border-slate-200",
    regras: "bg-amber-50 text-amber-900 border-amber-200",
  };
  const labels = {
    ia: "IA FrotaMax - análise avançada",
    dados: "Calculado dos seus lançamentos",
    regras: "IA FrotaMax - dados operacionais",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[type] || styles.dados}`}
    >
      {labels[type] || labels.dados}
    </span>
  );
}

export function mapOrigemIa(origem) {
  if (origem === "openai" || origem === "cache") return "ia";
  if (origem === "motor_operacional" || origem === "fallback" || origem === "limit" || origem === "timeout") {
    return "regras";
  }
  return "regras";
}

export function ColorLegend({ title = "Legenda", items = [], required = true }) {
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {required ? (
        <p className="mt-1 text-[10px] text-slate-400">Cada cor identifica uma série distinta — leitura obrigatória.</p>
      ) : null}
      {items.length ? (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li
              key={`${item.label}-${item.value || ""}`}
              className="grid grid-cols-[12px_minmax(0,1fr)_auto_auto] items-center gap-2 text-xs"
            >
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-sm border border-slate-200"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              <span className="truncate font-medium text-slate-800" title={item.label}>
                {item.label}
              </span>
              {item.value ? <span className="tabular-nums text-slate-600">{item.value}</span> : <span />}
              {item.detail ? <span className="tabular-nums font-semibold text-slate-500">{item.detail}</span> : <span />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-slate-500">Sem séries para exibir na legenda.</p>
      )}
    </div>
  );
}

export function ExecutiveChartTooltip({
  active,
  payload,
  label,
  explanation = "",
  labelFormatter,
  valueFormatter,
}) {
  if (!active || !payload?.length) return null;

  const title = labelFormatter ? labelFormatter(label) : label;

  return (
    <div className="max-w-[280px] rounded-xl border border-slate-300 bg-white p-3 shadow-lg">
      {title ? <p className="mb-2 text-xs font-semibold text-slate-700">{title}</p> : null}
      <ul className="space-y-1.5">
        {payload.map((entry, index) => {
          const rawValue = entry.value;
          const formatted = valueFormatter
            ? valueFormatter(rawValue, entry.name, entry, index)
            : [rawValue, entry.name];
          const displayValue = Array.isArray(formatted) ? formatted[0] : formatted;
          const displayName = Array.isArray(formatted) ? formatted[1] : entry.name;

          return (
            <li key={`${entry.dataKey}-${entry.name}-${index}`} className="flex items-start gap-2 text-sm text-slate-800">
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm border border-slate-200"
                style={{ backgroundColor: entry.color || entry.payload?.fill }}
                aria-hidden
              />
              <span>
                <span className="font-medium">{displayName}:</span> {displayValue}
              </span>
            </li>
          );
        })}
      </ul>
      {explanation ? (
        <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-500">{explanation}</p>
      ) : null}
    </div>
  );
}

export function createExecutiveTooltip({ explanation, labelFormatter, valueFormatter }) {
  return function ExecutiveTooltipRenderer(props) {
    return (
      <ExecutiveChartTooltip
        {...props}
        explanation={explanation}
        labelFormatter={labelFormatter}
        valueFormatter={valueFormatter}
      />
    );
  };
}

export function StaticLegend({ title = "Legenda", items = [] }) {
  return <ColorLegend title={title} items={items.map((item) => ({ ...item, value: item.value || "", detail: item.detail || "" }))} />;
}

export function ChartDiscussion({ title = "Leitura dos resultados", points = [], source = "dados" }) {
  if (!points.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-800">{title}</p>
        <SourceBadge type={source} />
      </div>
      <ul className="mt-2 space-y-2">
        {points.map((point) => (
          <li key={point} className="flex gap-2 text-sm leading-relaxed text-slate-800">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LineCostDataTable({ stats }) {
  if (!stats?.tableRows?.length) return null;
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Data</th>
            <th className="px-3 py-2">Custo do dia</th>
            <th className="px-3 py-2">vs média ({fmtMoney(stats.media)})</th>
          </tr>
        </thead>
        <tbody>
          {stats.tableRows.map((row) => (
            <tr
              key={row.periodo}
              className={`border-t border-slate-100 ${row.isPeak ? "bg-red-50" : row.isMin ? "bg-emerald-50" : ""}`}
            >
              <td className="px-3 py-2 font-medium text-slate-800">
                {fmtDateCell(row.periodo)}
                {row.isPeak ? <span className="ml-1 text-[10px] font-semibold text-red-700">PICO</span> : null}
                {row.isMin ? <span className="ml-1 text-[10px] font-semibold text-emerald-700">MÍN</span> : null}
              </td>
              <td className="px-3 py-2 tabular-nums text-slate-800">{fmtMoney(row.custo)}</td>
              <td className="px-3 py-2 tabular-nums text-slate-600">
                {row.vsMediaPct >= 0 ? "+" : ""}
                {row.vsMediaPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartGuideBlock({ guideKey }) {
  const guide = CHART_GUIDES[guideKey];
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

export function ReportChartCard({
  title,
  subtitle,
  children,
  guideKey,
  legend,
  discussion,
  discussionSource = "dados",
  extra,
  className = "",
}) {
  const chartRef = useRef(null);

  useEffect(() => {
    const node = chartRef.current;
    if (!node) return undefined;
    node.setAttribute("data-fc-chart-ready", "false");
    const markReady = () => node.setAttribute("data-fc-chart-ready", "true");
    const frame = requestAnimationFrame(() => requestAnimationFrame(markReady));
    return () => cancelAnimationFrame(frame);
  }, [children, title, subtitle, legend, discussion, extra]);

  return (
    <article
      ref={chartRef}
      data-fc-chart-block="true"
      data-fc-chart-ready="false"
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <header>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </header>
      <div className="mt-4 h-[320px] w-full">{children}</div>
      {legend ?? (
        <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Legenda obrigatória — aguardando dados do gráfico.
        </div>
      )}
      {extra}
      <ChartDiscussion points={discussion} source={discussionSource} />
      <ChartGuideBlock guideKey={guideKey} />
    </article>
  );
}
