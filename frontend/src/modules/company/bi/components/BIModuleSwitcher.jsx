import { memo } from "react";
import { NavLink } from "react-router-dom";
import { EmpresaMenuIcon } from "../../../../components/empresaSidebarConstants";

const MODULES = [
  { id: "executive", to: "/empresa/dashboard", label: "Dashboard", icon: "overview" },
  { id: "transport", to: "/empresa/transporte", label: "Transporte", icon: "transport" },
  { id: "fuel", to: "/empresa/combustivel", label: "Combustível", icon: "fuel" },
  { id: "fleet", to: "/empresa/frota", label: "Frota", icon: "fleet" },
  { id: "people", to: "/empresa/pessoas", label: "Pessoas", icon: "people" },
];

function BIModuleSwitcher() {
  return (
    <nav
      className="fc-bi-module-switcher no-scrollbar mb-5 flex snap-x snap-mandatory flex-nowrap gap-1.5 overflow-x-auto pb-1 sm:mb-6 md:flex-wrap md:overflow-visible sm:pb-0"
      aria-label="Navegação entre áreas executivas"
    >
      {MODULES.map((m) => (
        <NavLink
          key={m.id}
          to={m.to}
          end={m.id === "executive"}
          className={({ isActive }) =>
            [
              "fc-bi-tab snap-start shrink-0 rounded-md px-3.5 py-3 text-xs font-semibold tracking-tight transition-colors min-h-[44px] inline-flex items-center justify-center whitespace-nowrap sm:min-h-0 sm:px-3 sm:py-2 sm:text-[13px]",
              isActive ? "fc-bi-tab--active" : "fc-bi-tab--idle",
            ].join(" ")
          }
        >
          <EmpresaMenuIcon type={m.icon} />
          <span className="ml-2">{m.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default memo(BIModuleSwitcher);
