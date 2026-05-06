export default function PaginationControls({ page, totalPages, onPrev, onNext }) {
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={page <= 1}
        className="rounded-lg border border-slate-700 px-3 py-1 text-sm disabled:opacity-40"
      >
        Anterior
      </button>
      <span className="text-xs text-slate-400">
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={page >= totalPages}
        className="rounded-lg border border-slate-700 px-3 py-1 text-sm disabled:opacity-40"
      >
        Próxima
      </button>
    </div>
  );
}
