import { useCallback } from "react";
import { Link } from "react-router-dom";
import SkeletonRows from "../../../../components/SkeletonRows";
import PaginationControls from "../../../../components/PaginationControls";
import EmptyState from "../../../../components/EmptyState";
import { DailyOperationsProvider } from "../../contexts/DailyOperationsContext";
import { useDailyOperations } from "../../hooks/useDailyOperations";
import EmpresaModuleErrorPanel from "../../shared/components/EmpresaModuleErrorPanel";
import ParteDiariaFilters from "../components/ParteDiariaFilters";
import ParteDiariaStatusCards from "../components/ParteDiariaStatusCards";
import ParteDiariaHorimetroSection from "../components/ParteDiariaHorimetroSection";
import ParteDiariaChecklistSection from "../components/ParteDiariaChecklistSection";
import ParteDiariaOcorrenciasSection from "../components/ParteDiariaOcorrenciasSection";
import ParteDiariaRecordsTable from "../components/ParteDiariaRecordsTable";
import ParteDiariaResumoStrip from "../components/ParteDiariaResumoStrip";
import ParteDiariaDayChart from "../components/ParteDiariaDayChart";
import ParteDiariaMotoristaRanking from "../components/ParteDiariaMotoristaRanking";
import AccordionSection from "../../shared/components/AccordionSection";
import TooltipInfo from "../../shared/components/TooltipInfo";

function ParteDiariaDashboardInner() {
  const {
    filtro,
    setFiltro,
    equipamentoBusca,
    setEquipamentoBusca,
    statusLocal,
    setStatusLocal,
    clearFilters,
    page,
    setPage,
    totalPages,
    total,
    rows,
    displayRows,
    loading,
    loadError,
    clearLoadError,
    aggregates,
    ocorrenciasPreview,
    refetch,
    snapshotLoading,
    snapshotInsights,
  } = useDailyOperations();

  const onFiltroChange = useCallback((updater) => {
    setFiltro((f) => (typeof updater === "function" ? updater(f) : updater));
  }, [setFiltro]);

  const clear = useCallback(() => {
    clearFilters();
  }, [clearFilters]);

  const onPagePrev = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, [setPage]);

  const onPageNext = useCallback(() => {
    setPage((p) => Math.min(totalPages, p + 1));
  }, [setPage, totalPages]);

  const retryLoad = useCallback(() => {
    clearLoadError();
    void refetch();
  }, [clearLoadError, refetch]);

  return (
    <div className="fc-erp-workspace">
      <header className="border-b border-zinc-800 pb-6">
        <h1 className="fc-erp-h1">Parte diária</h1>
        <p className="fc-erp-lead mt-3">Horas, checklist e ocorrências da operação.</p>
        <div className="fc-empresa-action-row mt-5 flex flex-wrap gap-3 text-sm">
          <Link
            to="/empresa/relatorios?tipo=parte_diaria"
            className="fc-btn inline-flex rounded-md border border-zinc-600 px-3 py-2 font-medium text-zinc-200 hover:border-zinc-500"
          >
            Abrir registro detalhado
          </Link>
        </div>
      </header>

      <AccordionSection
        id="parte-diaria-filtros"
        title="Filtros e contexto"
        description="Defina o período e os filtros locais para análise."
        defaultOpenDesktop
        defaultOpenMobile
      >
        <ParteDiariaFilters
          filtro={filtro}
          onFiltroChange={onFiltroChange}
          onClear={clear}
          equipamentoBusca={equipamentoBusca}
          onEquipamentoBuscaChange={setEquipamentoBusca}
          statusLocal={statusLocal}
          onStatusLocalChange={setStatusLocal}
        />
      </AccordionSection>

      {!loadError && !loading ? (
        <AccordionSection
          id="parte-diaria-dashboard-rapido"
          title="Resumo da parte diária"
          description="Visão resumida de volume, horas e atividade por motorista."
          defaultOpenDesktop
          defaultOpenMobile={false}
        >
          <div className="space-y-6">
            <ParteDiariaResumoStrip
              total={total}
              mediaHorasNum={snapshotInsights.mediaHorasSnapshot}
              statusOperacional={aggregates.statusOperacional}
              amostra={snapshotInsights.amostra}
              snapshotLoading={snapshotLoading}
            />
            <div className="grid min-w-0 gap-6 lg:grid-cols-2">
              <div className="fc-card border-zinc-800/90 p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <span>Produção diária</span>
                  <TooltipInfo text="Quantidade total registrada no dia para o equipamento." />
                </h3>
                <div className="mt-4">
                  <ParteDiariaDayChart daySeries={snapshotInsights.daySeries} loading={snapshotLoading} />
                </div>
              </div>
              <div className="fc-card border-zinc-800/90 p-5">
                <h3 className="text-sm font-semibold text-zinc-100">Horas por motorista</h3>
                <div className="mt-4">
                  <ParteDiariaMotoristaRanking ranking={snapshotInsights.ranking} loading={snapshotLoading} />
                </div>
              </div>
            </div>
          </div>
        </AccordionSection>
      ) : null}

      {loadError && !loading ? (
        <div className="mt-6">
            <EmpresaModuleErrorPanel
              title="Registros indisponíveis"
              description={loadError}
              onRetry={retryLoad}
            />
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6">
          <SkeletonRows rows={4} />
        </div>
      ) : (
        <>
          <AccordionSection
            id="parte-diaria-indicadores"
            title="Indicadores operacionais"
            description="Status, horímetro, checklist e ocorrências."
            defaultOpenDesktop={false}
            defaultOpenMobile={false}
          >
            <div className="space-y-8">
              <ParteDiariaStatusCards total={total} rowsOnPage={displayRows.length} aggregates={aggregates} />

              <div className="grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start">
                <ParteDiariaHorimetroSection aggregates={aggregates} />
                <ParteDiariaChecklistSection aggregates={aggregates} />
              </div>

              <ParteDiariaOcorrenciasSection
                ocorrenciasPreview={ocorrenciasPreview}
                totalComTexto={aggregates.comObservacaoOuParada}
              />
            </div>
          </AccordionSection>

          <AccordionSection
            id="parte-diaria-registros"
            title="Registros detalhados"
            description="Tabela paginada para reduzir rolagem extensa."
            defaultOpenDesktop={false}
            defaultOpenMobile={false}
          >
          <>
            {!rows.length ? (
              <div>
                <EmptyState
                  title="Nenhum registro de parte diária"
                  description="Ajuste o período ou o filtro de motorista, ou aguarde novos lançamentos no app."
                />
              </div>
            ) : !displayRows.length ? (
              <div>
                <EmptyState
                  title="Nenhuma linha corresponde aos filtros locais"
                  description="Experimente outro equipamento, local ou estado, ou limpe estes filtros extra."
                />
              </div>
            ) : (
              <div className="min-w-0">
                <ParteDiariaRecordsTable rows={displayRows} />
                <PaginationControls
                  page={page}
                  totalPages={totalPages}
                  onPrev={onPagePrev}
                  onNext={onPageNext}
                />
              </div>
            )}
          </>
          </AccordionSection>
        </>
      )}
    </div>
  );
}

export default function ParteDiariaDashboardPage() {
  return (
    <DailyOperationsProvider>
      <ParteDiariaDashboardInner />
    </DailyOperationsProvider>
  );
}
