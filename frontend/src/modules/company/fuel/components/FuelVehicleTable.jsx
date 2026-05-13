import { memo } from "react";
import { fmtBRL, fmtLitros, veiculoCombustivelLabel } from "../services/fuelFormatters";

function FuelVehicleTable({ rows }) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-zinc-100">Ranking por veículo</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Ordenado pelo maior volume de litros. Coluna R$/L = preço médio no período.
      </p>
      <div className="mt-4 max-h-[min(28rem,60vh)] overflow-auto rounded-md border border-zinc-800">
        <table className="w-full min-w-[420px] text-left text-sm text-zinc-300">
          <thead className="sticky top-0 z-[1] bg-zinc-950/95 backdrop-blur-sm">
            <tr className="border-b border-zinc-800 text-xs font-medium uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2.5">Veículo</th>
              <th className="px-3 py-2.5">Litros</th>
              <th className="px-3 py-2.5">Valor</th>
              <th className="px-3 py-2.5">R$/L</th>
            </tr>
          </thead>
          <tbody>
            {rows?.length ? (
              rows.map((row) => (
                <tr key={`cv-${row.veiculo_id ?? "x"}`} className="border-b border-zinc-900 last:border-b-0">
                  <td className="px-3 py-2.5 font-medium text-zinc-100">{veiculoCombustivelLabel(row)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmtLitros(row.total_litros)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmtBRL(row.total_valor)}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {row.preco_medio_litro != null && Number.isFinite(Number(row.preco_medio_litro))
                      ? fmtBRL(row.preco_medio_litro)
                      : "—"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-zinc-500">
                  Nenhum abastecimento por veículo no período e filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(FuelVehicleTable);
