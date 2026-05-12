import { Link, useNavigate } from "react-router-dom";
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
    title: "Apontador",
    subtitle: "Registro de viagens de transporte (romaneio)",
    to: "/apontador-login",
    accent: "from-amber-600/25 to-orange-500/10",
    icon: "🚛 📋",
    cta: "Acessar",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="fc-page relative min-h-screen bg-slate-950 text-slate-100">
      <button
        type="button"
        onClick={() => navigate("/super-admin-login")}
        className="absolute right-3 top-3 z-20 cursor-pointer rounded-lg border border-white/5 bg-slate-900/50 p-1.5 text-base leading-none text-slate-500 opacity-75 shadow-sm ring-0 transition hover:scale-105 hover:border-white/10 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 active:scale-95 sm:right-5 sm:top-5 sm:p-2 sm:text-lg"
        aria-label="Acesso administrador do sistema"
      >
        <span aria-hidden>⚙️</span>
      </button>

      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-8 px-6 pb-10 pt-14 sm:pt-16">
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

        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {accessCards.map((card) => (
            <Link
              key={card.title}
              to={card.to}
              className={`fc-btn rounded-2xl border border-slate-800 bg-gradient-to-br ${card.accent} p-6 transition hover:-translate-y-0.5 hover:border-slate-600`}
            >
              {card.icon ? (
                <span className="mb-2 block text-2xl leading-none opacity-90" aria-hidden>
                  {card.icon}
                </span>
              ) : null}
              <h2 className="text-lg font-semibold text-white">{card.title}</h2>
              <p className="mt-2 text-sm text-slate-300">{card.subtitle}</p>
              <p className="mt-6 text-sm font-semibold text-blue-300">{card.cta || "Entrar"}</p>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
