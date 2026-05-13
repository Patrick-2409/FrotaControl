import { Link } from "react-router-dom";
import SkeletonRows from "../../../components/SkeletonRows";
import { useEmpresaFuelDashboard } from "../../../hooks/empresa/useEmpresaFuelDashboard";
import { veiculoCombustivelLabel, fmtBRL } from "./fuelFormatters";
import FuelCharts from "./FuelCharts";
import FuelFilters from "./FuelFilters";
import FuelMetricsCards from "./FuelMetricsCards";
import FuelVehicleTable from "./FuelVehicleTable";

export default function FuelDashboardPage() {
  const fuel = useEmpresaFuelDashboard();

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-800/90 pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Módulo combustível</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">Consumo e custo</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Litros, valores, médias, pizza por veículo e ranking. Filtros isolados do transporte.
        </p>
      </header>

      {fuel.temAlertasCombustivel && fuel.resumo ? (
        <div
          role="status"
          className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/35 p-4 text-sm text-amber-50 shadow-md shadow-black/20"
        >
          {!fuel.loading && fuel.resumo?.alertas_combustivel?.consumo_elevado?.length
            ? fuel.resumo.alertas_combustivel.consumo_elevado.map((row) => (
                <p key={`comb-${row.veiculo_id ?? "x"}`} className="flex items-start gap-2 font-medium">
                  <span>⚠️ Consumo elevado no veículo {veiculoCombustivelLabel(row)}</span>
                </p>
              ))
            : null}
          {!fuel.loading && fuel.resumo?.alertas_combustivel?.preco_acima_media ? (
            <p className="flex items-start gap-2 font-medium">
              <span>⚠️ Preço do combustível acima da média</span>
            </p>
          ) : null}
          {!fuel.loading && fuel.resumo?.alertas_combustivel?.consumo_alto_periodo ? (
            <p className="flex items-start gap-2 font-medium">
              <span>⚠️ Consumo alto: ritmo diário acima da média dos últimos 12 meses</span>
            </p>
          ) : null}
          {!fuel.loading && fuel.resumo?.alertas_combustivel?.preco_fora_media_historico ? (
            <p className="flex items-start gap-2 font-medium">
              <span>⚠️ Preço fora da média: acima do preço médio histórico</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <section
        className="fc-card border-emerald-500/30 bg-gradient-to-b from-emerald-950/25 via-slate-950/50 to-slate-950/80 p-6 shadow-lg ring-1 ring-emerald-500/20"
        aria-labelledby="fuel-module-title"
      >
        <h2 id="fuel-module-title" className="sr-only">
          Painel de combustível
        </h2>

        <FuelFilters
          periodo={fuel.periodo}
          onPeriodoChange={fuel.setPeriodo}
          filtroVeiculoId={fuel.filtroVeiculoId}
          onFiltroVeiculoChange={fuel.setFiltroVeiculoId}
          filtroMotoristaId={fuel.filtroMotoristaId}
          onFiltroMotoristaChange={fuel.setFiltroMotoristaId}
          veiculosOpt={fuel.veiculosOpt}
          motoristasOpt={fuel.motoristasOpt}
          onClearVeiculoMotorista={fuel.clearFiltrosVeiculoMotorista}
        />

        {fuel.loading ? (
          <div className="mt-6">
            <SkeletonRows rows={3} />
          </div>
        ) : fuel.resumo ? (
          <>
            {fuel.semAbastecimentosNoPeriodo ? (
              <div className="mt-6 rounded-xl border border-emerald-500/35 bg-slate-900/75 p-4 ring-1 ring-emerald-500/15">
                <p className="text-base font-medium text-emerald-100">Sem abastecimentos neste período selecionado</p>
                <p className="mt-3 text-sm text-slate-200">
                  Total geral acumulado:{" "}
                  <strong className="tabular-nums text-white">
                    {fuel.totalGeralAno == null ? "—" : fmtBRL(fuel.totalGeralAno)}
                  </strong>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Valor somado no ano civil atual, considerando todos os abastecimentos da empresa (referência).
                </p>
                <button
                  type="button"
                  className="fc-btn mt-4 inline-flex rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25"
                  onClick={() => fuel.setPeriodo("mes")}
                >
                  Ver mês
                </button>
              </div>
            ) : null}

            <FuelMetricsCards resumo={fuel.resumo} mediaPorVeiculo={fuel.mediaPorVeiculo} />

            <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-start">
              <FuelCharts pie={fuel.pie} />
              <FuelVehicleTable rows={fuel.resumo.por_veiculo} />
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-xl border border-slate-600 bg-slate-900/70 p-4">
            <p className="text-base font-medium text-slate-200">
              Não foi possível carregar o resumo de combustível para este período.
            </p>
            <p className="mt-3 text-sm text-slate-200">
              Total geral acumulado:{" "}
              <strong className="tabular-nums text-white">
                {fuel.totalGeralAno == null ? "—" : fmtBRL(fuel.totalGeralAno)}
              </strong>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Referência do ano civil atual (todos os abastecimentos da empresa), quando disponível.
            </p>
            <button
              type="button"
              className="fc-btn mt-4 inline-flex rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25"
              onClick={() => fuel.setPeriodo("mes")}
            >
              Ver mês
            </button>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/empresa/dashboard"
          className="fc-btn inline-flex rounded-xl border border-slate-600 px-4 py-3 text-center font-semibold text-slate-200"
        >
          Painel executivo
        </Link>
        <Link to="/empresa/transporte" className="fc-btn inline-flex rounded-xl border border-cyan-500/50 px-4 py-3 font-semibold text-cyan-100">
          Transporte
        </Link>
        <Link to="/dashboard" className="fc-btn inline-flex rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">
          Visão operacional completa
        </Link>
      </div>
    </div>
  );
}
