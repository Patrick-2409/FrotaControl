import { memo } from "react";
import BIModuleSwitcher from "./BIModuleSwitcher";

/**
 * Invólucro visual tipo painel BI (SAP Analytics / industrial).
 */
function BIDashboardShell({
  eyebrow,
  title,
  lead,
  headerAside,
  children,
  className = "",
  showModuleSwitcher = true,
}) {
  return (
    <div className={`fc-bi-dashboard-root fc-erp-workspace ${className}`.trim()}>
      {showModuleSwitcher ? <BIModuleSwitcher /> : null}

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

      {children}
    </div>
  );
}

export default memo(BIDashboardShell);
