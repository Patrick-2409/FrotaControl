import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSvgPathArea, buildSvgPathLine, projectLinePoints, sliceSeries } from "../utils/chartMath";

const defaultPad = { l: 40, r: 14, t: 14, b: 32 };

/**
 * Gráfico de linha/área em SVG — leve, responsivo (ResizeObserver), zoom por janela de índices.
 */
function BILineSeriesChart({
  data,
  valueKey = "total",
  labelKey = "dia",
  height = 220,
  yAxisLabel = "Volume",
  accent = "rgba(251, 191, 36, 0.92)",
  fillAccent = "rgba(212, 175, 55, 0.12)",
  idPrefix = "bi-line",
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(480);
  const [hover, setHover] = useState(null);
  /** null = janela completa (até último índice) */
  const [z0, setZ0] = useState(0);
  const [z1, setZ1] = useState(null);

  const series = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((row, index) => {
        const raw = row?.[valueKey];
        const v = Number(raw);
        const y = Number.isFinite(v) ? v : 0;
        const lab = row?.[labelKey];
        return { y, label: lab != null ? String(lab) : String(index), index };
      })
      .sort((a, b) => new Date(a.label).getTime() - new Date(b.label).getTime());
  }, [data, valueKey, labelKey]);

  const n = series.length;
  const end = Math.max(0, n - 1);
  const effZ1 = z1 == null ? end : Math.min(end, Math.max(0, z1));
  const effZ0 = Math.min(Math.max(0, z0), effZ1);

  useEffect(() => {
    setZ0(0);
    setZ1(null);
  }, [n]);

  const windowed = useMemo(() => sliceSeries(series, effZ0, effZ1).map((s) => s.y), [series, effZ0, effZ1]);

  const labels = useMemo(() => sliceSeries(series, effZ0, effZ1).map((s) => s.label), [series, effZ0, effZ1]);

  const chartGeom = useMemo(() => {
    const w = Math.max(200, width);
    const proj = projectLinePoints(windowed, w, height, defaultPad);
    const baseline = height - proj.pad.b;
    const linePath = buildSvgPathLine(proj.points);
    const areaPath = proj.points.length ? buildSvgPathArea(proj.points, baseline) : "";
    const { yRange } = proj;
    const ticks = 4;
    const gridYs = [];
    for (let i = 0; i <= ticks; i += 1) {
      const t = i / ticks;
      const gv = proj.pad.t + (1 - t) * proj.innerH;
      const val = yRange.min + (1 - t) * (yRange.max - yRange.min);
      gridYs.push({ y: gv, val });
    }
    return { ...proj, w, linePath, areaPath, baseline, gridYs, yRange };
  }, [windowed, width, height]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect?.width;
      if (!cr) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(Math.floor(cr)));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const onMove = useCallback(
    (e) => {
      const { points, w } = chartGeom;
      if (!points.length) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = w <= 0 ? 0 : x / w;
      let nearest = 0;
      let best = Infinity;
      points.forEach((p, i) => {
        const d = Math.abs(p.x - x);
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      const val = points[nearest]?.raw ?? 0;
      const lab = labels[nearest] ?? "";
      setHover({ x: ratio, index: nearest, value: val, label: lab });
    },
    [chartGeom, labels]
  );

  const onLeave = useCallback(() => setHover(null), []);

  const fmtY = (v) =>
    Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: v >= 100 ? 0 : 1 });

  const uid = `${idPrefix}-${n}-${width}`;

  return (
    <div ref={wrapRef} className="fc-bi-line-chart w-full min-w-0">
      {n > 4 ? (
        <div className="mb-3 flex flex-wrap items-end gap-3 text-[11px] text-zinc-400">
          <div className="flex flex-col gap-1">
            <span className="font-semibold uppercase tracking-wide text-zinc-500">Janela (zoom)</span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1">
                <span className="text-zinc-600">De</span>
                <select
                  className="fc-input max-w-[8rem] py-1.5 text-xs"
                  value={effZ0}
                  onChange={(ev) => setZ0(Number(ev.target.value))}
                >
                  {series.map((_, i) => (
                    <option key={`a-${i}`} value={i}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex items-center gap-1">
                <span className="text-zinc-600">até</span>
                <select
                  className="fc-input max-w-[8rem] py-1.5 text-xs"
                  value={effZ1}
                  onChange={(ev) => setZ1(Number(ev.target.value))}
                >
                  {series.map((_, i) => (
                    <option key={`b-${i}`} value={i}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="rounded-md border border-zinc-600 bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  setZ0(0);
                  setZ1(null);
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative w-full" role="presentation" onMouseMove={onMove} onMouseLeave={onLeave}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${chartGeom.w} ${height}`}
          className="fc-bi-line-chart__svg touch-pan-y"
          preserveAspectRatio="none"
          aria-label={`Série: ${yAxisLabel}`}
        >
          <defs>
            <linearGradient id={`${uid}-stroke`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(180, 83, 9, 0.55)" />
              <stop offset="100%" stopColor={accent} />
            </linearGradient>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillAccent} />
              <stop offset="100%" stopColor="rgba(9, 11, 14, 0)" />
            </linearGradient>
          </defs>

          {chartGeom.gridYs.map((g) => (
            <g key={g.y}>
              <line
                x1={chartGeom.pad.l}
                x2={chartGeom.w - chartGeom.pad.r}
                y1={g.y}
                y2={g.y}
                stroke="rgba(63, 63, 70, 0.45)"
                strokeDasharray="4 6"
              />
              <text x={4} y={g.y + 4} fill="#71717a" fontSize="10" className="tabular-nums">
                {fmtY(g.val)}
              </text>
            </g>
          ))}

          {chartGeom.areaPath ? (
            <path d={chartGeom.areaPath} fill={`url(#${uid}-fill)`} stroke="none" vectorEffect="non-scaling-stroke" />
          ) : null}
          {chartGeom.linePath ? (
            <path
              d={chartGeom.linePath}
              fill="none"
              stroke={`url(#${uid}-stroke)`}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {chartGeom.points.map((p, i) => (
            <circle
              key={`pt-${i}`}
              cx={p.x}
              cy={p.y}
              r={hover?.index === i ? 4 : 2.5}
              fill={hover?.index === i ? "#fafafa" : "rgba(250, 250, 250, 0.35)"}
              stroke={hover?.index === i ? accent : "transparent"}
              strokeWidth="1"
            />
          ))}
        </svg>

        {hover ? (
          <div
            className="pointer-events-none absolute z-10 max-w-[11rem] rounded-md border border-zinc-700/90 bg-zinc-950/95 px-2.5 py-2 text-[11px] text-zinc-100 shadow-xl backdrop-blur-sm"
            style={{
              left: `clamp(0.5rem, ${hover.x * 100}%, calc(100% - 11rem))`,
              top: "0.35rem",
              transform: "translateX(-50%)",
            }}
            role="status"
          >
            <p className="font-semibold text-zinc-300">
              {Number.isFinite(Date.parse(hover.label))
                ? new Date(hover.label).toLocaleDateString("pt-BR")
                : hover.label}
            </p>
            <p className="mt-1 tabular-nums text-zinc-50">
              {yAxisLabel}: <strong>{fmtY(hover.value)}</strong>
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-zinc-500">
        <span className="tabular-nums">
          Escala: 0 — {fmtY(chartGeom.yRange.max)} ({windowed.length} ponto{windowed.length === 1 ? "" : "s"})
        </span>
        <span className="hidden sm:inline">Interaja passando o cursor sobre a série</span>
      </div>
    </div>
  );
}

export default memo(BILineSeriesChart);
