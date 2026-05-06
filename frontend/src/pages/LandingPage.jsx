import { Link } from "react-router-dom";
import SystemLogo from "../components/SystemLogo";

const accessCards = [
  {
    title: "Acesso Motorista",
    subtitle: "Operação de campo rápida e offline-first.",
    to: "/login",
    accent: "from-blue-600/30 to-cyan-500/10",
  },
  {
    title: "Acesso Empresa",
    subtitle: "Gestão operacional e relatórios da frota.",
    to: "/admin-login",
    accent: "from-emerald-600/30 to-lime-500/10",
  },
  {
    title: "Acesso Administrador do Sistema",
    subtitle: "Gestão global de empresas e governança.",
    to: "/super-admin-login",
    accent: "from-violet-600/30 to-purple-500/10",
  },
];

export default function LandingPage() {
  return (
    <div className="fc-page min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-8 px-6 py-10">
        <header className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="flex justify-center">
            <SystemLogo variant="hero" />
          </div>
          <p className="mt-3 inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-300">
            Plataforma logística
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-white md:text-5xl">FrotaControl</h1>
          <p className="mt-1 max-w-2xl text-lg font-semibold tracking-wide text-slate-100 md:text-2xl">
            Automação - Organização - Eficiência
          </p>
        </header>

        <section className="mx-auto grid w-full max-w-5xl gap-4 md:grid-cols-3">
          {accessCards.map((card) => (
            <Link
              key={card.title}
              to={card.to}
              className={`fc-btn rounded-2xl border border-slate-800 bg-gradient-to-br ${card.accent} p-6 transition hover:-translate-y-0.5 hover:border-slate-600`}
            >
              <h2 className="text-lg font-semibold text-white">{card.title}</h2>
              <p className="mt-2 text-sm text-slate-300">{card.subtitle}</p>
              <p className="mt-6 text-sm font-semibold text-blue-300">Entrar</p>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
