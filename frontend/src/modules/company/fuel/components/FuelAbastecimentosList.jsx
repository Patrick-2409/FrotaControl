import { memo, useMemo } from "react";
import {
  fmtBRL,
  fmtLitros,
  fmtPrecoLitroAbastecimento,
  formatAbastecimentoDateTime,
  groupAbastecimentosByDay,
  veiculoLabelFromRegistro,
} from "../services/fuelFormatters";

function FuelAbastecimentoCard({ row }) {
  return (
    <article className="rounded-lg border border-zinc-800/90 bg-zinc-950/50 p-3.5 sm:p-4">
      <p className="text-sm font-semibold tabular-nums text-zinc-100">{formatAbastecimentoDateTime(row)}</p>
      <dl className="mt-3 grid gap-2.5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Veículo</dt>
          <dd className="mt-0.5 font-medium text-zinc-100">{veiculoLabelFromRegistro(row)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Litros</dt>
          <dd className="mt-0.5 tabular-nums font-medium text-zinc-100">{fmtLitros(row.litros)} L</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Valor</dt>
          <dd className="mt-0.5 tabular-nums font-medium text-zinc-100">{fmtBRL(row.valor_total)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Preço por litro</dt>
          <dd className="mt-0.5 tabular-nums font-medium text-zinc-100">{fmtPrecoLitroAbastecimento(row)}</dd>
        </div>
      </dl>
      {row.motorista ? (
        <p className="mt-2.5 text-xs text-zinc-500">
          Motorista: <span className="text-zinc-400">{row.motorista}</span>
        </p>
      ) : null}
    </article>
  );
}

function FuelAbastecimentosList({ rows, loading }) {
  const groups = useMemo(() => groupAbastecimentosByDay(rows), [rows]);

  if (loading) {
    return (
      <section className="fc-card border-zinc-800/90 p-5 sm:p-6" aria-busy="true">
        <p className="text-sm text-zinc-500">Carregando abastecimentos…</p>
      </section>
    );
  }

  if (!rows?.length) {
    return (
      <section className="fc-card border-zinc-800/90 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-zinc-50 sm:text-lg">Abastecimentos</h2>
        <p className="mt-2 text-sm text-zinc-500">Nenhum abastecimento no período e filtros atuais.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="fuel-abastecimentos-title" className="fc-card overflow-hidden border-zinc-800/90 p-0">
      <div className="border-b border-zinc-800/90 bg-zinc-900/75 px-4 py-3.5 sm:px-5 sm:py-4">
        <h2 id="fuel-abastecimentos-title" className="text-base font-semibold tracking-tight text-zinc-50 sm:text-lg">
          Abastecimentos
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          {rows.length} registro{rows.length === 1 ? "" : "s"} no período — horário de lançamento no fuso de São Paulo.
        </p>
      </div>

      <div className="space-y-6 p-4 sm:p-5">
        {groups.map((group) => (
          <div key={group.dayKey}>
            <h3 className="flex items-center gap-2 border-b border-zinc-800/80 pb-2 text-sm font-semibold text-zinc-200">
              <span aria-hidden className="text-base leading-none">
                📅
              </span>
              {group.dayLabel}
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {group.items.map((row) => (
                <FuelAbastecimentoCard key={row.id ?? row.source_id} row={row} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default memo(FuelAbastecimentosList);
