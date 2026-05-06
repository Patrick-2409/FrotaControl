import { memo } from "react";

function SkeletonRows({ rows = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-800/70" />
      ))}
    </div>
  );
}

export default memo(SkeletonRows);
