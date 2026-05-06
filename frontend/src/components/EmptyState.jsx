export default function EmptyState({ title, description, compact = false }) {
  return (
    <div className={`fc-card text-center ${compact ? "p-4" : "p-6"}`}>
      <div className="mx-auto mb-3 h-12 w-12 rounded-xl border border-slate-700 bg-slate-800/70 p-2">
        <svg viewBox="0 0 24 24" className="h-full w-full text-slate-300">
          <path
            fill="currentColor"
            d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 3v-3a2 2 0 0 1-2-2V6h2zm2 0v10h12V6H6z"
          />
        </svg>
      </div>
      <h4 className="text-base font-semibold text-slate-100">{title || "Nada por aqui"}</h4>
      <p className="mt-1 text-sm text-slate-400">{description || "Assim que houver dados, eles aparecem aqui."}</p>
    </div>
  );
}
