import { Link } from "react-router-dom";
import { memo } from "react";
import { EmpresaMenuIcon, empresaSidebarTabIsActive } from "./empresaSidebarConstants";

function EmpresaSidebar({ pathname, search, sections, footerItems, onNavTap }) {
  return (
    <aside
      className="fc-erp-sidebar fc-empresa-sidebar rounded-xl border border-zinc-800/80 p-3 sm:p-4"
      aria-label="Navegação do painel empresa"
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
                  onClick={() => onNavTap?.()}
                  className={`fc-tab-link flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap md:whitespace-normal ${
                    empresaSidebarTabIsActive(pathname, search, tab)
                      ? "active text-zinc-50"
                      : "text-zinc-500 hover:bg-zinc-900/80 hover:text-zinc-200"
                  }`}
                >
                  <EmpresaMenuIcon type={tab.icon} />
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
                onClick={() => onNavTap?.()}
                className={`fc-tab-link flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap md:whitespace-normal ${
                  empresaSidebarTabIsActive(pathname, search, tab) ? "active text-zinc-50" : "text-zinc-500 hover:bg-zinc-900/80 hover:text-zinc-200"
                }`}
              >
                <EmpresaMenuIcon type={tab.icon} />
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export default memo(EmpresaSidebar);
