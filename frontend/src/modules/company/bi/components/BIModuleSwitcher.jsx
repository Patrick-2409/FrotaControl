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
      className="fc-bi-module-switcher no-scrollbar mb-6 flex gap-1 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible"
      aria-label="Painéis BI modulares"
    >
      {MODULES.map((m) => (
        <NavLink
          key={m.id}
          to={m.to}
          end={m.id === "executive"}
          className={({ isActive }) =>
            [
              "fc-bi-tab shrink-0 rounded-md px-3 py-2 text-xs font-semibold tracking-tight transition-colors sm:text-[13px]",
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
