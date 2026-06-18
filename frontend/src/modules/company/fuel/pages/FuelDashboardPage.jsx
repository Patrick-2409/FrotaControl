import { useCallback } from "react";
import { Link } from "react-router-dom";
import SkeletonRows from "../../../../components/SkeletonRows";
import BIDashboardShell from "../../bi/components/BIDashboardShell";
import BIChartCard from "../../bi/components/BIChartCard";
import { FuelProvider } from "../../contexts/FuelContext";
import { useFuelMetrics } from "../../hooks/useFuelMetrics";
import EmpresaModuleErrorPanel from "../../shared/components/EmpresaModuleErrorPanel";
import { veiculoCombustivelLabel, fmtBRL } from "../services/fuelFormatters";
import FuelCharts from "../components/FuelCharts";
import FuelFilters from "../components/FuelFilters";
import FuelMetricsCards from "../components/FuelMetricsCards";
import FuelVehicleTable from "../components/FuelVehicleTable";
import FuelAbastecimentosList from "../components/FuelAbastecimentosList";
import AccordionSection from "../../shared/components/AccordionSection";

function FuelDashboardContent() {
  const fuel = useFuelMetrics();

  const verPeriodoMes = useCallback(() => {
    fuel.setPeriodo("mes");
  }, [fuel]);

  const retryResumo = useCallback(() => {
    fuel.clearLoadError();
    void fuel.refetch();
  }, [fuel]);

  return (
    <BIDashboardShell
      eyebrow="Indicadores"
      title="Combustível"
      lead="Litros, custo e média por veículo no período escolhido."
    >

      {fuel.temAlertasCombustivel && fuel.resumo ? (
        <div role="status" className="fc-erp-alert-panel fc-erp-alert-panel--amber space-y-2.5 p-4 text-sm text-zinc-200 sm:p-5">
          <p className="fc-erp-eyebrow text-amber-200/90">Alertas operacionais</p>
          {!fuel.loading && fuel.resumo?.alertas_combustivel?.consumo_elevado?.length
            ? fuel.resumo.alertas_combustivel.consumo_elevado.map((row) => (
                <p key={`comb-${row.veiculo_id ?? "x"}`} className="flex items-start gap-2.5 font-medium leading-snug">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/95" aria-hidden />
                  <span>Consumo elevado no veículo {veiculoCombustivelLabel(row)}</span>
                </p>
              ))
            : null}
          {!fuel.loading && fuel.resumo?.alertas_combustivel?.preco_acima_media ? (
            <p className="flex items-start gap-2.5 font-medium leading-snug">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/95" aria-hidden />
              <span>Preço do combustível acima da média</span>
            </p>
          ) : null}
          {!fuel.loading && fuel.resumo?.alertas_combustivel?.consumo_alto_periodo ? (
            <p className="flex items-start gap-2.5 font-medium leading-snug">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/95" aria-hidden />
              <span>Consumo alto: ritmo diário acima da média dos últimos 12 meses</span>
            </p>
          ) : null}
          {!fuel.loading && fuel.resumo?.alertas_combustivel?.preco_fora_media_historico ? (
            <p className="flex items-start gap-2.5 font-medium leading-snug">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/95" aria-hidden />
              <span>Preço fora da média: acima do preço médio histórico</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <AccordionSection
        id="combustivel-dashboard"
        title="Dashboard e filtros"
        description="Resumo do consumo com filtros por período, motorista e veículo."
        defaultOpenDesktop
        defaultOpenMobile
      >
        <section aria-labelledby="fuel-module-title">
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
        ) : fuel.loadError ? (
          <div className="mt-6">
            <EmpresaModuleErrorPanel
              title="Resumo de combustível indisponível"
              description={fuel.loadError}
              onRetry={retryResumo}
            />
          </div>
        ) : fuel.resumo ? (
          <>
            {fuel.semAbastecimentosNoPeriodo ? (
              <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-950/60 p-5">
                <p className="text-base font-medium text-zinc-200">Sem abastecimentos neste período selecionado</p>
                <p className="mt-3 text-sm text-zinc-400">
                  Total geral acumulado:{" "}
                  <strong className="tabular-nums text-zinc-100">
                    {fuel.totalGeralAno == null ? "—" : fmtBRL(fuel.totalGeralAno)}
                  </strong>
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Valor somado no ano civil atual, considerando todos os abastecimentos da empresa (base anual).
                </p>
                <button
                  type="button"
                  className="fc-btn mt-4 inline-flex w-full justify-center rounded-md border border-zinc-600 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 sm:w-auto"
                  onClick={verPeriodoMes}
                >
                  Ver mês
                </button>
              </div>
            ) : null}

            <FuelMetricsCards resumo={fuel.resumo} mediaPorVeiculo={fuel.mediaPorVeiculo} />

            <div className="mt-10 grid min-w-0 gap-8 xl:grid-cols-2 xl:items-start">
              <BIChartCard
                title="Consumo por veículo"
                subtitle="Proporção por veículo no período."
                bodyClassName="min-h-[12rem]"
              >
                <FuelCharts pie={fuel.pie} compact />
              </BIChartCard>
              <FuelVehicleTable rows={fuel.resumo.por_veiculo} />
            </div>

          </>
        ) : (
          <div className="mt-6">
            <EmpresaModuleErrorPanel
              title="Sem dados de resumo"
              description="Não foi possível obter o resumo para o período e filtros atuais. Pode alterar o período ou tentar novamente."
              onRetry={retryResumo}
            />
            <p className="mt-4 text-sm text-zinc-500">
              Base anual (quando disponível):{" "}
              <strong className="tabular-nums text-zinc-300">
                {fuel.totalGeralAno == null ? "—" : fmtBRL(fuel.totalGeralAno)}
              </strong>
            </p>
            <button
              type="button"
              className="fc-btn mt-3 inline-flex w-full justify-center rounded-md border border-zinc-600 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 sm:w-auto"
              onClick={verPeriodoMes}
            >
              Ver mês
            </button>
          </div>
        )}
        </section>
      </AccordionSection>

      {!fuel.loading ? (
        <AccordionSection
          id="combustivel-abastecimentos"
          title="Lista de abastecimentos"
          description="Registros recentes no período selecionado."
          defaultOpenDesktop={false}
          defaultOpenMobile={false}
        >
          <FuelAbastecimentosList rows={fuel.abastecimentos} loading={fuel.abastecimentosLoading} />
        </AccordionSection>
      ) : null}

      <AccordionSection
        id="combustivel-acoes-rapidas"
        title="Ações rápidas"
        description="Navegação para módulos mais usados."
        defaultOpenDesktop={false}
        defaultOpenMobile={false}
      >
        <div className="fc-empresa-action-row flex flex-wrap gap-3">
          <Link
            to="/empresa/dashboard"
            className="fc-btn fc-btn-empresa-secondary inline-flex rounded-md border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-center text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            Painel executivo
          </Link>
          <Link
            to="/empresa/transporte"
            className="fc-btn fc-btn-empresa-secondary inline-flex rounded-md border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            Transporte
          </Link>
        </div>
      </AccordionSection>
    </BIDashboardShell>
  );
}

export default function FuelDashboardPage() {
  return (
    <FuelProvider>
      <FuelDashboardContent />
    </FuelProvider>
  );
}
