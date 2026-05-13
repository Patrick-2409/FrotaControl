const selectClass =
  "mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40";

export default function FuelFilters({
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
    <div className="border-b border-emerald-500/20 pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-300/90">Abastecimento</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Gestão de combustível</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            Filtros exclusivos deste módulo (período, veículo e motorista). Independentes do módulo Transporte.
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
              className={`fc-btn rounded-lg border px-3 py-2 text-sm font-medium transition ${
                periodo === p.id
                  ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                  : "border-slate-600 bg-slate-900/60 text-slate-300 hover:border-slate-500"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
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
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
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
            className="fc-btn rounded-lg border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 hover:border-emerald-500/40 hover:text-white"
            onClick={onClearVeiculoMotorista}
          >
            Limpar filtros de veículo e motorista
          </button>
        </div>
      </div>
    </div>
  );
}
