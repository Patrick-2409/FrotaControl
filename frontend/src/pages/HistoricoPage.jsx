import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { deleteHistoryItem } from "../services/syncService";
import { listHistory } from "../offline/offlineRepo";
import EmptyState from "../components/EmptyState";

const OPERATION_TIMEZONE = "America/Sao_Paulo";

/** Instantâneo válido ou null (mesma regra de interpretação de string que os campos de data da tela). */
const parseOperationalInstant = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
  const candidate = hasTimezone ? normalized : `${normalized}-03:00`;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatInOperationalTimezone = (value) => {
  const parsed = parseOperationalInstant(value);
  if (!parsed) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATION_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
};

/** Dia civil em SP para agrupar pastas pelo momento em que o informativo foi gerado (não pela data operacional do formulário). */
const calendarDayKeyInOpsTz = (instant) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

const folderDayLabelFromInstant = (instant) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATION_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(instant);

const getFolderAnchorRaw = (row) =>
  row?.payload?.recorded_at_client || row?.updatedAt || row?.payload?.data;

export default function HistoricoPage({ reloadKey }) {
  const [rows, setRows] = useState([]);
  const [openDays, setOpenDays] = useState({});
  const [selectedRow, setSelectedRow] = useState(null);
  const [exporting, setExporting] = useState("");
  const navigate = useNavigate();
  const typeMeta = {
    romaneios: { label: "Romaneio", badge: "bg-blue-500/20 text-blue-200 border-blue-400/40", icon: "🚛" },
    combustiveis: { label: "Combustível", badge: "bg-emerald-500/20 text-emerald-200 border-emerald-400/40", icon: "⛽" },
    parteDiaria: { label: "Parte diária", badge: "bg-amber-500/20 text-amber-100 border-amber-300/40", icon: "🏗️" },
  };

  const mergeHistory = (remoteRows, localRows) => {
    const merged = new Map();
    for (const row of remoteRows || []) {
      if (!row?.source_id || !row?.module) continue;
      merged.set(`${row.module}:${row.source_id}`, row);
    }
    for (const row of localRows || []) {
      if (!row?.source_id || !row?.module) continue;
      // O estado local prevalece para preservar pendentes/syncing.
      merged.set(`${row.module}:${row.source_id}`, row);
    }
    return Array.from(merged.values()).sort((a, b) =>
      String(a?.updatedAt || "").localeCompare(String(b?.updatedAt || ""), undefined, { numeric: true })
    ).reverse();
  };
  const fetchRows = useCallback(async () => {
    const localRows = await listHistory();
    try {
      const { data } = await api.get("/app/historico");
      const remoteRows = Array.isArray(data?.items) ? data.items : [];
      return mergeHistory(remoteRows, localRows);
    } catch {
      // Sem rede ou backend indisponível: mantém histórico local.
    }
    return localRows;
  }, []);
  const groupedByDay = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const anchorRaw = getFolderAnchorRaw(row);
      const instant = parseOperationalInstant(anchorRaw);
      const dayKey = instant ? calendarDayKeyInOpsTz(instant) : "sem-data";
      if (!map.has(dayKey)) {
        map.set(dayKey, []);
      }
      map.get(dayKey).push(row);
    }

    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dayKey, dayRows]) => {
        const sampleInstant = parseOperationalInstant(getFolderAnchorRaw(dayRows[0]));
        return {
          dayKey,
          dayLabel:
            dayKey === "sem-data" || !sampleInstant
              ? "Data não informada"
              : folderDayLabelFromInstant(sampleInstant),
          items: dayRows,
        };
      });
  }, [rows]);
  const getStatusMeta = (status) => {
    if (status === "synced" || status === "sincronizado") {
      return { label: "🟢 sincronizado", className: "bg-emerald-600/30 text-emerald-300" };
    }
    if (status === "syncing") {
      return { label: "🔄 enviando", className: "bg-sky-600/25 text-sky-200" };
    }
    if (status === "erro") {
      return { label: "🔴 erro", className: "bg-red-600/25 text-red-200" };
    }
    return { label: "🟡 pendente", className: "bg-amber-500/30 text-amber-100" };
  };

  const formatRowDate = (row) => {
    const raw = row?.payload?.data || row?.updatedAt;
    return formatInOperationalTimezone(raw);
  };
  const formatRegisteredAt = (row) => {
    const raw = row?.payload?.recorded_at_client || row?.updatedAt || row?.payload?.data;
    return formatInOperationalTimezone(raw);
  };

  const toggleDay = (dayKey) => {
    setOpenDays((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }));
  };

  useEffect(() => {
    let cancelled = false;
    fetchRows().then((items) => {
      if (!cancelled) {
        setRows(items);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchRows, reloadKey]);

  const onDelete = async (row) => {
    const ok = window.confirm("Tem certeza que deseja excluir?");
    if (!ok) return;
    await deleteHistoryItem(row);
    setRows(await fetchRows());
  };
  const exportTypeByModule = {
    romaneios: "romaneio",
    combustiveis: "combustivel",
    parteDiaria: "parte_diaria",
  };
  const normalizeTypeTag = (value) => String(value || "atividade").replaceAll("_", "-");
  const formatDateForFilename = (isoDate) => {
    const raw = String(isoDate || "").trim();
    if (!raw) return "sem-data";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [yyyy, mm, dd] = raw.split("-");
      return `${dd}-${mm}-${yyyy}`;
    }
    return raw.replace(/[/:]/g, "-");
  };
  const exportSingle = async (format, row) => {
    const exportingKey = `${format}:${row?.source_id || "item"}`;
    setExporting(exportingKey);
    try {
      const tipo = exportTypeByModule[row?.module];
      if (!tipo || !row?.source_id) {
        throw new Error("Não foi possível identificar o registro para exportação.");
      }
      const { data } = await api.get(`/app/export/${format}`, {
        responseType: "blob",
        params: {
          tipo,
          source_id: row.source_id,
        },
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      const dateSource = row?.payload?.data || row?.payload?.recorded_at_client || row?.updatedAt || "";
      const day = String(dateSource).slice(0, 10);
      const suffix = formatDateForFilename(day);
      const activityTag = normalizeTypeTag(tipo);
      a.download = format === "excel" ? `relatorio_${activityTag}_${suffix}.xlsx` : `relatorio_${activityTag}_${suffix}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || `Falha ao gerar ${format.toUpperCase()}.`;
      window.dispatchEvent(new CustomEvent("fc:toast", { detail: { message, type: "error" } }));
    } finally {
      setExporting("");
    }
  };
  const renderPayloadDetails = (row) => {
    const payload = row?.payload || {};
    const entries = Object.entries(payload)
      .filter(([key]) => !["source_id", "client_id"].includes(key))
      .map(([key, value]) => ({
        key,
        value:
          value && typeof value === "object"
            ? JSON.stringify(value, null, 2)
            : String(value ?? "-"),
      }));
    return (
      <div className="mt-3 grid gap-2 text-sm text-slate-300">
        {entries.map((item) => (
          <div key={item.key} className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{item.key.replaceAll("_", " ")}</p>
            <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm text-slate-200">{item.value}</pre>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {groupedByDay.map((group) => (
        <section key={group.dayKey} className="fc-card rounded-2xl border border-slate-800/90 p-3 sm:p-4">
          <button
            type="button"
            onClick={() => toggleDay(group.dayKey)}
            className="mb-3 flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-left transition hover:border-blue-500/40"
          >
            <p className="truncate text-sm font-semibold capitalize text-slate-100">
              📁 {group.dayLabel}
            </p>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-2 py-1 text-xs font-semibold text-blue-100">
                {group.items.length} registro(s)
              </span>
              <span className="text-xs text-slate-300">
                {openDays[group.dayKey] ? "Ocultar" : "Abrir"}
              </span>
            </div>
          </button>

          {openDays[group.dayKey] && (
            <div className="space-y-3 border-l-2 border-slate-800 pl-3 sm:pl-4">
              {group.items.map((row, idx) => {
                const statusMeta = getStatusMeta(row.status);
                return (
                  <article
                    key={`${group.dayKey}-${row.module}-${row.source_id || idx}`}
                    className="rounded-xl border border-slate-800 bg-slate-950/55 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{typeMeta[row.module]?.icon || "📄"}</span>
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-semibold ${typeMeta[row.module]?.badge || "border-slate-700 bg-slate-800 text-slate-200"}`}
                        >
                          {typeMeta[row.module]?.label || row.module}
                        </span>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                    <div className="grid gap-1 text-sm text-slate-300">
                      <p>
                        <strong>Data:</strong> {formatRowDate(row)}
                      </p>
                      <p>
                        <strong>Registrado em:</strong> {formatRegisteredAt(row)}
                      </p>
                      <p>
                        <strong>Veículo:</strong>{" "}
                        {row.payload?.veiculo_nome || row.payload?.equipamento || row.payload?.placa || "Não informado"}
                      </p>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setSelectedRow(row)}
                        className="fc-btn btn-secondary rounded-lg px-4 py-2 text-sm"
                      >
                        Visualizar
                      </button>
                      <button
                        onClick={() => onDelete(row)}
                        className="fc-btn rounded-lg border border-red-600/70 bg-red-900/20 px-4 py-2 text-sm text-red-200"
                      >
                        Excluir
                      </button>
                      <button
                        onClick={() => {
                          localStorage.setItem("fc_edit_record", JSON.stringify(row));
                          const pathMap = {
                            romaneios: "/app/romaneio",
                            combustiveis: "/app/combustivel",
                            parteDiaria: "/app/parte-diaria",
                          };
                          navigate(pathMap[row.module]);
                        }}
                        className="fc-btn btn-primary rounded-lg px-4 py-2 text-sm"
                      >
                        Editar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ))}
      {rows.length === 0 && (
        <EmptyState
          title="Sem registros locais"
          description="Quando voce salvar operacoes no app, elas aparecem aqui para acompanhamento."
        />
      )}
      {selectedRow && (
        <div className="fixed inset-0 z-50 grid overflow-y-auto bg-slate-950/70 p-4 sm:place-content-center">
          <div className="fc-card w-full max-w-2xl rounded-2xl border border-slate-800 p-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-white">
                {typeMeta[selectedRow.module]?.icon || "📄"} {typeMeta[selectedRow.module]?.label || "Registro"}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="fc-btn btn-secondary rounded-lg px-3 py-1.5 text-xs"
              >
                Fechar
              </button>
            </div>
            <div className="mt-3 grid gap-1 text-sm text-slate-300">
              <p><strong>Data:</strong> {formatRowDate(selectedRow)}</p>
              <p><strong>Registrado em:</strong> {formatRegisteredAt(selectedRow)}</p>
              <p><strong>Status:</strong> {getStatusMeta(selectedRow.status).label}</p>
            </div>
            {renderPayloadDetails(selectedRow)}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => exportSingle("pdf", selectedRow)}
                className="fc-btn btn-secondary rounded-lg px-3 py-2 text-sm"
              >
                {exporting === `pdf:${selectedRow?.source_id || "item"}` ? "Gerando PDF..." : "Exportar PDF"}
              </button>
              <button
                type="button"
                onClick={() => exportSingle("excel", selectedRow)}
                className="fc-btn btn-secondary rounded-lg px-3 py-2 text-sm"
              >
                {exporting === `excel:${selectedRow?.source_id || "item"}` ? "Gerando Excel..." : "Exportar Excel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
