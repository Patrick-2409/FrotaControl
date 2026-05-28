import { useEffect, useState } from "react";
import { assignUniqueChartColors, reportColorByIndex } from "./reportChartColors";

export const fmtChartNum = (value) => Number(value || 0).toLocaleString("pt-BR");
export const fmtChartPct = (value) =>
  `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export const compactChartLabel = (value, max = 22) => {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

export function enrichPieChartData(pieData = []) {
  const rows = Array.isArray(pieData) ? pieData : [];
  const total = rows.reduce((acc, item) => acc + Number(item?.value || 0), 0);
  const colors = assignUniqueChartColors(rows.length);

  return rows.map((item, index) => {
    const value = Number(item?.value || 0);
    const percent = total > 0 ? (value / total) * 100 : 0;
    return {
      ...item,
      color: colors[index] || reportColorByIndex(index),
      percent,
    };
  });
}

export function formatPieSliceLabel({ value, percent }, isMobile = false) {
  const ratio = Number(percent || 0);
  if (ratio < 0.04) return "";
  const pct = fmtChartPct(ratio * 100);
  const liters = `${fmtChartNum(value)} L`;
  if (isMobile) return pct;
  return `${pct}\n${liters}`;
}

export function useChartBreakpoint(breakpoint = 768) {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(query);
    const handler = () => setIsMobile(media.matches);
    handler();
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [query]);

  return isMobile;
}

export function PieConsumoTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload || {};
  const name = item.name || "Veículo";
  const litros = fmtChartNum(item.value);
  const percentual = fmtChartPct(item.percent);

  return (
    <div
      className="max-w-[280px] rounded-xl border border-zinc-600 bg-[#111827] p-3 shadow-lg"
      role="tooltip"
    >
      <p className="text-sm font-semibold text-zinc-50">{name}</p>
      <dl className="mt-2 space-y-1 text-sm text-zinc-200">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-400">Litros</dt>
          <dd className="font-medium tabular-nums">{litros} L</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-400">Participação</dt>
          <dd className="font-semibold tabular-nums text-zinc-50">{percentual}</dd>
        </div>
      </dl>
    </div>
  );
}

export function BiPieLegend({ items = [], className = "" }) {
  if (!items.length) return null;

  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 sm:p-4 ${className}`.trim()}>
      <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 sm:text-[10px]">
        Legenda — veículo · litros · %
      </p>
      <ul className="mt-3 max-h-[220px] space-y-2 overflow-y-auto sm:max-h-none sm:space-y-2.5">
        {items.map((item, index) => (
          <li
            key={`${item.name}-${index}`}
            className="grid grid-cols-[12px_minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-0.5 text-sm sm:grid-cols-[10px_minmax(0,1fr)_auto_auto] sm:text-xs"
          >
            <span
              className="h-3 w-3 rounded-sm ring-1 ring-zinc-700 sm:h-2.5 sm:w-2.5"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            <span className="truncate font-medium text-zinc-100" title={item.name}>
              {compactChartLabel(item.name)}
            </span>
            <span className="tabular-nums text-zinc-300">{fmtChartNum(item.value)} L</span>
            <span className="tabular-nums font-semibold text-zinc-100">{fmtChartPct(item.percent)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
