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
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link
            to="/dashboard/registros"
            className="fc-btn inline-flex rounded-md border border-zinc-600 px-3 py-2 font-medium text-zinc-200 hover:border-zinc-500"
          >
            Abrir registro detalhado
          </Link>
        </div>
      </header>

      <section className="fc-card border-zinc-800/90 p-6 lg:p-8" aria-labelledby="pd-module-wrap">
        <h2 id="pd-module-wrap" className="sr-only">
          Conteúdo da parte diária
        </h2>

        <ParteDiariaFilters
          filtro={filtro}
          onFiltroChange={onFiltroChange}
          onClear={clear}
          equipamentoBusca={equipamentoBusca}
          onEquipamentoBuscaChange={setEquipamentoBusca}
          statusLocal={statusLocal}
          onStatusLocalChange={setStatusLocal}
        />

        {!loadError && !loading ? (
          <div className="mt-6 space-y-6">
            <ParteDiariaResumoStrip
              total={total}
              mediaHorasNum={snapshotInsights.mediaHorasSnapshot}
              statusOperacional={aggregates.statusOperacional}
              amostra={snapshotInsights.amostra}
              snapshotLoading={snapshotLoading}
            />
            <div className="grid min-w-0 gap-6 lg:grid-cols-2">
              <div className="fc-card border-zinc-800/90 p-5">
                <h3 className="text-sm font-semibold text-zinc-100">Registros por dia</h3>
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
            <div className="mt-6">
              <ParteDiariaStatusCards total={total} rowsOnPage={displayRows.length} aggregates={aggregates} />
            </div>

            <div className="mt-8 grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start">
              <ParteDiariaHorimetroSection aggregates={aggregates} />
              <ParteDiariaChecklistSection aggregates={aggregates} />
            </div>

            <div className="mt-8">
              <ParteDiariaOcorrenciasSection
                ocorrenciasPreview={ocorrenciasPreview}
                totalComTexto={aggregates.comObservacaoOuParada}
              />
            </div>

            {!rows.length ? (
              <div className="mt-8">
                <EmptyState
                  title="Nenhum registro de parte diária"
                  description="Ajuste o período ou o filtro de motorista, ou aguarde novos lançamentos no app."
                />
              </div>
            ) : !displayRows.length ? (
              <div className="mt-8">
                <EmptyState
                  title="Nenhuma linha corresponde aos filtros locais"
                  description="Experimente outro equipamento, local ou estado, ou limpe estes filtros extra."
                />
              </div>
            ) : (
              <div className="mt-8 min-w-0">
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
        )}
      </section>
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
