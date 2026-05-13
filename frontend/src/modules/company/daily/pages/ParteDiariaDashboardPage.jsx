import { useCallback } from "react";
import { Link } from "react-router-dom";
import SkeletonRows from "../../../../components/SkeletonRows";
import PaginationControls from "../../../../components/PaginationControls";
import EmptyState from "../../../../components/EmptyState";
import { useEmpresaParteDiariaModule } from "../hooks/useEmpresaParteDiariaModule";
import ParteDiariaFilters from "../components/ParteDiariaFilters";
import ParteDiariaStatusCards from "../components/ParteDiariaStatusCards";
import ParteDiariaHorimetroSection from "../components/ParteDiariaHorimetroSection";
import ParteDiariaChecklistSection from "../components/ParteDiariaChecklistSection";
import ParteDiariaOcorrenciasSection from "../components/ParteDiariaOcorrenciasSection";
import ParteDiariaRecordsTable from "../components/ParteDiariaRecordsTable";

export default function ParteDiariaDashboardPage() {
  const {
    filtro,
    setFiltro,
    clearFilters,
    page,
    setPage,
    totalPages,
    total,
    rows,
    loading,
    aggregates,
    ocorrenciasPreview,
  } = useEmpresaParteDiariaModule();

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

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-800/90 pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Módulo parte diária</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">Operação e documentação do dia</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Registros consolidados da empresa, horímetro, checklist, ocorrências e status — isolados dos painéis de
          transporte e combustível.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            to="/dashboard/registros"
            className="fc-btn inline-flex rounded-lg border border-violet-500/40 px-3 py-2 font-medium text-violet-100 hover:bg-violet-500/10"
          >
            Edição avançada em Registros
          </Link>
        </div>
      </header>

      <section
        className="fc-card border-violet-500/30 bg-gradient-to-b from-violet-950/20 via-slate-950/50 to-slate-950/80 p-6 shadow-lg ring-1 ring-violet-500/20"
        aria-labelledby="pd-module-wrap"
      >
        <h2 id="pd-module-wrap" className="sr-only">
          Conteúdo do módulo parte diária
        </h2>

        <ParteDiariaFilters filtro={filtro} onFiltroChange={onFiltroChange} onClear={clear} />

        {loading ? (
          <div className="mt-6">
            <SkeletonRows rows={4} />
          </div>
        ) : (
          <>
            <div className="mt-6">
              <ParteDiariaStatusCards total={total} rowsOnPage={rows.length} aggregates={aggregates} />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
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
            ) : (
              <div className="mt-8">
                <ParteDiariaRecordsTable rows={rows} />
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
