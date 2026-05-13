import { formatOperationalDateTime, fmtHorimetroPair } from "./parteDiariaFormatters";

export default function ParteDiariaRecordsTable({ rows }) {
  if (!rows.length) return null;

  return (
    <section aria-labelledby="pd-registros-title" className="fc-card overflow-hidden border-slate-700/80 p-0">
      <div className="border-b border-slate-800 bg-slate-900/80 px-5 py-4">
        <h2 id="pd-registros-title" className="text-lg font-semibold text-white">
          Registros
        </h2>
        <p className="mt-1 text-sm text-slate-400">Linhas retornadas pela API para o filtro atual (ordenadas por data).</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-slate-950/90 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-900/40">
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-300">
                  {formatOperationalDateTime(r.data)}
                </td>
                <td className="max-w-[160px] truncate px-4 py-2.5">{r.motorista || "—"}</td>
                <td className="max-w-[140px] truncate px-4 py-2.5">{r.equipamento || "—"}</td>
                <td className="max-w-[140px] truncate px-4 py-2.5">{r.local || "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-300">
                  {fmtHorimetroPair(r.horimetro_inicio, r.horimetro_fim)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{r.total_horas ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-slate-400">{r.checklist_resumo || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
