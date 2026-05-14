import { memo } from "react";
import { formatRecordedAt, typeLabelMap } from "../../../../utils/managerRecordsOperational";

const cx = "border border-zinc-700 bg-zinc-950/80 text-zinc-100";

function cell(label, value) {
  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-2 border-b border-zinc-800/90 px-2 py-1.5 text-xs last:border-b-0">
      <span className="font-semibold text-zinc-500">{label}</span>
      <span className="tabular-nums text-zinc-200">{value ?? "—"}</span>
    </div>
  );
}

function RomaneioFicha({ row }) {
  return (
    <article className={`${cx} overflow-hidden rounded-lg`}>
      <header className="border-b border-zinc-700 bg-zinc-900/90 px-3 py-2 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-300">Controlo diário de transporte</p>
        <p className="text-[10px] text-zinc-500">{formatRecordedAt(row)}</p>
      </header>
      <div className="divide-y divide-zinc-800/80">
        {cell("Equipamento", row.veiculo)}
        {cell("Placa", row.placa)}
        {cell("Motorista", row.motorista)}
        {cell("Transporte", row.tipo_transporte)}
        {cell("Destino", row.destino)}
        {cell("Observação", row.observacao)}
      </div>
    </article>
  );
}

function CombustivelFicha({ row }) {
  const preco = row.preco_por_litro ?? row.preco_litro;
  const fmtMoney = (n) =>
    n == null || n === ""
      ? "—"
      : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
  const fmtL = (n) =>
    n == null || n === "" ? "—" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return (
    <article className={`${cx} overflow-hidden rounded-lg`}>
      <header className="border-b border-zinc-700 bg-zinc-900/90 px-3 py-2 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-200/90">Ficha de abastecimento</p>
        <p className="text-[10px] text-zinc-500">{formatRecordedAt(row)}</p>
      </header>
      <div className="divide-y divide-zinc-800/80">
        {cell("Motorista", row.motorista)}
        {cell("Veículo", row.veiculo)}
        {cell("Placa", row.placa)}
        {cell("Combustível", row.tipo_combustivel)}
        {cell("Litros (L)", fmtL(row.litros))}
        {cell("Valor total", fmtMoney(row.valor_total))}
        {cell("Preço / litro", fmtMoney(preco))}
        {cell("Horímetro", row.horimetro)}
        {cell("Hodômetro", row.hodometro)}
      </div>
    </article>
  );
}

function CheckCell({ ok }) {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-600 font-bold text-zinc-100">
      {ok ? "✕" : ""}
    </span>
  );
}

