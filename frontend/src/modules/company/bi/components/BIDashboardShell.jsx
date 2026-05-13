import { memo } from "react";
import BIModuleSwitcher from "./BIModuleSwitcher";

/**
 * Invólucro visual tipo painel BI (SAP Analytics / industrial).
 * Roadmap (não implementado): drill-down federado, IA operacional, previsão de consumo/produtividade.
 */
function BIDashboardShell({
  eyebrow,
  title,
  lead,
  headerAside,
  children,
  showRoadmap = true,
}) {
  return (
    <div className="fc-bi-dashboard-root fc-erp-workspace">
      <BIModuleSwitcher />

      <header className="fc-bi-dashboard-header border-b border-zinc-800/90 pb-5 sm:pb-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            {eyebrow ? <p className="fc-erp-eyebrow">{eyebrow}</p> : null}
            {title ? <h1 className="fc-erp-h1 mt-2">{title}</h1> : null}
            {lead ? <p className="fc-erp-lead mt-3">{lead}</p> : null}
          </div>
          {headerAside ? (
            <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2">
              {headerAside}
            </div>
          ) : null}
        </div>
      </header>

      {showRoadmap ? (
        <details className="fc-bi-roadmap group rounded-lg border border-zinc-800/80 bg-zinc-950/40">
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500/80" aria-hidden />
              Roadmap analytics &amp; IA operacional
              <span className="text-[10px] font-normal uppercase tracking-wide text-zinc-600">futuro</span>
            </span>
          </summary>
          <div className="border-t border-zinc-800/80 px-4 py-3 text-xs leading-relaxed text-zinc-500">
            Planeado para evolução do FrotaControl: BI avançado com cubos e bookmarks, analytics de frota em tempo
            quase real, modelos de previsão de consumo e produtividade, e assistência operacional — sem alteração de
            contratos nesta versão.
          </div>
        </details>
      ) : null}

      {children}
    </div>
  );
}

export default memo(BIDashboardShell);
