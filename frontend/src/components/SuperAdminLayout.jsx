import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../services/auth";
import SystemLogo from "./SystemLogo";
import Avatar from "./Avatar";
import RouteTransition from "./RouteTransition";

const navTabClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
    isActive
      ? "bg-violet-600/35 text-white ring-1 ring-violet-500/45 shadow-[0_0_20px_-8px_rgba(139,92,246,0.45)]"
      : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100"
  }`;

export default function SuperAdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="fc-theme-superadmin min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80">
        <div className="fc-superadmin-header-inner mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:flex-nowrap">
          <div className="flex items-center gap-3">
            <SystemLogo variant="header" className="rounded-xl" />
            <div>
              <p className="text-xs uppercase tracking-wider text-violet-300">Administração da plataforma</p>
              <h1 className="text-xl font-semibold text-white">Painel geral</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden min-w-0 max-w-[14rem] break-words text-sm text-slate-300 sm:inline md:max-w-xs lg:max-w-md">
              {user?.email}
            </span>
            <Avatar imageUrl={user?.profile_image_url} name={user?.nome || user?.email} size="header" />
            <button type="button" onClick={logout} className="fc-btn rounded-lg border border-slate-700 px-3 py-1">
              Sair
            </button>
          </div>
        </div>
      </header>
      <main
        className="fc-page fc-superadmin-main mx-auto w-full min-w-0 max-w-[1400px] p-4"
        id="conteudo-principal"
      >
        <nav
          className="fc-superadmin-nav mb-6 flex flex-wrap gap-2 border-b border-slate-800 pb-4"
          aria-label="Secções do painel super-admin"
        >
          <NavLink to="/super-admin" end className={navTabClass}>
            Painel geral
          </NavLink>
          <NavLink to="/super-admin/historico" className={navTabClass}>
            Histórico administrativo
          </NavLink>
        </nav>
        <RouteTransition>
          <Outlet />
        </RouteTransition>
      </main>
    </div>
  );
}
