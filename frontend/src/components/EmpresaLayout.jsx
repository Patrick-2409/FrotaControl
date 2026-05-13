import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../services/auth";
import useHaptics from "../hooks/useHaptics";
import CompanyLogo from "./CompanyLogo";
import Avatar from "./Avatar";
import EmpresaNotificationsBell from "./EmpresaNotificationsBell";
import EmpresaSidebar from "./EmpresaSidebar";
import { EMPRESA_SIDEBAR_FOOTER, EMPRESA_SIDEBAR_SECTIONS } from "./empresaSidebarConstants";

function MenuIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      {open ? (
        <path
          d="M6 6l12 12M18 6L6 18"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/**
 * Shell corporativo único do admin empresa (/empresa/* e /dashboard/*).
 * Sidebar e topbar alinhados ao mesmo sistema visual (ver `EmpresaSidebar`).
 */
export default function EmpresaLayout({ children }) {
  const { user, logout, refreshUser } = useAuth();
  const { pathname, search } = useLocation();
  const { tap } = useHaptics();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    refreshUser?.().catch(() => {});
  }, [refreshUser]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname, search]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  const closeNav = () => setNavOpen(false);

  return (
    <div className="fc-theme-empresa fc-empresa-shell-root min-h-[100dvh] min-h-screen text-zinc-100 antialiased">
      <header className="fc-empresa-shell-header sticky top-0 z-50 border-b border-zinc-800/70 bg-zinc-950/92 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="fc-empresa-nav-trigger inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-700/90 bg-zinc-900/80 text-zinc-200 shadow-sm lg:hidden active:bg-zinc-800"
              aria-label="Abrir menu de navegação"
              aria-expanded={navOpen}
              aria-controls="fc-empresa-drawer"
              onClick={() => {
                tap(6);
                setNavOpen(true);
              }}
            >
              <MenuIcon open={false} />
            </button>
            <CompanyLogo
              logoUrl={user?.logo_url}
              companyName={user?.empresa_nome}
              className="h-11 w-11 shrink-0 border border-zinc-700/80 bg-zinc-900/50 sm:h-12 sm:w-12"
            />
            <div className="min-w-0">
              <p className="fc-erp-eyebrow">Painel operacional</p>
              <h1 className="truncate text-base font-semibold tracking-tight text-zinc-50 sm:text-lg">
                {user?.empresa_nome || "Empresa"}
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-3">
            <EmpresaNotificationsBell />
            <Avatar imageUrl={user?.profile_image_url} name={user?.nome} size="header" />
            <p className="hidden max-w-[11rem] truncate text-zinc-400 sm:block">{user?.nome}</p>
            <button
              type="button"
              onClick={logout}
              className="fc-btn fc-btn-empresa-ghost rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-100 sm:text-sm"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {navOpen ? (
        <div
          className="fixed inset-0 z-[60] flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navegação"
          id="fc-empresa-drawer"
        >
          <button
            type="button"
            className="fc-empresa-nav-backdrop absolute inset-0 bg-black/65 backdrop-blur-[1px]"
            aria-label="Fechar menu de navegação"
            onClick={closeNav}
          />
          <div className="fc-empresa-drawer relative z-[1] flex h-full w-[min(20rem,90vw)] max-w-full flex-col border-r border-zinc-800/95 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/90 px-3 py-3 sm:px-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Navegação</span>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-900 text-zinc-300 active:bg-zinc-800"
                aria-label="Fechar"
                onClick={closeNav}
              >
                <MenuIcon open />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4">
              <EmpresaSidebar
                pathname={pathname}
                search={search}
                sections={EMPRESA_SIDEBAR_SECTIONS}
                footerItems={EMPRESA_SIDEBAR_FOOTER}
                variant="drawer"
                onNavTap={() => tap(8)}
                onNavigate={closeNav}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="fc-empresa-main-grid mx-auto grid w-full max-w-[90rem] gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,17.5rem)_1fr] lg:gap-10 lg:px-8 lg:py-8">
        <div className="hidden min-w-0 lg:block">
          <EmpresaSidebar
            pathname={pathname}
            search={search}
            sections={EMPRESA_SIDEBAR_SECTIONS}
            footerItems={EMPRESA_SIDEBAR_FOOTER}
            variant="rail"
            onNavTap={() => tap(8)}
          />
        </div>
        <main
          className="fc-page fc-empresa-main-pad min-w-0 max-w-[min(100%,72rem)] lg:max-w-none"
          id="conteudo-principal"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
