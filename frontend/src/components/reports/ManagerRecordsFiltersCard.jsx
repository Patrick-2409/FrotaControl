import { inputClass } from "../FormField";

/**
 * Filtros globais reutilizáveis — mesma semântica que a listagem /export (período, motorista, tipo).
 */
export default function ManagerRecordsFiltersCard({
  filtro,
  setFiltro,
  setPage,
  debouncedMotorista,
  localTreeSearch,
  setLocalTreeSearch,
  hasActiveFilters,
  clearFilters,
  activePeriodLabel,
  typeLabelMap,
  onApplyFilter,
  variant = "default",
}) {
  return (
    <div className="fc-card mb-3 space-y-3 p-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["dia", "Por dia"],
          ["mes", "Por mês"],
          ["intervalo", "Por período"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setPage(1);
              setFiltro((prev) => ({ ...prev, periodo: value }));
            }}
            className={`fc-btn rounded-lg border px-3 py-2 text-xs ${
              filtro.periodo === value ? "border-blue-500 bg-blue-500/20 text-blue-100" : "border-slate-700 text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        {filtro.periodo === "dia" && (
          <input
            type="date"
            placeholder="Data"
            className={inputClass}
            value={filtro.data}
            onChange={(e) => {
              setPage(1);
              setFiltro((prev) => ({ ...prev, data: e.target.value }));
            }}
          />
        )}
        {filtro.periodo === "mes" && (
          <input
            type="month"
            placeholder="Mês"
            className={inputClass}
            value={filtro.mes}
            onChange={(e) => {
              setPage(1);
              setFiltro((prev) => ({ ...prev, mes: e.target.value }));
            }}
          />
        )}
        {filtro.periodo === "intervalo" && (
          <>
            <input
              type="date"
              placeholder="Data inicial"
              className={inputClass}
              value={filtro.data_inicio}
              onChange={(e) => {
                setPage(1);
                setFiltro((prev) => ({ ...prev, data_inicio: e.target.value }));
              }}
            />
            <input
              type="date"
              placeholder="Data final"
              className={inputClass}
              value={filtro.data_fim}
              onChange={(e) => {
                setPage(1);
                setFiltro((prev) => ({ ...prev, data_fim: e.target.value }));
              }}
            />
          </>
        )}
        <input
          placeholder="Motorista"
          className={inputClass}
          value={filtro.motorista}
          onChange={(e) => {
            setPage(1);
            setFiltro((prev) => ({ ...prev, motorista: e.target.value }));
          }}
        />
        <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-4">
          {[
            ["", "Todos"],
            ["romaneio", "Romaneio"],
            ["combustivel", "Combustível"],
            ["parte_diaria", "Parte diária"],
          ].map(([tipo, label]) => (
            <button
              key={`tipo-${tipo || "todos"}`}
              type="button"
              onClick={() => {
                setPage(1);
                setFiltro((f) => ({ ...f, tipo }));
              }}
              className={`fc-btn rounded-lg border px-3 py-2 text-xs ${
                filtro.tipo === tipo ? "border-blue-500 bg-blue-500/20 text-blue-100" : "border-slate-700 text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onApplyFilter} className="fc-btn rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold">
          Filtrar
        </button>
      </div>
      {variant !== "hubMinimal" ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <input
            placeholder="Busca local na árvore (motorista, placa, destino...)"
            className={inputClass}
            value={localTreeSearch}
            onChange={(e) => setLocalTreeSearch(e.target.value)}
          />
          {localTreeSearch.trim() ? (
            <button
              type="button"
              onClick={() => setLocalTreeSearch("")}
              className="fc-btn rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200"
            >
              Limpar busca local
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <article className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
          <p className="text-[11px] uppercase tracking-wide text-blue-200/90">Período ativo</p>
          <p className="mt-1 text-sm font-semibold text-blue-100">{activePeriodLabel}</p>
        </article>
        <article className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-[11px] uppercase tracking-wide text-emerald-200/90">Atividade ativa</p>
          <p className="mt-1 text-sm font-semibold text-emerald-100">{typeLabelMap[filtro.tipo] || "Todas as atividades"}</p>
        </article>
        <article className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
          <p className="text-[11px] uppercase tracking-wide text-violet-200/90">Motorista ativo</p>
          <p className="mt-1 text-sm font-semibold text-violet-100">{debouncedMotorista?.trim() || "Todos os motoristas"}</p>
        </article>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={clearFilters}
          className="fc-btn rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200"
          disabled={!hasActiveFilters}
        >
          Limpar filtros
        </button>
      </div>
    </div>
  );
}
