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
      <div className="fc-erp-workspace">
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
  if (!stats) return <p className="text-sm text-zinc-400">Não foi possível carregar o dashboard.</p>;

  return (
    <div className="fc-erp-workspace">
      <section className="fc-card border-zinc-800/90 p-6 lg:p-8">
        <p className="fc-erp-eyebrow">Visão operacional</p>
        <h2 className="fc-erp-h1 mt-2">Painel da empresa</h2>
        <p className="fc-erp-lead mt-3">
          Abastecimentos, litros, custos e ranking por veículo estão em Combustível. Transporte e produção estão em
          Transporte. Horas de equipamento, checklist e ocorrências estão em Parte diária.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/empresa/combustivel"
            className="fc-btn inline-flex rounded-md border border-zinc-600 bg-zinc-800/80 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:border-zinc-500"
          >
            Abrir Combustível
          </Link>
          <Link
            to="/empresa/transporte"
            className="fc-btn inline-flex rounded-md border border-zinc-600 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500"
          >
            Abrir Transporte
          </Link>
          <Link
            to="/empresa/parte-diaria"
            className="fc-btn inline-flex rounded-md border border-zinc-600 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500"
          >
            Abrir Parte diária
          </Link>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/empresa/combustivel"
          className="fc-btn inline-flex rounded-md border border-zinc-700 px-4 py-3 text-center text-sm font-semibold text-zinc-200"
        >
          Combustível
        </Link>
        <Link
          to="/empresa/transporte"
          className="fc-btn inline-flex rounded-md border border-zinc-700 px-4 py-3 text-center text-sm font-semibold text-zinc-200"
        >
          Transporte
        </Link>
        <Link
          to="/empresa/parte-diaria"
          className="fc-btn inline-flex rounded-md border border-zinc-700 px-4 py-3 text-center text-sm font-semibold text-zinc-200"
        >
          Parte diária
        </Link>
        <Link
          to="/dashboard/relatorios"
          className="fc-btn inline-flex rounded-md border border-amber-500/45 bg-zinc-800/80 px-4 py-3 text-center text-sm font-semibold text-zinc-50 hover:border-amber-500/60"
        >
          Abrir relatórios completos
        </Link>
        <Link
          to="/dashboard/gestao"
          className="fc-btn inline-flex rounded-md border border-zinc-600 px-4 py-3 text-center text-sm font-semibold text-zinc-200"
        >
          Gerenciar motoristas e veículos
        </Link>
      </div>
    </div>
  );
}
