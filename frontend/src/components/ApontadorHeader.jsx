import { useEffect, useRef, useState } from "react";
import { useAuth } from "../services/auth";
import useHaptics from "../hooks/useHaptics";
import SystemLogo from "./SystemLogo";
import CompanyLogo from "./CompanyLogo";
import Avatar from "./Avatar";

/**
 * Barra superior do app apontador: identidade da operação, estado de rede, sincronizar e menu de perfil com saída.
 */
export default function ApontadorHeader({ online, textoPendentes, onSyncManual }) {
  const { user, logout, refreshUser } = useAuth();
  const { tap } = useHaptics();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    refreshUser?.().catch(() => {});
  }, [refreshUser]);

  useEffect(() => {
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    if (menuOpen) window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const handleLogout = () => {
    tap(12);
    setMenuOpen(false);
    logout();
    window.location.replace("/apontador-login");
  };

  const email = String(user?.email || "").trim();

  return (
    <header
      className="sticky top-0 z-50 border-b border-cyan-500/20 bg-slate-950/75 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.65)] backdrop-blur-xl supports-[backdrop-filter]:bg-slate-950/60"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(ellipse 120% 80% at 50% -20%, rgba(34,211,238,0.35), transparent 55%), linear-gradient(105deg, transparent 40%, rgba(99,102,241,0.08) 50%, transparent 60%)",
        }}
      />
      <div className="relative mx-auto flex max-w-lg flex-col gap-3 px-4 pb-3 pt-1 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <CompanyLogo
              logoUrl={user?.logo_url}
              companyName={user?.empresa_nome}
              className="h-11 w-11 shrink-0 rounded-xl border border-white/10 bg-slate-900/80 p-1 shadow-inner shadow-cyan-500/10"
            />
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <SystemLogo variant="minimal" className="rounded-md opacity-90" alt="FrotaControl" />
                <span className="rounded-full border border-cyan-400/35 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/95 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
                  Apontador
                </span>
              </div>
              <h1 className="truncate text-base font-semibold leading-tight text-white sm:text-lg">{user?.nome || "Operador"}</h1>
              <p className="truncate text-xs text-slate-400">{user?.empresa_nome || "Operação"}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                tap(10);
                void onSyncManual?.();
              }}
              className="fc-btn flex h-10 items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-3 text-xs font-semibold text-emerald-100 shadow-[0_0_20px_-4px_rgba(16,185,129,0.35)] transition hover:border-emerald-400/60 hover:bg-emerald-900/55 active:scale-[0.98]"
              aria-label="Sincronizar registos pendentes"
            >
              <span className="text-sm" aria-hidden>
                ↻
              </span>
              <span className="hidden sm:inline">Sync</span>
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => {
                  tap(8);
                  setMenuOpen((o) => !o);
                }}
                className="fc-btn group relative rounded-full border-2 border-cyan-500/40 bg-gradient-to-br from-slate-900 to-slate-950 p-0.5 shadow-[0_0_24px_-6px_rgba(34,211,238,0.45)] transition hover:border-cyan-400/70 hover:shadow-[0_0_28px_-4px_rgba(34,211,238,0.55)]"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                aria-label="Menu do perfil e saída"
              >
                <span className="block rounded-full ring-2 ring-cyan-500/20 ring-offset-2 ring-offset-slate-950 transition group-hover:ring-cyan-400/40">
                  <Avatar imageUrl={user?.profile_image_url} name={user?.nome} size="header" />
                </span>
              </button>

              {menuOpen ? (
                <div
                  className="absolute right-0 top-12 z-[60] w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 p-1 shadow-2xl shadow-black/50 backdrop-blur-md"
                  role="menu"
                >
                  <div className="border-b border-white/5 bg-gradient-to-br from-cyan-950/40 to-slate-900/90 px-4 py-3">
                    <p className="truncate text-sm font-semibold text-white">{user?.nome}</p>
                    {email ? (
                      <p className="mt-0.5 truncate text-xs text-cyan-100/80" title={email}>
                        {email}
                      </p>
                    ) : null}
                    <p className="mt-1 truncate text-xs text-slate-400">{user?.empresa_nome || "Empresa"}</p>
                  </div>
                  <div className="p-1.5">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="fc-btn flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/35 bg-rose-950/40 px-3 py-2.5 text-sm font-semibold text-rose-100 transition hover:border-rose-400/50 hover:bg-rose-900/45 active:scale-[0.99]"
                    >
                      <span aria-hidden>⎋</span>
                      Sair da conta
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide" role="status" aria-live="polite">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
              online
                ? "border-emerald-500/45 bg-emerald-500/10 text-emerald-200"
                : "border-amber-500/50 bg-amber-500/10 text-amber-100"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400 animate-pulse"}`} aria-hidden />
            {online ? "Online" : "Offline"}
          </span>
          {textoPendentes ? (
            <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-amber-100/95">{textoPendentes}</span>
          ) : (
            <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1 text-slate-400">Sem pendentes</span>
          )}
        </div>
      </div>
    </header>
  );
}
