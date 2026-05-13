import { inputClass } from "../../../../components/FormField";

export default function ParteDiariaFilters({
  filtro,
  onFiltroChange,
  onClear,
  equipamentoBusca = "",
  onEquipamentoBuscaChange,
  statusLocal = "todos",
  onStatusLocalChange,
}) {
  return (
    <div className="border-b border-zinc-800/80 pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="fc-erp-eyebrow">Parte diária</p>
          <h2 className="fc-erp-h1 mt-2 text-xl md:text-2xl">Filtros</h2>
          <p className="fc-erp-lead mt-3 max-w-xl">
            Período e motorista definem a lista. Equipamento e estado afinam só esta página.
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
              className={`fc-btn rounded-md border px-3 py-2 text-sm font-medium transition ${
                filtro.periodo === p.id
                  ? "border-amber-500/50 bg-zinc-800/80 text-zinc-50 shadow-inner"
                  : "border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {filtro.periodo === "dia" ? (
          <label className="fc-erp-eyebrow block">
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
          <label className="fc-erp-eyebrow block">
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
            <label className="fc-erp-eyebrow block">
              Data início
              <input
                type="date"
                className={`${inputClass} mt-1 w-full`}
                value={filtro.data_inicio}
                onChange={(e) => onFiltroChange((f) => ({ ...f, data_inicio: e.target.value }))}
              />
            </label>
            <label className="fc-erp-eyebrow block">
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
        <label className="fc-erp-eyebrow block sm:col-span-2 lg:col-span-2">
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
            className="fc-btn rounded-md border border-zinc-600 bg-zinc-950/70 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-500"
            onClick={onClear}
          >
            Limpar filtros
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 border-t border-zinc-800/60 pt-5 lg:flex-row lg:items-end lg:justify-between">
        <label className="fc-erp-eyebrow block min-w-0 flex-1 lg:max-w-md">
          Equipamento ou local (só nesta página)
          <input
            type="search"
            placeholder="Ex.: escavadeira, britador…"
            className={`${inputClass} mt-1 w-full`}
            value={equipamentoBusca}
            onChange={(e) => onEquipamentoBuscaChange?.(e.target.value)}
          />
        </label>
        <div className="shrink-0">
          <p className="fc-erp-eyebrow mb-2" id="pd-status-filter-label">
            Estado (só nesta página)
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="pd-status-filter-label">
            {[
              { id: "todos", label: "Todos" },
              { id: "regular", label: "Regular" },
              { id: "checklist", label: "Checklist" },
              { id: "ocorrencias", label: "Ocorrências" },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onStatusLocalChange?.(s.id)}
                className={`fc-btn rounded-md border px-3 py-2 text-sm font-medium transition ${
                  statusLocal === s.id
                    ? "border-amber-500/50 bg-zinc-800/80 text-zinc-50 shadow-inner"
                    : "border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
