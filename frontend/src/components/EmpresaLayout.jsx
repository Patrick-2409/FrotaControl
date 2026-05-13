import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../services/auth";
import useHaptics from "../hooks/useHaptics";
import CompanyLogo from "./CompanyLogo";
import Avatar from "./Avatar";
import EmpresaNotificationsBell from "./EmpresaNotificationsBell";
import EmpresaSidebar from "./EmpresaSidebar";
import { EMPRESA_SIDEBAR_FOOTER, EMPRESA_SIDEBAR_SECTIONS } from "./empresaSidebarConstants";

/**
 * Shell corporativo único do admin empresa (/empresa/* e /dashboard/*).
 * Sidebar e topbar alinhados ao mesmo sistema visual (ver `EmpresaSidebar`).
 */
export default function EmpresaLayout({ children }) {
  const { user, logout, refreshUser } = useAuth();
  const { pathname, search } = useLocation();
  const { tap } = useHaptics();

  useEffect(() => {
    refreshUser?.().catch(() => {});
  }, [refreshUser]);

  return (
    <div className="fc-theme-empresa min-h-screen text-zinc-100 antialiased">
      <header className="sticky top-0 z-50 border-b border-zinc-800/70 bg-zinc-950/92 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
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
          <div className="flex shrink-0 items-center gap-2.5 text-sm sm:gap-3">
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

      <div className="mx-auto grid w-full max-w-[90rem] gap-6 px-4 py-6 sm:gap-8 sm:px-6 lg:grid-cols-[minmax(0,17.5rem)_1fr] lg:gap-10 lg:px-8 lg:py-8">
        <EmpresaSidebar
          pathname={pathname}
          search={search}
          sections={EMPRESA_SIDEBAR_SECTIONS}
          footerItems={EMPRESA_SIDEBAR_FOOTER}
          onNavTap={() => tap(8)}
        />
        <main className="fc-page min-w-0 max-w-[min(100%,72rem)] lg:max-w-none" id="conteudo-principal">
          {children}
        </main>
      </div>
    </div>
  );
}
