import { memo } from "react";
import { fmtHoras } from "../services/parteDiariaFormatters";
import TooltipInfo from "../../shared/components/TooltipInfo";

function statusBorder(st) {
  if (st === "atencao_checklist") return "border-amber-500/45 bg-amber-950/20";
  if (st === "ocorrencias_texto") return "border-rose-500/40 bg-rose-950/20";
  if (st === "regular") return "border-emerald-500/35 bg-emerald-950/15";
  return "border-zinc-700 bg-zinc-950/80";
}

function ParteDiariaResumoStrip({ total, mediaHorasNum, statusOperacional, amostra, snapshotLoading }) {
  const mediaLabel = mediaHorasNum != null && Number.isFinite(mediaHorasNum) ? fmtHoras(mediaHorasNum) : "—";

  return (
    <section
      className={`grid gap-4 rounded-2xl border-2 p-5 sm:grid-cols-3 sm:p-6 ${statusBorder(statusOperacional)}`}
      aria-label="Resumo da parte diária"
    >
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <span>Acumulado</span>
          <TooltipInfo text="Soma das produções registradas no período selecionado." />
        </p>
        <p className="mt-1 text-3xl font-black tabular-nums text-zinc-50 sm:text-4xl">{Number(total || 0).toLocaleString("pt-BR")}</p>
        <p className="mt-1 text-xs text-zinc-500">registros</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Média de horas</p>
        <p className="mt-1 text-3xl font-black tabular-nums text-zinc-50 sm:text-4xl">{mediaLabel}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {snapshotLoading ? "Calculando…" : `Amostra: ${amostra} reg.`}
        </p>
      </div>
      <div className="flex flex-col justify-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Estado</p>
        <p className="mt-2 text-lg font-semibold text-zinc-100">
          {statusOperacional === "atencao_checklist" && "Checklist a rever"}
          {statusOperacional === "ocorrencias_texto" && "Com ocorrências"}
          {statusOperacional === "regular" && "Sem alertas na página"}
          {statusOperacional === "sem_dados" && "Sem linhas nesta vista"}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
          <span>Tipo (estéril / rocha)</span>
          <TooltipInfo text="Classificação do material movimentado." />
        </p>
      </div>
    </section>
  );
}

export default memo(ParteDiariaResumoStrip);
