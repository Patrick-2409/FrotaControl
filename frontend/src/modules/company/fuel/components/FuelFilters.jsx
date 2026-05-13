import { memo } from "react";

const selectClass =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950/90 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-600";

function FuelFilters({
  periodo,
  onPeriodoChange,
  filtroVeiculoId,
  onFiltroVeiculoChange,
  filtroMotoristaId,
  onFiltroMotoristaChange,
  veiculosOpt,
  motoristasOpt,
  onClearVeiculoMotorista,
}) {
  return (
    <div className="border-b border-zinc-800 pb-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="fc-erp-eyebrow">Abastecimento</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-zinc-100">Filtros do período</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-500">
            Período, veículo e motorista — independentes do módulo Transporte.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2" role="group" aria-label="Período do resumo de combustível">
          {[
            { id: "dia", label: "Dia" },
            { id: "semana", label: "Semana" },
            { id: "mes", label: "Mês" },
            { id: "ano", label: "Ano" },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPeriodoChange(p.id)}
              className={`fc-btn min-h-[44px] rounded-md border px-3 py-2.5 text-sm font-medium transition-colors sm:min-h-0 sm:py-2 ${
                periodo === p.id
                  ? "border-zinc-500 bg-zinc-800 text-zinc-50"
                  : "border-zinc-700 bg-zinc-950/80 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Veículo
          <select className={selectClass} value={filtroVeiculoId} onChange={(e) => onFiltroVeiculoChange(e.target.value)}>
            <option value="">Todos os veículos</option>
            {veiculosOpt.map((v) => (
              <option key={v.id} value={String(v.id)}>
                {v.nome}
                {v.placa ? ` — ${v.placa}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Motorista
          <select
            className={selectClass}
            value={filtroMotoristaId}
            onChange={(e) => onFiltroMotoristaChange(e.target.value)}
          >
            <option value="">Todos os motoristas</option>
            {motoristasOpt.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end sm:col-span-2 lg:col-span-2">
          <button
            type="button"
            className="fc-btn rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
            onClick={onClearVeiculoMotorista}
          >
            Limpar filtros de veículo e motorista
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(FuelFilters);
