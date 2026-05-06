import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../services/auth";
import useHaptics from "../hooks/useHaptics";
import CompanyLogo from "./CompanyLogo";
import Avatar from "./Avatar";

const tabs = [
  { to: "/dashboard", label: "Visão geral", icon: "overview" },
  { to: "/dashboard/relatorios", label: "Relatórios", icon: "reports" },
  { to: "/dashboard/gestao", label: "Gestão", icon: "management" },
  { to: "/dashboard/perfil", label: "Meu Perfil", icon: "profile" },
];

function MenuIcon({ type }) {
  const iconClass = "h-4 w-4";
  if (type === "reports") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <path d="M5 4h10l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M9 12h6M9 16h6M9 8h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "management") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <path d="M9 7a3 3 0 1 0 0 .01ZM17 9a2 2 0 1 0 0 .01ZM3 18c0-2.4 2.7-4 6-4s6 1.6 6 4M14 18c.2-1.4 1.7-2.4 3.5-2.4 1.9 0 3.5 1.1 3.5 2.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "profile") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M5 20c0-3.2 3.2-5 7-5s7 1.8 7 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13" y="4" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="4" y="13" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13" y="13" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export default function EmpresaLayout({ children }) {
  const { user, logout, refreshUser } = useAuth();
  const { pathname } = useLocation();
  const { tap } = useHaptics();
  const isActive = (to) => (to === "/dashboard" ? pathname === to : pathname.startsWith(to));

  useEffect(() => {
    refreshUser?.().catch(() => {});
  }, []);

  return (
    <div className="fc-theme-empresa min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-50 border-b border-blue-500/30 bg-gradient-to-r from-blue-950/95 via-slate-900/95 to-blue-900/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <CompanyLogo
              logoUrl={user?.logo_url}
              companyName={user?.empresa_nome}
              className="h-12 w-12 border-blue-400/40 sm:h-14 sm:w-14"
            />
            <div>
              <p className="text-xs uppercase tracking-wider text-blue-200">Dashboard Empresa</p>
              <h1 className="text-lg font-semibold text-white sm:text-xl">{user?.empresa_nome || "Empresa"}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm sm:gap-3">
            <Avatar imageUrl={user?.profile_image_url} name={user?.nome} size="header" />
            <p className="hidden max-w-[180px] truncate text-slate-100 sm:block">{user?.nome}</p>
            <button onClick={logout} className="fc-btn rounded-lg border border-blue-300/30 bg-blue-500/20 px-3 py-1.5 text-blue-100">
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 md:grid-cols-[240px_1fr]">
        <aside className="flex gap-2 overflow-x-auto rounded-2xl border border-blue-500/25 bg-slate-900/75 p-3 shadow-lg shadow-blue-950/20 md:block" aria-label="Navegacao do dashboard">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              onClick={() => tap(8)}
              className={`fc-tab-link mb-0 flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm md:mb-2 ${
                isActive(tab.to)
                  ? "active bg-blue-600/35 text-blue-100 shadow-md shadow-blue-900/30"
                  : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              <MenuIcon type={tab.icon} />
              {tab.label}
            </Link>
          ))}
        </aside>
        <main className="fc-page min-w-0" id="conteudo-principal">{children}</main>
      </div>
    </div>
  );
}
