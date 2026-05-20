import { memo, useMemo } from "react";
import { parseOperationalDate, typeLabelMap } from "../../../../utils/managerRecordsOperational";

const TZ = "America/Sao_Paulo";

const sheet = "fc-prev-sheet border border-zinc-600 bg-zinc-950 text-zinc-100 text-[11px] leading-snug";
const formTable = "fc-prev-form-table w-full border-collapse [&_td]:border [&_td]:border-zinc-600 [&_td]:px-1.5 [&_td]:py-1 [&_td]:align-top";
const gridTable = "fc-prev-grid-table w-full border-collapse [&_th]:border [&_th]:border-zinc-600 [&_th]:bg-zinc-900 [&_th]:px-1 [&_th]:py-1 [&_th]:text-center [&_th]:text-[10px] [&_th]:font-semibold [&_td]:border [&_td]:border-zinc-600 [&_td]:px-1 [&_td]:py-1";
const h4 = "mt-3 mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-300";

function getEff(row) {
  return row?.data || row?.recorded_at_client;
}

/** Igual ao `asDate` do exportController (só data civil em America/Sao_Paulo). */
function asDateOperational(value) {
  const raw = value;
  const normalized = raw && !String(raw).includes("T") ? String(raw).replace(" ", "T") : raw;
  const parsed = parseOperationalDate(normalized);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

/** Igual ao `asDateTime` do exportController. */
function asDateTimeOperational(value) {
  const raw = value;
  const normalized = raw && !String(raw).includes("T") ? String(raw).replace(" ", "T") : raw;
  const parsed = parseOperationalDate(normalized);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
}

function asYmdSp(value) {
  const p = parseOperationalDate(value && !String(value).includes("T") ? String(value).replace(" ", "T") : value);
  if (!p) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(p);
}

function classifyRomaneioTransport(tipoTransporte) {
  const s = String(tipoTransporte || "").toLowerCase();
  if (s.includes("estéril") || s.includes("esteril")) return "e";
  if (s.includes("amarração") || s.includes("amarracao")) return "ra";
  if (s.includes("pulmão") || s.includes("pulmao")) return "rp";
  return "";
}

function tripSortTs(row) {
  const raw = getEff(row);
  const normalized = raw && !String(raw).includes("T") ? String(raw).replace(" ", "T") : raw;
  const p = parseOperationalDate(normalized);
  return p && !Number.isNaN(p.getTime()) ? p.getTime() : 0;
}

/** Ordena romaneios: veículo+placa → motorista → data (igual requisito UX; depois `buildSheetEntriesFromRecords` mantém ordem da listagem). */
function prepareRowsForPreview(rows, tipoFiltro) {
  const base = tipoFiltro ? rows.filter((r) => r.tipo === tipoFiltro) : [...rows];
  const rom = base.filter((r) => r.tipo === "romaneio");
  const rest = base.filter((r) => r.tipo !== "romaneio");
  rom.sort((a, b) => {
    const va = `${String(a.veiculo || "").trim()}|${String(a.placa || "").trim()}`.toLowerCase();
    const vb = `${String(b.veiculo || "").trim()}|${String(b.placa || "").trim()}`.toLowerCase();
    if (va !== vb) return va.localeCompare(vb);
    const ma = String(a.motorista || "").trim().toLowerCase();
    const mb = String(b.motorista || "").trim().toLowerCase();
    if (ma !== mb) return ma.localeCompare(mb);
    return tripSortTs(a) - tripSortTs(b);
  });
  return [...rom, ...rest];
}

/** Mesma lógica que `buildSheetEntriesFromRecords` no exportController. */
function buildOperationalPreviewEntries(records) {
  const groupMap = new Map();
  for (const row of records) {
    if (row.tipo !== "romaneio") continue;
    const ymd = asYmdSp(getEff(row)) || "_";
    const vKey = `${String(row.veiculo || "").trim()}|${String(row.placa || "").trim()}`;
    const key = `${ymd}\t${vKey}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        kind: "romaneio_group",
        ymd,
        veiculo: row.veiculo,
        placa: row.placa,
        motorista: "",
        trips: [],
      });
    }
    const g = groupMap.get(key);
    g.trips.push(row);
    const m = row.motorista ? String(row.motorista).trim() : "";
    if (m) {
      if (!g.motorista) g.motorista = m;
      else if (!String(g.motorista).includes(m)) g.motorista = `${g.motorista} · ${m}`;
    }
  }
  for (const g of groupMap.values()) {
    g.trips.sort((a, b) => tripSortTs(a) - tripSortTs(b));
  }
  const merged = [];
  const romSeen = new Set();
  for (const row of records) {
    if (row.tipo !== "romaneio") {
      merged.push({ kind: "single", row });
      continue;
    }
    const ymd = asYmdSp(getEff(row)) || "_";
    const vKey = `${String(row.veiculo || "").trim()}|${String(row.placa || "").trim()}`;
    const key = `${ymd}\t${vKey}`;
    if (romSeen.has(key)) continue;
    romSeen.add(key);
    const grouped = groupMap.get(key);
    if (grouped) merged.push(grouped);
  }
  return merged;
}

/** Uma marca ✕ por célula — cada viagem (registo) ocupa uma coluna; no máximo um ✕ entre Estéril / Rocha amarração / Rocha pulmão (igual ao PDF). */
function TallyMark({ on }) {
  return <span className="inline-block min-h-[1.1rem] min-w-[1.1rem] text-center font-bold">{on ? "\u2715" : "\u00a0"}</span>;
}

function RomaneioGroupTable({ group }) {
  const nums = Array.from({ length: 10 }, (_, i) => (
    <th key={i} className="w-[7%] text-center text-[10px] font-semibold normal-case">
      {i + 1}
    </th>
  ));
  const colMarks = (code) => {
    const cells = [];
    for (let j = 0; j < 10; j += 1) {
      const trip = group.trips[j];
      const cls = classifyRomaneioTransport(trip?.tipo_transporte);
      const on = Boolean(trip && cls === code);
      cells.push(
        <td key={j} className="text-center align-middle">
          <TallyMark on={on} />
        </td>
      );
    }
    return cells;
  };
  const destinos = [...new Set(group.trips.map((t) => String(t.destino || "").trim()).filter(Boolean))].join(" · ");
  const obsExtras = group.trips.length > 10 ? ` Nota: ${group.trips.length} viagens no dia; colunas 1–10.` : "";
  const obsCombined = [...new Set(group.trips.map((t) => String(t.observacao || "").trim()).filter(Boolean))].join(" | ");
  const obsFinal = [obsCombined, obsExtras].filter(Boolean).join("") || "—";
  const first = group.trips[0];
  const reportDate = getEff(first);

  return (
    <article className={`${sheet} overflow-x-auto rounded-sm px-2 py-2 print:border-black`}>
      <div className="mb-2 flex flex-wrap items-start gap-3 border-b border-zinc-700 pb-2">
        <div className="h-14 w-24 shrink-0 rounded border border-dashed border-zinc-600 bg-zinc-900/50" aria-hidden title="Logotipo (no PDF)" />
        <div className="min-w-0 flex-1 text-center">
          <div className="border border-zinc-500 bg-zinc-900 px-2 py-1.5 text-[12px] font-bold uppercase tracking-wide text-zinc-100">
            CONTROLE DIÁRIO DE TRANSPORTE
          </div>
        </div>
      </div>

      <table className={formTable}>
        <tbody>
          <tr>
            <td className="w-[14%] font-bold">DATA:</td>
            <td colSpan={3}>{asDateOperational(reportDate)}</td>
          </tr>
        </tbody>
      </table>

      <table className={`${gridTable} mt-2 table-fixed`}>
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[10%]" />
          <col className="w-[16%]" />
          <col className="w-[7%]" />
          <col span={10} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} className="align-middle text-[10px]">
              Equipamento
            </th>
            <th rowSpan={2} className="align-middle text-[10px]">
              Placa
            </th>
            <th rowSpan={2} className="align-middle text-[10px]">
              Motorista
            </th>
            <th colSpan={11} className="text-center text-[10px]">
              Transporte (1 viagem por coluna)
            </th>
          </tr>
          <tr>
            <th className="w-[7%] p-0" />
            {nums}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td rowSpan={4} className="align-top font-medium">
              {group.veiculo || "—"}
            </td>
            <td rowSpan={4} className="align-top">
              {group.placa || "—"}
            </td>
            <td rowSpan={4} className="align-top">
              {group.motorista || "—"}
            </td>
            <td className="whitespace-nowrap text-[10px] font-bold">Estéril</td>
            {colMarks("e")}
          </tr>
          <tr>
            <td className="whitespace-nowrap text-[10px] font-bold">Rocha (amarração)</td>
            {colMarks("ra")}
          </tr>
          <tr>
            <td className="whitespace-nowrap text-[10px] font-bold">Rocha (pulmão)</td>
            {colMarks("rp")}
          </tr>
          <tr>
            <td className="whitespace-nowrap text-[10px] font-bold">Destinação</td>
            <td colSpan={10} className="text-left">
              {destinos || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <table className={`${formTable} mt-2`}>
        <tbody>
          <tr>
            <td className="w-[18%] font-bold">Observação</td>
            <td colSpan={3}>{obsFinal}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-1 text-[10px] text-zinc-500">Legenda: Site (ST) / Depósito de Rochas (DP) / Vias de Acesso (VA)</p>

      <div className="mt-3 border border-zinc-600 bg-zinc-900 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-zinc-300">
        Assinaturas
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-4 text-[10px] text-zinc-400">
        <div>Apontador: ________________________________</div>
        <div>Responsável: ________________________________</div>
      </div>
    </article>
  );
}

function fmtMoneyBr(n) {
  if (n === undefined || n === null || n === "") return "—";
  const x = Number(n);
  if (Number.isNaN(x)) return "—";
  return x.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtLitrosBr(n) {
  if (n === undefined || n === null || n === "") return "—";
  const x = Number(n);
  if (Number.isNaN(x)) return "—";
  return x.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function CombustivelFicha({ row, companyName }) {
  const reportDate = getEff(row);
  const preco = row.preco_por_litro ?? row.preco_litro;

  return (
    <article className={`${sheet} overflow-x-auto rounded-sm px-2 py-2`}>
      <div className="mb-2 flex flex-wrap items-start gap-3 border-b border-zinc-700 pb-2">
        <div className="h-14 w-24 shrink-0 rounded border border-dashed border-zinc-600 bg-zinc-900/50" aria-hidden />
        <div className="min-w-0 flex-1 text-center">
          <div className="border border-emerald-800/60 bg-emerald-950/40 px-2 py-1.5 text-[12px] font-bold uppercase tracking-wide text-emerald-100">
            FICHA DE ABASTECIMENTO
          </div>
          <p className="mt-1 text-[10px] text-zinc-500">Controle operacional — {asDateOperational(reportDate)}</p>
        </div>
      </div>

      <table className={formTable}>
        <tbody>
          <tr>
            <td className="font-bold">DATA</td>
            <td>{asDateOperational(reportDate)}</td>
            <td className="font-bold">HORÁRIO</td>
            <td>{asDateTimeOperational(reportDate)}</td>
          </tr>
          <tr>
            <td className="font-bold">MOTORISTA / OPERADOR</td>
            <td colSpan={3}>
              {row.motorista || "—"}
            </td>
          </tr>
          <tr>
            <td className="font-bold">EQUIPAMENTO</td>
            <td colSpan={3}>
              {row.veiculo || companyName || "—"}
            </td>
          </tr>
          <tr>
            <td className="font-bold">PLACA</td>
            <td>{row.placa || "—"}</td>
            <td className="font-bold">COMBUSTÍVEL</td>
            <td>{row.tipo_combustivel || "—"}</td>
          </tr>
        </tbody>
      </table>

      <h4 className={h4}>Valores do lançamento</h4>
      <table className={gridTable}>
        <thead>
          <tr>
            <th>Litros (L)</th>
            <th>Valor total (R$)</th>
            <th>Preço / litro (R$)</th>
            <th>Horímetro</th>
            <th>Hodômetro</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-center">{fmtLitrosBr(row.litros)}</td>
            <td className="text-center">{fmtMoneyBr(row.valor_total)}</td>
            <td className="text-center">{fmtMoneyBr(preco)}</td>
            <td className="text-center">{row.horimetro ?? "—"}</td>
            <td className="text-center">{row.hodometro ?? "—"}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3 border border-zinc-600 bg-zinc-900 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-zinc-300">
        Assinaturas
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-4 text-[10px] text-zinc-400">
        <div>Operador: ________________________________</div>
        <div>Responsável: ________________________________</div>
      </div>
    </article>
  );
}

function parseChecklist(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function ParteDiariaFicha({ row, companyName }) {
  const checklist = parseChecklist(row.checklist);
  const pick = (...keys) => {
    for (const k of keys) {
      if (checklist[k] !== undefined) return checklist[k];
    }
    return "";
  };
  const checklistRows = [
    ["Motor", pick("motor")],
    ["Sistema Hidráulico", pick("hidráulico", "hidraulico")],
    ["Freios", pick("freios")],
    ["Pneus/Esteiras", pick("pneus", "pneus/esteiras")],
    ["Iluminação e Sinalização", pick("iluminação", "iluminacao")],
    ["Nível de Óleo e Fluídos", pick("óleo", "oleo", "fluídos", "fluidos")],
    ["Combustível", pick("combustível", "combustivel")],
    ["Outros (especificar)", pick("outros")],
  ];
  const isBom = String(row.clima || "").toLowerCase() === "bom";
  const isChuva = String(row.clima || "").toLowerCase().includes("chuva");
  const period = String(row.periodo || "").toLowerCase();
  const pManha = period.includes("manh");
  const pTarde = period.includes("tarde");
  const pNoite = period.includes("noite");
  const reportDate = getEff(row);

  return (
    <article className={`${sheet} sheet-parte-diaria overflow-x-auto rounded-sm px-2 py-2`}>
      <div className="mb-2 flex flex-wrap items-start gap-3 border-b border-zinc-700 pb-2">
        <div className="h-14 w-24 shrink-0 rounded border border-dashed border-zinc-600 bg-zinc-900/50" aria-hidden />
        <div className="min-w-0 flex-1 text-center">
          <div className="border border-sky-800/50 bg-sky-950/30 px-2 py-1.5 text-[12px] font-bold uppercase tracking-wide text-sky-100">
            PARTE DIÁRIA DE EQUIPAMENTO
          </div>
          <p className="mt-1 text-[10px] text-zinc-500">
            Atividade principal: PARTE DIÁRIA | Data executada: {asDateOperational(reportDate)}
          </p>
        </div>
      </div>

      <table className={formTable}>
        <tbody>
          <tr>
            <td className="font-bold">CONTRATADO:</td>
            <td>{row.contratado || companyName || "—"}</td>
            <td className="font-bold">DATA:</td>
            <td>{asDateOperational(reportDate)}</td>
          </tr>
          <tr>
            <td className="font-bold">OPERADOR:</td>
            <td>{row.operador || row.motorista || "—"}</td>
            <td className="font-bold">EQUIPAMENTO:</td>
            <td>{row.equipamento || row.veiculo || "—"}</td>
          </tr>
          <tr>
            <td className="font-bold">PLACA:</td>
            <td>{row.placa || "—"}</td>
            <td className="font-bold">MARCA/MODELO:</td>
            <td>{row.marca_modelo || "—"}</td>
          </tr>
          <tr>
            <td className="font-bold">LOCAL DE OPERAÇÃO:</td>
            <td colSpan={3}>
              {row.local || "—"}
            </td>
          </tr>
          <tr>
            <td className="font-bold">EXPEDIENTE:</td>
            <td colSpan={3}>
              {row.expediente || row.periodo || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <h4 className={h4}>Registro de tempo</h4>
      <table className={gridTable}>
        <thead>
          <tr>
            <th>Período</th>
            <th>Manhã</th>
            <th>Tarde</th>
            <th>Noite</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Bom</td>
            <td className="text-center">
              <TallyMark on={isBom && pManha} />
            </td>
            <td className="text-center">
              <TallyMark on={isBom && pTarde} />
            </td>
            <td className="text-center">
              <TallyMark on={isBom && pNoite} />
            </td>
          </tr>
          <tr>
            <td>Chuva</td>
            <td className="text-center">
              <TallyMark on={isChuva && pManha} />
            </td>
            <td className="text-center">
              <TallyMark on={isChuva && pTarde} />
            </td>
            <td className="text-center">
              <TallyMark on={isChuva && pNoite} />
            </td>
          </tr>
        </tbody>
      </table>

      <h4 className={h4}>Registro de horas</h4>
      <table className={formTable}>
        <tbody>
          <tr>
            <td>Horímetro Início</td>
            <td>
              {row.horimetro_inicio ?? "—"} hrs
            </td>
            <td>Horímetro Término</td>
            <td>
              {row.horimetro_fim ?? "—"} hrs
            </td>
          </tr>
          <tr>
            <td>Total de Horas</td>
            <td>
              {row.total_horas ?? "—"} hrs
            </td>
            <td>Hodômetro Início</td>
            <td>
              {row.hodometro_inicio ?? "—"} km
            </td>
          </tr>
          <tr>
            <td>Hodômetro Término</td>
            <td>
              {row.hodometro_fim ?? "—"} km
            </td>
            <td>Total de Quilômetros</td>
            <td>
              {row.total_km ?? "—"} km
            </td>
          </tr>
        </tbody>
      </table>

      <h4 className={h4}>Checklist</h4>
      <table className={gridTable}>
        <thead>
          <tr>
            <th className="text-left">Item</th>
            <th>OK</th>
            <th>Ajuste necessário</th>
            <th>Não funcional</th>
          </tr>
        </thead>
        <tbody>
          {checklistRows.map(([label, status]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className="text-center">
                <TallyMark on={status === "ok"} />
              </td>
              <td className="text-center">
                <TallyMark on={status === "ajuste"} />
              </td>
              <td className="text-center">
                <TallyMark on={status === "não_funcional"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className={h4}>Ocorrências</h4>
      <table className={`${formTable} [&_.fc-long]:min-h-[2.5rem] [&_.fc-long]:whitespace-pre-wrap`}>
        <tbody>
          <tr>
            <td className="w-[22%] align-top">Tempo de parada</td>
            <td colSpan={3} className="fc-long align-top">
              {row.tempo_parado || "—"}
            </td>
          </tr>
          <tr>
            <td className="align-top">Outros (checklist)</td>
            <td colSpan={3} className="fc-long align-top">
              {row.outros_descricao || "—"}
            </td>
          </tr>
          <tr>
            <td className="align-top">Observações</td>
            <td colSpan={3} className="fc-long align-top">
              {row.observacoes || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <h4 className={h4}>Produção</h4>
      <table className={formTable}>
        <tbody>
          <tr>
            <td colSpan={4} className="fc-long min-h-[2.5rem] whitespace-pre-wrap align-top">
              {row.producao || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap justify-between gap-4 text-[10px] text-zinc-400">
        <div>Operador: ________________________________</div>
        <div>Responsável: ________________________________</div>
      </div>
    </article>
  );
}

function OperationalFichaPreview({ rows, tipoFiltro, companyName = "" }) {
  const prepared = useMemo(() => prepareRowsForPreview(rows, tipoFiltro), [rows, tipoFiltro]);
  const entries = useMemo(() => buildOperationalPreviewEntries(prepared), [prepared]);

  if (!prepared.length) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-8 text-center text-sm text-zinc-500">
        Sem registros para estes filtros. Confirme o período e clique em «Filtrar».
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-500">
        Pré-visualização com a mesma grade e textos do PDF (modelo porto). Logotipo e margens finais apenas no arquivo exportado.
      </p>
      <div className="flex flex-col gap-6">
        {entries.map((entry, idx) => {
          if (entry.kind === "romaneio_group") {
            return <RomaneioGroupTable key={`rg-${entry.ymd}-${entry.placa}-${idx}`} group={entry} />;
          }
          const row = entry.row;
          const key = `${row.tipo}-${row.id ?? row.source_id ?? idx}`;
          if (row.tipo === "combustivel") return <CombustivelFicha key={key} row={row} companyName={companyName} />;
          if (row.tipo === "parte_diaria") return <ParteDiariaFicha key={key} row={row} companyName={companyName} />;
          if (row.tipo === "romaneio") {
            return (
              <RomaneioGroupTable
                key={key}
                group={{
                  kind: "romaneio_group",
                  ymd: asYmdSp(getEff(row)) || "_",
                  veiculo: row.veiculo,
                  placa: row.placa,
                  motorista: row.motorista || "",
                  trips: [row],
                }}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

export default memo(OperationalFichaPreview);
export { typeLabelMap };
