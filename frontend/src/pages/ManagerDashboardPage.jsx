import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import SkeletonRows from "../components/SkeletonRows";
import { emitToast } from "../services/uiEvents";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export default function ManagerDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/dashboard/stats")
      .then(({ data }) => setStats(data))
      .catch(() => emitToast("Não foi possível carregar o dashboard agora.", "warning"))
      .finally(() => setLoading(false));
  }, []);

  const parteDiariaRegistros = useMemo(() => {
    const arr = stats?.por_tipo || [];
    const hit = arr.find((x) => String(x.tipo || "").toLowerCase() === "parte_diaria");
    return Number(hit?.total ?? 0);
  }, [stats]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="fc-card p-5">
            <SkeletonRows rows={2} />
          </div>
          <div className="fc-card p-5">
            <SkeletonRows rows={2} />
          </div>
          <div className="fc-card p-5">
            <SkeletonRows rows={2} />
          </div>
        </div>
        <div className="fc-card p-5">
          <SkeletonRows rows={4} />
        </div>
      </div>
    );
  }
  if (!stats) return <p className="text-red-300">Não foi possível carregar o dashboard.</p>;

  return (
    <div className="space-y-6">
      <section className="fc-card border-blue-500/20 bg-gradient-to-r from-blue-950/40 to-slate-900/70 p-5">
        <p className="text-xs uppercase tracking-wider text-blue-200">Visão operacional</p>
        <h2 className="mt-1 text-xl font-semibold text-white">Painel da empresa</h2>
        <p className="mt-2 text-sm text-slate-300">
          Abastecimentos, litros, custos, pizza e ranking por veículo estão no módulo Combustível. Transporte e
          produção estão em Transporte.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/empresa/combustivel"
            className="fc-btn inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Abrir módulo Combustível
          </Link>
          <Link
            to="/empresa/transporte"
            className="fc-btn inline-flex rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Abrir módulo Transporte
          </Link>
        </div>
      </section>

      <section
        className="fc-card border-violet-500/30 bg-gradient-to-br from-violet-950/20 to-slate-950/80 p-6 ring-1 ring-violet-500/15"
        aria-labelledby="parte-diaria-admin-title"
      >
        <p className="text-xs font-medium uppercase tracking-wider text-violet-200/90">Documentação operacional</p>
        <h2 id="parte-diaria-admin-title" className="mt-1 text-xl font-semibold text-white">
          Parte diária
        </h2>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          Total de registros classificados como parte diária no consolidado da empresa.
        </p>
        <article className="mt-6 max-w-md rounded-xl border border-violet-500/30 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Registros (parte diária)</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-violet-200">{fmtInt(parteDiariaRegistros)}</p>
        </article>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/empresa/combustivel"
          className="fc-btn inline-flex rounded-xl border border-emerald-500/50 px-4 py-3 text-center font-semibold text-emerald-100"
        >
          Módulo Combustível
        </Link>
        <Link
          to="/empresa/transporte"
          className="fc-btn inline-flex rounded-xl border border-cyan-500/50 px-4 py-3 text-center font-semibold text-cyan-100"
        >
          Módulo Transporte
        </Link>
        <Link to="/dashboard/relatorios" className="fc-btn inline-flex rounded-xl bg-blue-600 px-4 py-3 text-center font-semibold">
          Abrir relatórios completos
        </Link>
        <Link
          to="/dashboard/gestao"
          className="fc-btn inline-flex rounded-xl border border-emerald-500 px-4 py-3 text-center font-semibold text-emerald-200"
        >
          Gerenciar motoristas e veículos
        </Link>
      </div>
    </div>
  );
}
