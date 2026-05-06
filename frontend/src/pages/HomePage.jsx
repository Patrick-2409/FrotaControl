import { Link } from "react-router-dom";
import useHaptics from "../hooks/useHaptics";

const cards = [
  {
    to: "/app/romaneio",
    title: "Romaneio",
    subtitle: "Registrar transporte do dia",
    icon: "🚛",
  },
  {
    to: "/app/combustivel",
    title: "Combustível",
    subtitle: "Registrar abastecimento",
    icon: "⛽",
  },
  {
    to: "/app/parte-diaria",
    title: "Parte diária",
    subtitle: "Registrar operação do equipamento",
    icon: "🏗️",
  },
];

export default function HomePage({ pendingCount, online }) {
  const { tap } = useHaptics();

  return (
    <div className="space-y-3">
      <div className="fc-card p-4">
        <h2 className="text-lg font-semibold text-white">Operação do motorista</h2>
        <p className="mt-1 text-sm text-slate-300">{online ? "Conectado. Envio automático ativo." : "Offline. Seus registros serão sincronizados depois."}</p>
        <p className="mt-1 text-sm text-slate-400">Pendentes para sincronizar: {pendingCount}</p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            onClick={() => tap(12)}
            aria-label={`${card.title}. ${card.subtitle}`}
            className="fc-driver-home-card fc-btn block min-h-[150px] rounded-2xl border border-blue-500/35 bg-slate-900 px-5 py-4"
          >
            <div className="mb-3 text-4xl leading-none">{card.icon}</div>
            <h3 className="text-3xl font-bold tracking-tight text-blue-200">{card.title}</h3>
            <p className="mt-2 text-base text-slate-200">{card.subtitle}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