function ParteDiariaFicha({ row }) {
  let checklist = {};
  try {
    checklist = typeof row.checklist === "object" && row.checklist ? row.checklist : JSON.parse(row.checklist || "{}");
  } catch {
    checklist = {};
  }
  const pick = (...keys) => {
    for (const k of keys) {
      if (checklist[k] !== undefined) return checklist[k];
    }
    return "";
  };
  const items = [
    ["Motor", pick("motor")],
    ["Sistema hidráulico", pick("hidráulico", "hidraulico")],
    ["Freios", pick("freios")],
    ["Pneus / esteiras", pick("pneus", "pneus/esteiras")],
    ["Iluminação", pick("iluminação", "iluminacao")],
    ["Óleo / fluidos", pick("óleo", "oleo", "fluídos", "fluidos")],
    ["Combustível", pick("combustível", "combustivel")],
    ["Outros", pick("outros")],
  ];
  const clima = String(row.clima || "").toLowerCase();
  const periodo = String(row.periodo || "").toLowerCase();
  const pM = periodo.includes("manh");
  const pT = periodo.includes("tarde");
  const pN = periodo.includes("noite");

  return (
    <article className={`${cx} overflow-hidden rounded-lg`}>
      <header className="border-b border-zinc-700 bg-zinc-900/90 px-3 py-2 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wide text-sky-200/90">Parte diária de equipamento</p>
        <p className="text-[10px] text-zinc-500">{formatRecordedAt(row)}</p>
      </header>
      <div className="divide-y divide-zinc-800/80 px-2 py-2 text-xs">
        <div className="grid gap-1 pb-2 sm:grid-cols-2">
          {cell("Contratado", row.contratado)}
          {cell("Operador", row.operador || row.motorista)}
          {cell("Equipamento", row.equipamento || row.veiculo)}
          {cell("Placa", row.placa)}
          {cell("Marca / modelo", row.marca_modelo)}
          {cell("Local", row.local)}
          {cell("Expediente", row.expediente || row.periodo)}
        </div>
        <div className="py-2">
          <p className="mb-2 text-[10px] font-semibold uppercase text-zinc-500">Registo de tempo</p>
          <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
            <span />
            <span className="font-semibold text-zinc-400">Manhã</span>
            <span className="font-semibold text-zinc-400">Tarde</span>
            <span className="font-semibold text-zinc-400">Noite</span>
            <span className="text-left text-zinc-400">Bom</span>
            <CheckCell ok={clima === "bom" && pM} />
            <CheckCell ok={clima === "bom" && pT} />
            <CheckCell ok={clima === "bom" && pN} />
            <span className="text-left text-zinc-400">Chuva</span>
            <CheckCell ok={clima.includes("chuva") && pM} />
            <CheckCell ok={clima.includes("chuva") && pT} />
            <CheckCell ok={clima.includes("chuva") && pN} />
          </div>
        </div>
        <div className="grid gap-1 py-2 sm:grid-cols-2">
          {cell("Horímetro início", row.horimetro_inicio)}
          {cell("Horímetro fim", row.horimetro_fim)}
          {cell("Total horas", row.total_horas)}
          {cell("Hodômetro início", row.hodometro_inicio)}
          {cell("Hodômetro fim", row.hodometro_fim)}
          {cell("Total km", row.total_km)}
        </div>
        <div className="py-2">
          <p className="mb-2 text-[10px] font-semibold uppercase text-zinc-500">Checklist</p>
          <div className="grid gap-1">
            {items.map(([label, st]) => (
              <div key={label} className="flex items-center justify-between gap-2 border-b border-zinc-800/60 py-1 last:border-b-0">
                <span className="text-zinc-400">{label}</span>
                <div className="flex gap-3 text-[10px] text-zinc-500">
                  <span>OK {st === "ok" ? "✕" : ""}</span>
                  <span>Ajuste {st === "ajuste" ? "✕" : ""}</span>
                  <span>Não func. {st === "não_funcional" ? "✕" : ""}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-1 pt-1 text-[11px] text-zinc-300">
          <p>
            <span className="text-zinc-500">Parada:</span> {row.tempo_parado || "—"}
          </p>
          <p>
            <span className="text-zinc-500">Observações:</span> {row.observacoes || "—"}
          </p>
          <p>
            <span className="text-zinc-500">Produção:</span> {row.producao || "—"}
          </p>
        </div>
      </div>
    </article>
  );
}

function OperationalFichaPreview({ rows, tipoFiltro }) {
  const filtered = tipoFiltro ? rows.filter((r) => r.tipo === tipoFiltro) : rows;

  if (!filtered.length) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-8 text-center text-sm text-zinc-500">
        Sem registos para estes filtros. Ajuste o período ou o tipo de relatório.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Pré-visualização em formato de ficha (alinhada ao PDF). Mostra os mesmos registos da página (até 15). Para o ficheiro
        completo use Excel ou PDF.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((row) => {
          const key = `${row.tipo}-${row.id ?? row.source_id ?? ""}`;
          if (row.tipo === "combustivel") return <CombustivelFicha key={key} row={row} />;
          if (row.tipo === "parte_diaria") return <ParteDiariaFicha key={key} row={row} />;
          return <RomaneioFicha key={key} row={row} />;
        })}
      </div>
    </div>
  );
}

export default memo(OperationalFichaPreview);
export { typeLabelMap };
