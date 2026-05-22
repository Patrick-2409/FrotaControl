export default function SaveBar({ loading, label = "SALVAR" }) {
  return (
    <div className="fc-savebar-shell fixed left-0 right-0 z-30 mx-auto w-full max-w-xl px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] bottom-[calc(5.65rem+env(safe-area-inset-bottom,0px))]">
      <button
        type="submit"
        disabled={loading}
        className={`fc-savebar-btn fc-btn btn-primary w-full rounded-2xl px-4 py-4 text-base font-bold transition duration-200 disabled:opacity-60 ${
          loading ? "animate-pulse shadow-lg shadow-blue-900/40" : "shadow-2xl shadow-slate-950/55 hover:brightness-105"
        }`}
      >
        {loading ? "Salvando..." : label}
      </button>
    </div>
  );
}
