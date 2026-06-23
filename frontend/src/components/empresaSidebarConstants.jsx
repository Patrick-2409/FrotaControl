/* eslint-disable react-refresh/only-export-components -- configuração e ícones da sidebar admin empresa */
import { Brain } from "lucide-react";

/** Ícones SVG neutros — mesma linguagem visual em todo o admin empresa. */
export function EmpresaMenuIcon({ type }) {
  const iconClass = "h-4 w-4";
  if (type === "brain") {
    return <Brain className={iconClass} aria-hidden="true" />;
  }
  if (type === "bell") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <path
          d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M10 21h4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
      </svg>
    );
  }
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
        <path
          d="M9 7a3 3 0 1 0 0 .01ZM17 9a2 2 0 1 0 0 .01ZM3 18c0-2.4 2.7-4 6-4s6 1.6 6 4M14 18c.2-1.4 1.7-2.4 3.5-2.4 1.9 0 3.5 1.1 3.5 2.4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
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

/** Painel operacional de veículos (fonte única de cadastro de frota). */
export const FROTA_PANEL_PATH = "/empresa/frota";

/** Gestão clássica de veículos (legado) — redireciona para FROTA_PANEL_PATH. */
export const VEICULOS_LEGACY_PATH = "/dashboard/gestao?secao=veiculos";

/** Cadastro legado de motoristas na gestão — centralizado em /empresa/pessoas. */
export const MOTORISTAS_LEGACY_PATH = "/dashboard/gestao?secao=motoristas";

const SIDEBAR_HIDDEN_TO = new Set([VEICULOS_LEGACY_PATH, MOTORISTAS_LEGACY_PATH]);

/** Remove itens legados/ocultos antes de renderizar a sidebar. */
export function filterEmpresaSidebarSections(sections) {
  return (sections || [])
    .map((section) => ({
      ...section,
      items: (section.items || []).filter((tab) => !tab.hidden && !SIDEBAR_HIDDEN_TO.has(tab.to)),
    }))
    .filter((section) => section.items.length > 0);
}

/** Navegação única do painel empresa — usada em /empresa e /dashboard (legado). */
export const EMPRESA_SIDEBAR_SECTIONS = filterEmpresaSidebarSections([
  {
    id: "dash",
    title: null,
    items: [
      { to: "/empresa/dashboard", label: "Dashboard", icon: "overview", exact: true },
      { to: "/empresa/alertas", label: "Alertas", icon: "bell", exact: false },
    ],
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
    items: [{ to: "/empresa/combustivel", label: "Combustível", icon: "fuel", exact: false }],
  },
  {
    id: "frota",
    title: "Frota",
    items: [{ to: "/empresa/frota", label: "Frota", icon: "fleet", exact: false }],
  },
  {
    id: "pessoas",
    title: "Pessoas",
    items: [{ to: "/empresa/pessoas", label: "Pessoas", icon: "people", exact: false }],
  },
  {
    id: "inteligencia",
    title: null,
    items: [
      { to: "/inteligencia", label: "Inteligência", icon: "brain", exact: false },
      { to: "/relatorio-inteligencia", label: "Relatório BI", icon: "reports", exact: false },
    ],
  },
  {
    id: "relatorios",
    title: null,
    items: [{ to: "/empresa/relatorios", label: "Relatórios", icon: "reports", exact: false }],
  },
  {
    id: "admin",
    title: null,
    items: [{ to: "/dashboard/gestao", label: "Contas de acesso", icon: "management", match: "gestao-root" }],
  },
]);

export const EMPRESA_SIDEBAR_FOOTER = [{ to: "/dashboard/perfil", label: "Meu Perfil", icon: "profile", exact: false }];

const EMPRESA_SIDEBAR_ALL_ITEMS = [
  ...EMPRESA_SIDEBAR_SECTIONS.flatMap((section) => section.items || []),
  ...EMPRESA_SIDEBAR_FOOTER,
];

const buildMobileNavItems = () => {
  const orderedPaths = [
    "/empresa/dashboard",
    "/empresa/transporte",
    "/empresa/combustivel",
    "/empresa/frota",
    "/empresa/pessoas",
  ];
  const ordered = orderedPaths
    .map((path) => EMPRESA_SIDEBAR_ALL_ITEMS.find((item) => item.to === path))
    .filter(Boolean);
  return ordered.length ? ordered : EMPRESA_SIDEBAR_ALL_ITEMS.slice(0, 5);
};

/** Itens mobile derivados da mesma fonte de verdade da sidebar. */
export const EMPRESA_MOBILE_NAV_ITEMS = buildMobileNavItems();

/** Label da rota ativa (header do shell empresa). */
export function getEmpresaActiveLabel(pathname, search = "") {
  const active = EMPRESA_SIDEBAR_ALL_ITEMS.find((tab) => empresaSidebarTabIsActive(pathname, search, tab));
  if (active?.label) return active.label;
  if (pathname === "/dashboard/gestao") return "Contas de acesso";
  return "";
}

export function empresaSidebarTabIsActive(pathname, search, tab) {
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
  if (to === "/empresa/relatorios" && pathname === "/dashboard/relatorios") return true;
  return pathname.startsWith(to);
}
