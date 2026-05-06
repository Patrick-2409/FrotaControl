export default function SaveBar({ loading, label = "SALVAR" }) {
  return (
    <div className="fixed bottom-14 left-0 right-0 z-30 mx-auto w-full max-w-xl px-4">
      <button
        type="submit"
        disabled={loading}
        className={`w-full rounded-xl bg-blue-600 px-4 py-4 text-base font-bold tracking-wide text-white transition duration-200 disabled:opacity-60 ${loading ? "animate-pulse shadow-lg shadow-blue-900/40" : "hover:brightness-105"}`}
      >
        {loading ? "Salvando..." : label}
      </button>
    </div>
  );
}
