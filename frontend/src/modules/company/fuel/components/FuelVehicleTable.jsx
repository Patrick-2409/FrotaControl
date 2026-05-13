import { fmtBRL, fmtLitros, veiculoCombustivelLabel } from "../services/fuelFormatters";

export default function FuelVehicleTable({ rows }) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-white">Ranking por veículo</h3>
      <p className="mt-1 text-xs text-slate-500">
        Ordenado pelo maior volume de litros. Coluna R$/L = preço médio no período.
      </p>
      <div className="mt-3 max-h-[min(28rem,60vh)] overflow-auto rounded-lg border border-slate-700/80">
        <table className="w-full min-w-[420px] text-left text-sm text-slate-200">
          <thead className="sticky top-0 z-[1] bg-slate-950/95 backdrop-blur-sm">
            <tr className="border-b border-slate-700 text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2.5">Veículo</th>
              <th className="px-3 py-2.5">Litros</th>
              <th className="px-3 py-2.5">Valor</th>
              <th className="px-3 py-2.5">R$/L</th>
            </tr>
          </thead>
          <tbody>
            {rows?.length ? (
              rows.map((row) => (
                <tr key={`cv-${row.veiculo_id ?? "x"}`} className="border-b border-slate-800/90 last:border-b-0">
                  <td className="px-3 py-2.5 font-medium text-slate-100">{veiculoCombustivelLabel(row)}</td>
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
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
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
