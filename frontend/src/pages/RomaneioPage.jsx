import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { useAuth } from "../services/auth";
import EmptyState from "../components/EmptyState";

const toYmd = (raw) => String(raw || "").slice(0, 10);
const addDays = (ymd, delta) => {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

export default function RomaneioPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/app/historico");
        if (!active) return;
        const items = (Array.isArray(data?.items) ? data.items : [])
          .filter((row) => row?.module === "romaneios")
          .sort((a, b) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")));
        setRows(items);
      } catch (err) {
        if (!active) return;
        setRows([]);
        setError(err?.response?.data?.message || "Não foi possível carregar os transportes.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = addDays(today, -6);
    const monthStart = `${today.slice(0, 7)}-01`;
    const byPeriod = (start) =>
      rows.filter((row) => {
        const ymd = toYmd(row?.payload?.data || row?.payload?.recorded_at_client || row?.updatedAt);
        return ymd && ymd >= start && ymd <= today;
      }).length;
    return {
      hoje: byPeriod(today),
      semana: byPeriod(weekStart),
      mes: byPeriod(monthStart),
    };
  }, [rows]);

  if (loading) return <div className="fc-card p-4 text-sm text-slate-300">Carregando transportes...</div>;
  if (error) return <div className="fc-card p-4 text-sm text-red-300">{error}</div>;

  return (
    <div className="space-y-3">
      <section className="fc-card p-4">
        <h2 className="text-lg font-semibold text-white">Transporte realizado</h2>
        <p className="mt-1 text-sm text-slate-300">
          Motorista: {user?.nome} | Veículo: {user?.veiculo_nome || "-"}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Modo somente leitura. Registros de romaneio são exibidos para conferência operacional.
        </p>
      </section>

      <section className="fc-card p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-200">Indicadores</h3>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <article className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 text-center">
            <p className="text-[11px] text-slate-400">Hoje</p>
            <p className="mt-1 text-2xl font-bold text-white">{summary.hoje}</p>
            <p className="text-[11px] text-slate-500">viagens</p>
          </article>
          <article className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 text-center">
            <p className="text-[11px] text-slate-400">Semana</p>
            <p className="mt-1 text-2xl font-bold text-white">{summary.semana}</p>
            <p className="text-[11px] text-slate-500">viagens</p>
          </article>
          <article className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 text-center">
            <p className="text-[11px] text-slate-400">Mês</p>
            <p className="mt-1 text-2xl font-bold text-white">{summary.mes}</p>
            <p className="text-[11px] text-slate-500">viagens</p>
          </article>
        </div>
      </section>

      <section className="fc-card p-4">
        <h3 className="text-sm font-semibold text-white">Últimos transportes</h3>
        {!rows.length ? (
          <div className="mt-3">
            <EmptyState compact title="Sem transportes registrados" description="Quando houver romaneios vinculados ao seu perfil, eles aparecerão aqui." />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-3">Data</th>
                  <th className="pb-2 pr-3">Material</th>
                  <th className="pb-2 pr-3">Destino</th>
                  <th className="pb-2">Viagens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {rows.map((row) => {
                  const payload = row?.payload || {};
                  const ymd = toYmd(payload.data || payload.recorded_at_client || row.updatedAt);
                  return (
                    <tr key={row?.source_id || row?.updatedAt}>
                      <td className="py-2.5 pr-3 text-slate-300">{ymd || "—"}</td>
                      <td className="py-2.5 pr-3 text-slate-200">{payload.tipo_transporte || "—"}</td>
                      <td className="py-2.5 pr-3 text-slate-200">{payload.destino || "—"}</td>
                      <td className="py-2.5 text-slate-100">1</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
