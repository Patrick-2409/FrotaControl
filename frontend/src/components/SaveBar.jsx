export default function SaveBar({ loading, label = "SALVAR" }) {
  return (
    <div className="fixed left-0 right-0 z-30 mx-auto w-full max-w-xl px-4 pb-[max(0.85rem,env(safe-area-inset-bottom,0px))] bottom-[calc(5.3rem+env(safe-area-inset-bottom,0px))]">
      <button
        type="submit"
        disabled={loading}
        className={`fc-btn btn-primary w-full rounded-2xl px-4 py-4 text-base font-bold tracking-wide transition duration-200 disabled:opacity-60 ${
          loading ? "animate-pulse shadow-lg shadow-blue-900/40" : "shadow-xl shadow-slate-950/50 hover:brightness-105"
        }`}
      >
        {loading ? "Salvando..." : label}
      </button>
    </div>
  );
}
