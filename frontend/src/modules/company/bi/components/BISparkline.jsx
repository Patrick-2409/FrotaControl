import { memo, useId, useMemo } from "react";
import { buildSvgPathLine, projectLinePoints } from "../utils/chartMath";

function BISparkline({ values, className = "", height = 36 }) {
  const gradId = useId().replace(/:/g, "");
  const arr = useMemo(() => (Array.isArray(values) ? values.map((v) => Number(v) || 0) : []).slice(-14), [values]);
  const w = 120;
  const { points } = useMemo(() => projectLinePoints(arr, w, height, { l: 2, r: 2, t: 4, b: 4 }), [arr, height]);
  const d = useMemo(() => buildSvgPathLine(points), [points]);
  const stroke = `url(#fcBiSparkGrad-${gradId})`;

  if (arr.length < 2) {
    return <div className={`fc-bi-sparkline fc-bi-sparkline--empty ${className}`} style={{ height }} aria-hidden />;
  }

  return (
    <svg
      className={`fc-bi-sparkline ${className}`}
      width={w}
      height={height}
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`fcBiSparkGrad-${gradId}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(212, 175, 55, 0.35)" />
          <stop offset="100%" stopColor="rgba(251, 191, 36, 0.95)" />
        </linearGradient>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {points.length ? (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.25" fill="rgba(250, 250, 250, 0.9)" />
      ) : null}
    </svg>
  );
}

export default memo(BISparkline);
