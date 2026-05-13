import { useAuth } from "../services/auth";
import SystemLogo from "./SystemLogo";
import Avatar from "./Avatar";

export default function SuperAdminLayout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="fc-theme-superadmin min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <SystemLogo variant="header" className="rounded-xl" />
            <div>
            <p className="text-xs uppercase tracking-wider text-violet-300">Administração da plataforma</p>
            <h1 className="text-xl font-semibold text-white">Painel geral</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-300 sm:inline">{user?.email}</span>
            <Avatar imageUrl={user?.profile_image_url} name={user?.nome || user?.email} size="header" />
            <button onClick={logout} className="fc-btn rounded-lg border border-slate-700 px-3 py-1">
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="fc-page mx-auto w-full max-w-7xl px-6 py-6" id="conteudo-principal">{children}</main>
    </div>
  );
}
