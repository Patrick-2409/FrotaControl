import { Link } from "react-router-dom";
import { memo } from "react";
import { EmpresaMenuIcon, empresaSidebarTabIsActive } from "./empresaSidebarConstants";

/**
 * @param {{ variant?: "rail" | "drawer"; onNavigate?: () => void }} [props]
 * `drawer` — menu vertical full-width (overlay mobile). `rail` — comportamento desktop / grelha.
 */
function EmpresaSidebar({ pathname, search, sections, footerItems, onNavTap, onNavigate, variant = "rail" }) {
  const isDrawer = variant === "drawer";

  const isActive = (tab) => empresaSidebarTabIsActive(pathname, search, tab);

  const linkClass = (tab) =>
    [
      "fc-tab-link flex items-center gap-2.5 rounded-md px-3 py-3 text-sm font-medium sm:py-2.5",
      isDrawer ? "min-h-[44px] w-full whitespace-normal" : "shrink-0 whitespace-nowrap md:whitespace-normal",
      isActive(tab) ? "active text-zinc-50" : "text-zinc-500 hover:bg-zinc-900/80 hover:text-zinc-200",
    ].join(" ");

  const onLinkClick = () => {
    onNavTap?.();
    onNavigate?.();
  };

  return (
    <aside
      className={
        isDrawer
          ? "fc-erp-sidebar fc-empresa-sidebar fc-empresa-sidebar--drawer border-0 bg-transparent p-0 shadow-none"
          : "fc-erp-sidebar fc-empresa-sidebar rounded-xl border border-zinc-800/80 p-3 sm:p-4"
      }
      aria-label="Navegação do painel empresa"
    >
      <div
        className={
          isDrawer
            ? "fc-erp-sidebar-scroll flex flex-col gap-5"
            : "fc-erp-sidebar-scroll flex min-w-min gap-4 overflow-x-auto pb-1 md:min-w-0 md:flex-col md:gap-1 md:overflow-visible md:pb-0"
        }
      >
        {sections.map((section, si) => (
          <div
            key={section.id}
            className={
              isDrawer
                ? "fc-erp-sidebar-nav-section flex w-full min-w-0 flex-col gap-1"
                : `fc-erp-sidebar-nav-section flex shrink-0 flex-col gap-1 md:shrink ${
                    si > 0 ? "border-l border-zinc-800/90 pl-3 md:border-l-0 md:pl-0" : ""
                  }`
            }
          >
            {section.title ? (
              <p
                className={`mb-0.5 px-0.5 fc-erp-eyebrow ${isDrawer ? "whitespace-normal" : "whitespace-nowrap md:whitespace-normal"}`}
              >
                {section.title}
              </p>
            ) : null}
            <div className="flex flex-col gap-0.5">
              {section.items.map((tab) => (
                <Link
                  key={`${section.id}-${tab.to}`}
                  to={tab.to}
                  onClick={onLinkClick}
                  className={linkClass(tab)}
                  aria-current={isActive(tab) ? "page" : undefined}
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
        <div className={`border-zinc-800 pt-4 ${isDrawer ? "mt-2 border-t" : "mt-4 border-t"}`}>
          <p className={`mb-2 px-0.5 fc-erp-eyebrow ${isDrawer ? "block" : "hidden md:block"}`}>Conta</p>
          <div className={isDrawer ? "flex flex-col gap-1" : "flex flex-row gap-1 overflow-x-auto md:flex-col md:overflow-visible"}>
            {footerItems.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                onClick={onLinkClick}
                className={linkClass(tab)}
                aria-current={isActive(tab) ? "page" : undefined}
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
