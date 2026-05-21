import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import useHaptics from "../hooks/useHaptics";
import api from "../services/api";
import { useAuth } from "../services/auth";

const toYmd = (raw) => {
  const s = String(raw || "");
  const direct = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  return "";
};

const addDays = (ymd, delta) => {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

const getToday = () => new Date().toISOString().slice(0, 10);

export default function HomePage({ pendingCount, online }) {
  const { tap } = useHaptics();
  const { user } = useAuth();
  const [historyRows, setHistoryRows] = useState([]);
  const isTransporte = Boolean(user?.is_motorista_transporte);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await api.get("/app/historico");
        if (!active) return;
        setHistoryRows(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (active) setHistoryRows([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const transportSummary = useMemo(() => {
    const today = getToday();
    const weekStart = addDays(today, -6);
    const monthStart = `${today.slice(0, 7)}-01`;
    const romaneios = historyRows.filter((row) => row?.module === "romaneios");
    const countInRange = (start) =>
      romaneios.filter((row) => {
        const ymd = toYmd(row?.payload?.data || row?.payload?.recorded_at_client || row?.updatedAt);
        return ymd && ymd >= start && ymd <= today;
      }).length;
    return {
      hoje: countInRange(today),
      semana: countInRange(weekStart),
      mes: countInRange(monthStart),
    };
  }, [historyRows]);

  const cards = useMemo(() => {
    const base = [
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
      {
        to: "/app/historico",
        title: "Histórico",
        subtitle: "Consultar lançamentos",
        icon: "📚",
      },
    ];
    if (isTransporte) {
      return [
        {
          to: "/app/romaneio",
          title: "Transporte",
          subtitle: "Visualizar transportes realizados",
          icon: "🚛",
        },
        ...base,
      ];
    }
    return base;
  }, [isTransporte]);

  return (
    <div className="space-y-3">
      <div className="fc-card p-4">
        <h2 className="text-lg font-semibold text-white">Operação do motorista</h2>
        <p className="mt-1 text-sm text-slate-300">{online ? "Conectado. Envio automático ativo." : "Offline. Seus registros serão sincronizados depois."}</p>
        <p className="mt-1 text-sm text-slate-400">Pendentes para sincronizar: {pendingCount}</p>
      </div>
      {isTransporte ? (
        <div className="fc-card p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-200">Dashboard de transporte</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <article className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 text-center">
              <p className="text-[11px] text-slate-400">Hoje</p>
              <p className="mt-1 text-2xl font-bold text-white">{transportSummary.hoje}</p>
              <p className="text-[11px] text-slate-500">viagens</p>
            </article>
            <article className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 text-center">
              <p className="text-[11px] text-slate-400">Semana</p>
              <p className="mt-1 text-2xl font-bold text-white">{transportSummary.semana}</p>
              <p className="text-[11px] text-slate-500">viagens</p>
            </article>
            <article className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 text-center">
              <p className="text-[11px] text-slate-400">Mês</p>
              <p className="mt-1 text-2xl font-bold text-white">{transportSummary.mes}</p>
              <p className="text-[11px] text-slate-500">viagens</p>
            </article>
          </div>
        </div>
      ) : null}
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
