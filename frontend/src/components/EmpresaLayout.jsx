import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../services/auth";
import useHaptics from "../hooks/useHaptics";
import CompanyLogo from "./CompanyLogo";
import Avatar from "./Avatar";

function MenuIcon({ type }) {
  const iconClass = "h-4 w-4";
  if (type === "transport") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <path
          d="M3 13h12v5H3v-5ZM3 9h14l2.5 4v5h-2.5v-2H3V9Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="7.5" cy="18.5" r="1.5" fill="currentColor" />
        <circle cx="14.5" cy="18.5" r="1.5" fill="currentColor" />
      </svg>
    );
  }
  if (type === "fuel") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <path d="M7 3h6v10H7V3Z" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M9 15v5H5v-7M14 6h3l2 3v9h-3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (type === "diary") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <rect x="5" y="4" width="14" height="17" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 9h6M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "fleet") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <path d="M3 15h15V8l-2-3H5L3 8v7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="7.5" cy="16.5" r="1.4" fill="currentColor" />
        <circle cx="14.5" cy="16.5" r="1.4" fill="currentColor" />
      </svg>
    );
  }
  if (type === "people") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <circle cx="9" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="17" cy="9" r="2" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M4 20c0-2.5 2.6-4 5-4s5 1.5 5 4M13 20c0-1.6 1.6-2.8 3.5-2.8S20 18.4 20 20"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
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
  if (type === "wheel") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" />
        <path d="M12 5v2.5M12 16.5V19M5 12h2.5M16.5 12H19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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

function useNavGroups(pathname) {
  return useMemo(() => {
    const empresaShell = pathname.startsWith("/empresa");
    if (empresaShell) {
      return {
        empresaShell: true,
        sections: [
          {
            id: "dash",
            title: null,
            items: [{ to: "/empresa/dashboard", label: "Dashboard", icon: "overview", exact: true }],
          },
          {
            id: "operacao",
            title: "Operação",
            items: [
              { to: "/empresa/transporte", label: "Transporte", icon: "transport", exact: false },
              { to: "/empresa/parte-diaria", label: "Parte Diária", icon: "diary", exact: false },
            ],
          },
          {
            id: "combustivel",
            title: "Combustível",
            items: [{ to: "/empresa/combustivel", label: "Dashboard Combustível", icon: "fuel", exact: false }],
          },
          {
            id: "frota",
            title: "Frota",
            items: [
              { to: "/dashboard/gestao?secao=veiculos", label: "Veículos", icon: "fleet", exact: false },
              { to: "/empresa/pessoas", label: "Pessoas", icon: "people", exact: false },
              { to: "/dashboard/gestao?secao=motoristas", label: "Motoristas", icon: "wheel", exact: false },
            ],
          },
          {
            id: "relatorios",
            title: null,
            items: [{ to: "/dashboard/relatorios", label: "Relatórios", icon: "reports", exact: false }],
          },
          {
            id: "admin",
            title: null,
            items: [{ to: "/dashboard/gestao", label: "Administração", icon: "management", match: "gestao-root" }],
          },
        ],
        footerItems: [{ to: "/dashboard/perfil", label: "Meu Perfil", icon: "profile", exact: false }],
      };
    }
    return {
      empresaShell: false,
      sections: [
        {
          id: "legacy",
          title: null,
          items: [
            { to: "/dashboard", label: "Visão geral", icon: "overview", exact: true },
            { to: "/dashboard/relatorios", label: "Relatórios", icon: "reports", exact: false },
            { to: "/dashboard/gestao", label: "Gestão", icon: "management", exact: false },
            { to: "/dashboard/perfil", label: "Meu Perfil", icon: "profile", exact: false },
          ],
        },
      ],
      footerItems: [],
    };
  }, [pathname]);
}

function tabIsActive(pathname, search, tab) {
  const sp = new URLSearchParams(search && search.startsWith("?") ? search.slice(1) : search || "");
  if (tab.match === "gestao-root") {
    return pathname === "/dashboard/gestao" && !sp.get("secao");
  }
  const to = tab.to;
  if (to.includes("?")) {
    const [path, queryStr] = to.split("?");
    if (pathname !== path) return false;
    const expected = new URLSearchParams(queryStr);
    for (const [k, v] of expected.entries()) {
      if (sp.get(k) !== v) return false;
    }
    return true;
  }
  if (tab.exact) {
    if (pathname === to) return true;
    if (to === "/empresa/dashboard" && pathname === "/empresa") return true;
    return false;
  }
  return pathname.startsWith(to);
}

export default function EmpresaLayout({ children }) {
  const { user, logout, refreshUser } = useAuth();
  const { pathname, search } = useLocation();
  const { tap } = useHaptics();
  const { sections, footerItems } = useNavGroups(pathname);

  useEffect(() => {
    refreshUser?.().catch(() => {});
  }, []);

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
            <Avatar imageUrl={user?.profile_image_url} name={user?.nome} size="header" />
            <p className="hidden max-w-[11rem] truncate text-zinc-400 sm:block">{user?.nome}</p>
            <button
              type="button"
              onClick={logout}
              className="fc-btn rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 sm:text-sm"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[90rem] gap-6 px-4 py-6 sm:gap-8 sm:px-6 lg:grid-cols-[minmax(0,17.5rem)_1fr] lg:gap-10 lg:px-8 lg:py-8">
        <aside
          className="fc-erp-sidebar rounded-xl border border-zinc-800/80 p-3 sm:p-4"
          aria-label="Navegacao do dashboard"
        >
          <div className="fc-erp-sidebar-scroll flex min-w-min gap-4 overflow-x-auto pb-1 md:min-w-0 md:flex-col md:gap-1 md:overflow-visible md:pb-0">
            {sections.map((section, si) => (
              <div
                key={section.id}
                className={`fc-erp-sidebar-nav-section flex shrink-0 flex-col gap-1 md:shrink ${
                  si > 0 ? "border-l border-zinc-800/90 pl-3 md:border-l-0 md:pl-0" : ""
                }`}
              >
                {section.title ? (
                  <p className="mb-0.5 whitespace-nowrap px-0.5 fc-erp-eyebrow md:whitespace-normal">{section.title}</p>
                ) : null}
                <div className="flex flex-col gap-0.5">
                  {section.items.map((tab) => (
                    <Link
                      key={`${section.id}-${tab.to}`}
                      to={tab.to}
                      onClick={() => tap(8)}
                      className={`fc-tab-link flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap md:whitespace-normal ${
                        tabIsActive(pathname, search, tab)
                          ? "active text-zinc-50"
                          : "text-zinc-500 hover:bg-zinc-900/80 hover:text-zinc-200"
                      }`}
                    >
                      <MenuIcon type={tab.icon} />
                      {tab.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {footerItems.length > 0 ? (
            <div className="mt-4 border-t border-zinc-800 pt-4">
              <p className="mb-2 hidden px-0.5 fc-erp-eyebrow md:block">Conta</p>
              <div className="flex flex-row gap-1 overflow-x-auto md:flex-col md:overflow-visible">
                {footerItems.map((tab) => (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    onClick={() => tap(8)}
                    className={`fc-tab-link flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap md:whitespace-normal ${
                      tabIsActive(pathname, search, tab) ? "active text-zinc-50" : "text-zinc-500 hover:bg-zinc-900/80 hover:text-zinc-200"
                    }`}
                  >
                    <MenuIcon type={tab.icon} />
                    {tab.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
        <main className="fc-page min-w-0 max-w-[min(100%,72rem)] lg:max-w-none" id="conteudo-principal">
          {children}
        </main>
      </div>
    </div>
  );
}
