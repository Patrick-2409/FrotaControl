import { memo } from "react";
import { formatOperationalDateTime, fmtHorimetroPair } from "../services/parteDiariaFormatters";

function ParteDiariaRecordsTable({ rows }) {
  if (!rows.length) return null;

  return (
    <section aria-labelledby="pd-registros-title" className="fc-card overflow-hidden border-zinc-800/90 p-0">
      <div className="border-b border-zinc-800/90 bg-zinc-900/75 px-4 py-3.5 sm:px-5 sm:py-4">
        <h2 id="pd-registros-title" className="text-base font-semibold tracking-tight text-zinc-50 sm:text-lg">
          Registros
        </h2>
        <p className="mt-1 text-sm text-zinc-400">Lista do período e motorista escolhidos, da mais recente para a mais antiga.</p>
      </div>
      <div className="fc-erp-table-scroll overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-800/90 text-left text-sm">
          <thead className="bg-zinc-950/95 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">Data</th>
              <th className="whitespace-nowrap px-4 py-3">Motorista</th>
              <th className="whitespace-nowrap px-4 py-3">Equipamento</th>
              <th className="whitespace-nowrap px-4 py-3">Local</th>
              <th className="whitespace-nowrap px-4 py-3">Horímetro (ini → fim)</th>
              <th className="whitespace-nowrap px-4 py-3">Horas</th>
              <th className="min-w-[140px] px-4 py-3">Checklist</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-900/45">
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-300">
                  {formatOperationalDateTime(r.data)}
                </td>
                <td className="max-w-[160px] truncate px-4 py-2.5">{r.motorista || "—"}</td>
                <td className="max-w-[140px] truncate px-4 py-2.5">{r.equipamento || "—"}</td>
                <td className="max-w-[140px] truncate px-4 py-2.5">{r.local || "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-300">
                  {fmtHorimetroPair(r.horimetro_inicio, r.horimetro_fim)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{r.total_horas ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">{r.checklist_resumo || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default memo(ParteDiariaRecordsTable);
