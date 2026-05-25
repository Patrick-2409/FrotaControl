import { useEffect, useRef, useState } from "react";
import { useAuth } from "../services/auth";
import useHaptics from "../hooks/useHaptics";
import CompanyLogo from "./CompanyLogo";
import Avatar from "./Avatar";

/**
 * Barra superior do app apontador: identidade da operação, estado de rede, sincronizar e menu de perfil com saída.
 */
export default function ApontadorHeader({ online, textoPendentes, onSyncManual, showSyncAction = true }) {
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
  const nome = String(user?.nome || "").trim() || "Operador";
  const empresa = String(user?.empresa_nome || "").trim() || "Operação";

  const statusVisivel = online
    ? `🟢 Online${textoPendentes ? ` • ${textoPendentes}` : " • Sem pendentes"}`
    : `🔴 Offline${textoPendentes ? ` • ${textoPendentes}` : ""}`;

  const statusAria = online
    ? `Ligado à rede.${textoPendentes ? ` ${textoPendentes}.` : " Sem registros pendentes."}`
    : `Sem ligação à rede.${textoPendentes ? ` ${textoPendentes}.` : ""}`;

  return (
    <header
      className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 shadow-[0_6px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-xl supports-[backdrop-filter]:bg-slate-950/65"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(ellipse 100% 70% at 50% -10%, rgba(34,211,238,0.28), transparent 50%)",
        }}
      />
      <div className="relative mx-auto max-w-lg px-4 py-3 sm:max-w-2xl sm:px-5">
        <div className="grid grid-cols-[auto_1fr] grid-rows-[auto_auto] items-start gap-x-3 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-rows-1 sm:items-center sm:gap-x-5">
          <div className="row-start-1 shrink-0 pt-0.5 sm:pt-0">
            <CompanyLogo
              logoUrl={user?.logo_url}
              companyName={user?.empresa_nome}
              className="rounded-xl border border-white/12 bg-slate-900/70 object-contain p-1 shadow-none"
            />
          </div>

          <div className="col-start-2 row-start-1 min-w-0 sm:flex sm:justify-center sm:px-2">
            <div className="min-w-0 sm:max-w-md sm:text-center">
              <h1 className="truncate text-lg font-bold leading-tight tracking-tight text-white sm:text-xl md:text-2xl">
                {nome}
              </h1>
              <p className="mt-0.5 truncate text-xs font-medium text-slate-400 sm:text-sm">
                Apontador<span className="text-slate-500"> • </span>
                {empresa}
              </p>
              <p
                className="mt-1 text-[11px] font-medium leading-snug text-slate-500 sm:text-xs"
                role="status"
                aria-live="polite"
                aria-label={statusAria}
              >
                <span aria-hidden>{statusVisivel}</span>
              </p>
            </div>
          </div>

          <div className="col-span-2 col-start-1 row-start-2 flex items-center justify-end gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:justify-self-end">
            {showSyncAction ? (
              <button
                type="button"
                onClick={() => {
                  tap(10);
                  void onSyncManual?.();
                }}
                className="fc-btn flex h-10 items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-950/45 px-3 text-xs font-semibold text-emerald-50 transition hover:border-emerald-400/50 hover:bg-emerald-900/50 active:scale-[0.98]"
                aria-label="Sincronizar registros pendentes"
              >
                <span className="text-sm" aria-hidden>
                  ↻
                </span>
                <span className="hidden sm:inline">Sync</span>
              </button>
            ) : null}

            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => {
                  tap(8);
                  setMenuOpen((o) => !o);
                }}
                className="fc-btn group relative rounded-full border border-cyan-500/35 bg-gradient-to-br from-slate-900 to-slate-950 p-0.5 transition hover:border-cyan-400/55"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                aria-label="Menu do perfil e saída"
              >
                <span className="block rounded-full ring-1 ring-white/10 transition group-hover:ring-cyan-400/35">
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
      </div>
    </header>
  );
}
