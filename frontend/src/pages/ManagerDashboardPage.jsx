import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import SkeletonRows from "../components/SkeletonRows";
import { emitToast } from "../services/uiEvents";

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
          produção estão em Transporte. Parte diária (horímetro, checklist e ocorrências) está no módulo dedicado.
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
          <Link
            to="/empresa/parte-diaria"
            className="fc-btn inline-flex rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Abrir módulo Parte diária
          </Link>
        </div>
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
        <Link
          to="/empresa/parte-diaria"
          className="fc-btn inline-flex rounded-xl border border-violet-500/50 px-4 py-3 text-center font-semibold text-violet-100"
        >
          Módulo Parte diária
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
