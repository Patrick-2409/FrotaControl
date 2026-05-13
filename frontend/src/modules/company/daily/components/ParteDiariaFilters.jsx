import { inputClass } from "../../../../components/FormField";

export default function ParteDiariaFilters({ filtro, onFiltroChange, onClear }) {
  return (
    <div className="border-b border-violet-500/20 pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-violet-300/90">Parte diária</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Filtros do módulo</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            Período e motorista aplicam apenas a esta tela (independente de transporte e combustível).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2" role="group" aria-label="Tipo de período">
          {[
            { id: "dia", label: "Dia" },
            { id: "mes", label: "Mês" },
            { id: "intervalo", label: "Intervalo" },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onFiltroChange((f) => ({ ...f, periodo: p.id }))}
              className={`fc-btn rounded-lg border px-3 py-2 text-sm font-medium transition ${
                filtro.periodo === p.id
                  ? "border-violet-400/60 bg-violet-500/20 text-violet-100"
                  : "border-slate-600 bg-slate-900/60 text-slate-300 hover:border-slate-500"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {filtro.periodo === "dia" ? (
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
            Data operacional
            <input
              type="date"
              className={`${inputClass} mt-1 w-full`}
              value={filtro.data}
              onChange={(e) => onFiltroChange((f) => ({ ...f, data: e.target.value }))}
            />
          </label>
        ) : null}
        {filtro.periodo === "mes" ? (
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
            Mês (AAAA-MM)
            <input
              type="month"
              className={`${inputClass} mt-1 w-full`}
              value={filtro.mes}
              onChange={(e) => onFiltroChange((f) => ({ ...f, mes: e.target.value }))}
            />
          </label>
        ) : null}
        {filtro.periodo === "intervalo" ? (
          <>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Data início
              <input
                type="date"
                className={`${inputClass} mt-1 w-full`}
                value={filtro.data_inicio}
                onChange={(e) => onFiltroChange((f) => ({ ...f, data_inicio: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Data fim
              <input
                type="date"
                className={`${inputClass} mt-1 w-full`}
                value={filtro.data_fim}
                onChange={(e) => onFiltroChange((f) => ({ ...f, data_fim: e.target.value }))}
              />
            </label>
          </>
        ) : null}
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 sm:col-span-2 lg:col-span-2">
          Motorista (busca)
          <input
            type="search"
            placeholder="Nome do motorista"
            className={`${inputClass} mt-1 w-full`}
            value={filtro.motorista}
            onChange={(e) => onFiltroChange((f) => ({ ...f, motorista: e.target.value }))}
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            className="fc-btn rounded-lg border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 hover:border-violet-500/40 hover:text-white"
            onClick={onClear}
          >
            Limpar filtros
          </button>
        </div>
      </div>
    </div>
  );
}
