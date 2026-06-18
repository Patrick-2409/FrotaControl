import { memo } from "react";
import { Link } from "react-router-dom";
import { EMPRESA_MOBILE_NAV_ITEMS, EmpresaMenuIcon, empresaSidebarTabIsActive } from "./empresaSidebarConstants";

function EmpresaMobileNav({ pathname, search, onNavTap }) {
  return (
    <nav className="fc-empresa-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800/90 bg-zinc-950/96 px-2 pt-2 shadow-2xl backdrop-blur-md lg:hidden" aria-label="Navegação principal do gestor">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {EMPRESA_MOBILE_NAV_ITEMS.map((item) => {
          const active = empresaSidebarTabIsActive(pathname, search, item);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavTap}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={`fc-empresa-mobile-nav-link flex min-h-[3.35rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold transition ${
                active ? "fc-empresa-mobile-nav-link--active text-zinc-50" : "text-zinc-500 active:bg-zinc-900 active:text-zinc-200"
              }`}
            >
              <EmpresaMenuIcon type={item.icon} />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default memo(EmpresaMobileNav);
