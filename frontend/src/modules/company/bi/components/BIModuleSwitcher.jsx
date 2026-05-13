import { memo } from "react";
import { NavLink } from "react-router-dom";

const MODULES = [
  { id: "executive", to: "/empresa/dashboard", label: "Executivo" },
  { id: "transport", to: "/empresa/transporte", label: "Transporte" },
  { id: "fuel", to: "/empresa/combustivel", label: "Combustível" },
  { id: "fleet", to: "/empresa/frota", label: "Frota" },
  { id: "people", to: "/empresa/pessoas", label: "Pessoas" },
];

function BIModuleSwitcher() {
  return (
    <nav
      className="fc-bi-module-switcher no-scrollbar mb-5 flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-1 sm:mb-6 sm:flex-wrap sm:overflow-visible sm:pb-0"
      aria-label="Navegação entre áreas principais"
    >
      {MODULES.map((m) => (
        <NavLink
          key={m.id}
          to={m.to}
          end={m.id === "executive"}
          className={({ isActive }) =>
            [
              "fc-bi-tab snap-start shrink-0 rounded-md px-3.5 py-3 text-xs font-semibold tracking-tight transition-colors min-h-[44px] inline-flex items-center justify-center sm:min-h-0 sm:px-3 sm:py-2 sm:text-[13px]",
              isActive ? "fc-bi-tab--active" : "fc-bi-tab--idle",
            ].join(" ")
          }
        >
          {m.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default memo(BIModuleSwitcher);
