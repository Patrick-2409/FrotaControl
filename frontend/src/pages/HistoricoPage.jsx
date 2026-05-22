import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { deleteHistoryItem } from "../services/syncService";
import { listHistory } from "../offline/offlineRepo";
import EmptyState from "../components/EmptyState";
import FormField, { inputClass } from "../components/FormField";
import { emitToast } from "../services/uiEvents";
import { parseDecimalInput } from "../utils/numberParse";

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

const dayKeyInOpsTz = (instant) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

const getFolderAnchorRaw = (row) =>
  row?.payload?.recorded_at_client || row?.updatedAt || row?.payload?.data;

const monthLabelPtBr = (monthKey) => {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return "Mês não informado";
  const date = new Date(`${monthKey}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return monthKey;
  const label = new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATION_TIMEZONE,
    month: "long",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const compactFuelCardData = (row) => {
  const payload = row?.payload || {};
  const litros = Number(payload?.litros || 0);
  const valorTotal = Number(payload?.valor_total || 0);
  return {
    dateLabel: formatInOperationalTimezone(payload?.data || payload?.recorded_at_client || row?.updatedAt),
    litros,
    valorTotal,
    valorLitro: litros > 0 ? valorTotal / litros : 0,
    vehicleLabel: payload?.veiculo_nome || payload?.equipamento || payload?.placa || "Não informado",
    plateLabel: payload?.placa || "",
  };
};

const newEditForm = () => ({
  data: "",
  litros: "",
  valor_total: "",
  tipo_combustivel: "Diesel",
  horimetro: "",
  hodometro: "",
  veiculo_id: "",
});

export default function HistoricoPage({ reloadKey }) {
  const [rows, setRows] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedVehicle, setSelectedVehicle] = useState("all");
  const [visibleMonths, setVisibleMonths] = useState(3);
  const [openMonthKey, setOpenMonthKey] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [editForm, setEditForm] = useState(newEditForm());
  const [editingLoading, setEditingLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [exporting, setExporting] = useState("");
  const loadMoreRef = useRef(null);
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
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const instant = parseOperationalInstant(getFolderAnchorRaw(row));
      const year = instant ? dayKeyInOpsTz(instant).slice(0, 4) : "";
      if (selectedYear !== "all" && year !== selectedYear) return false;
      if (selectedType !== "all" && row?.module !== selectedType) return false;
      if (selectedVehicle !== "all") {
        const payload = row?.payload || {};
        const vKey = payload?.veiculo_id ? `id:${payload.veiculo_id}` : `name:${String(payload?.veiculo_nome || payload?.placa || "").toLowerCase()}`;
        if (vKey !== selectedVehicle) return false;
      }
      return true;
    });
  }, [rows, selectedYear, selectedType, selectedVehicle]);

  const groupedByMonth = useMemo(() => {
    const map = new Map();
    for (const row of filteredRows) {
      const anchorRaw = getFolderAnchorRaw(row);
      const instant = parseOperationalInstant(anchorRaw);
      const dayKey = instant ? dayKeyInOpsTz(instant) : "sem-data";
      const monthKey = dayKey === "sem-data" ? "sem-data" : dayKey.slice(0, 7);
      if (!map.has(monthKey)) {
        map.set(monthKey, []);
      }
      map.get(monthKey).push(row);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([monthKey, monthRows]) => {
        const year = monthKey === "sem-data" ? "Sem ano" : monthKey.slice(0, 4);
        return {
          monthKey,
          year,
          monthLabel: monthKey === "sem-data" ? "Data não informada" : monthLabelPtBr(monthKey),
          items: monthRows,
        };
      });
  }, [filteredRows]);

  const visibleGroups = useMemo(() => groupedByMonth.slice(0, visibleMonths), [groupedByMonth, visibleMonths]);

  const yearOptions = useMemo(() => {
    const years = new Set();
    for (const row of rows) {
      const instant = parseOperationalInstant(getFolderAnchorRaw(row));
      if (!instant) continue;
      years.add(dayKeyInOpsTz(instant).slice(0, 4));
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const vehicleOptions = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const payload = row?.payload || {};
      const label = payload?.veiculo_nome || payload?.placa;
      if (!label) continue;
      const key = payload?.veiculo_id ? `id:${payload.veiculo_id}` : `name:${String(label).toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, payload?.placa ? `${label} | ${payload.placa}` : label);
      }
    }
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
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

  const toggleMonth = (monthKey) => {
    setOpenMonthKey((prev) => (prev === monthKey ? null : monthKey));
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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await api.get("/app/veiculos");
        if (!active) return;
        setVehicles(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (active) setVehicles([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setVisibleMonths(3);
  }, [selectedYear, selectedType, selectedVehicle]);

  useEffect(() => {
    if (!visibleGroups.length) {
      setOpenMonthKey(null);
      return;
    }
    if (!openMonthKey || !visibleGroups.some((group) => group.monthKey === openMonthKey)) {
      setOpenMonthKey(visibleGroups[0].monthKey);
    }
  }, [visibleGroups, openMonthKey]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        setVisibleMonths((prev) => Math.min(prev + 2, groupedByMonth.length));
      },
      { rootMargin: "240px 0px 240px 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [groupedByMonth.length]);

  const onDelete = async (row) => {
    const ok = window.confirm("Tem certeza que deseja excluir?");
    if (!ok) return;
    await deleteHistoryItem(row);
    setRows((prev) => prev.filter((item) => `${item?.module}:${item?.source_id}` !== `${row?.module}:${row?.source_id}`));
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

  const onEdit = (row) => {
    if (row?.module !== "combustiveis") {
      localStorage.setItem("fc_edit_record", JSON.stringify(row));
      const pathMap = {
        romaneios: "/app/romaneio",
        combustiveis: "/app/combustivel",
        parteDiaria: "/app/parte-diaria",
      };
      navigate(pathMap[row.module]);
      return;
    }
    const payload = row?.payload || {};
    setEditingRow(row);
    setEditForm({
      data: String(payload?.data || payload?.recorded_at_client || "").slice(0, 16),
      litros: String(payload?.litros ?? ""),
      valor_total: String(payload?.valor_total ?? ""),
      tipo_combustivel: payload?.tipo_combustivel || "Diesel",
      horimetro: String(payload?.horimetro ?? ""),
      hodometro: String(payload?.hodometro ?? ""),
      veiculo_id: payload?.veiculo_id ? String(payload.veiculo_id) : "",
    });
  };

  const submitFuelEdit = async (e) => {
    e.preventDefault();
    if (!editingRow?.source_id) return;
    const litros = parseDecimalInput(editForm.litros);
    const valorTotal = parseDecimalInput(editForm.valor_total);
    const veiculoId = Number(editForm.veiculo_id);
    if (!Number.isFinite(litros) || litros <= 0) {
      emitToast("Informe litros válidos para salvar a edição.", "warning");
      return;
    }
    if (!Number.isFinite(valorTotal) || valorTotal <= 0) {
      emitToast("Informe valor total válido para salvar a edição.", "warning");
      return;
    }
    if (!Number.isFinite(veiculoId) || veiculoId <= 0) {
      emitToast("Selecione um veículo válido.", "warning");
      return;
    }
    setEditingLoading(true);
    try {
      const payload = {
        data: editForm.data,
        veiculo_id: veiculoId,
        litros,
        valor_total: valorTotal,
        tipo_combustivel: String(editForm.tipo_combustivel || "Diesel").trim() || "Diesel",
        ...(String(editForm.horimetro || "").trim() ? { horimetro: Number(editForm.horimetro) } : {}),
        ...(String(editForm.hodometro || "").trim() ? { hodometro: Number(editForm.hodometro) } : {}),
      };
      await api.put(`/app/abastecimentos/${encodeURIComponent(editingRow.source_id)}`, payload);
      setRows((prev) =>
        prev.map((row) =>
          `${row?.module}:${row?.source_id}` === `${editingRow.module}:${editingRow.source_id}`
            ? {
                ...row,
                status: "synced",
                updatedAt: new Date().toISOString(),
                payload: {
                  ...(row?.payload || {}),
                  ...payload,
                },
              }
            : row
        )
      );
      setEditingRow(null);
      emitToast("Abastecimento atualizado com sucesso.", "success");
    } catch (err) {
      emitToast(err?.response?.data?.message || "Não foi possível salvar as alterações.", "error");
    } finally {
      setEditingLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <section className="fc-card rounded-2xl border border-slate-800/90 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <FormField label="Ano">
            <select className={inputClass} value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
              <option value="all">Todos os anos</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Tipo">
            <select className={inputClass} value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
              <option value="all">Todos os tipos</option>
              <option value="combustiveis">Combustível</option>
              <option value="romaneios">Transporte</option>
              <option value="parteDiaria">Parte diária</option>
            </select>
          </FormField>
          <FormField label="Veículo">
            <select className={inputClass} value={selectedVehicle} onChange={(e) => setSelectedVehicle(e.target.value)}>
              <option value="all">Todos os veículos</option>
              {vehicleOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </FormField>
        </div>
      </section>

      {visibleGroups.map((group, idx) => (
        <section key={group.monthKey} className="fc-card rounded-2xl border border-slate-800/90 p-3 sm:p-4">
          {(idx === 0 || visibleGroups[idx - 1]?.year !== group.year) && (
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">{group.year}</p>
          )}
          <button
            type="button"
            onClick={() => toggleMonth(group.monthKey)}
            className="mb-3 flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-left transition hover:border-blue-500/40"
          >
            <p className="truncate text-sm font-semibold capitalize text-slate-100">
              📁 {group.monthLabel}
            </p>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-2 py-1 text-xs font-semibold text-blue-100">
                {group.items.length} registro(s)
              </span>
              <span className="text-xs text-slate-300">
                {openMonthKey === group.monthKey ? "Ocultar" : "Abrir"}
              </span>
            </div>
          </button>

          <div
            className={`overflow-hidden transition-all duration-300 ${
              openMonthKey === group.monthKey ? "max-h-[4000px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="space-y-3 border-l-2 border-slate-800 pl-3 sm:pl-4">
              {group.items.map((row, idx) => {
                const statusMeta = getStatusMeta(row.status);
                const fuelCompact = row.module === "combustiveis" ? compactFuelCardData(row) : null;
                return (
                  <article
                    key={`${group.monthKey}-${row.module}-${row.source_id || idx}`}
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
                      {fuelCompact ? (
                        <>
                          <p><strong>Data e hora:</strong> {fuelCompact.dateLabel}</p>
                          <p><strong>Litros:</strong> {fuelCompact.litros.toFixed(2)} L</p>
                          <p><strong>Valor total:</strong> {fuelCompact.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                          <p><strong>Valor/L:</strong> {fuelCompact.valorLitro.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                          <p><strong>Veículo:</strong> {fuelCompact.vehicleLabel}{fuelCompact.plateLabel ? ` | ${fuelCompact.plateLabel}` : ""}</p>
                        </>
                      ) : (
                        <>
                          <p><strong>Data:</strong> {formatRowDate(row)}</p>
                          <p><strong>Registrado em:</strong> {formatRegisteredAt(row)}</p>
                          <p><strong>Veículo:</strong> {row.payload?.veiculo_nome || row.payload?.equipamento || row.payload?.placa || "Não informado"}</p>
                        </>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
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
                        onClick={() => onEdit(row)}
                        className="fc-btn btn-primary rounded-lg px-4 py-2 text-sm"
                      >
                        Editar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ))}
      {filteredRows.length === 0 && (
        <EmptyState
          title="Sem registros locais"
          description="Quando voce salvar operacoes no app, elas aparecem aqui para acompanhamento."
        />
      )}
      {visibleGroups.length < groupedByMonth.length ? (
        <div ref={loadMoreRef} className="py-2 text-center text-xs text-slate-400">
          Carregando meses anteriores...
        </div>
      ) : null}

      {editingRow?.module === "combustiveis" && (
        <div className="fixed inset-0 z-50 grid overflow-y-auto bg-slate-950/70 p-4 sm:place-content-center">
          <div className="fc-card w-full max-w-xl rounded-2xl border border-slate-800 p-4">
            <h3 className="text-base font-semibold text-white">Editar abastecimento</h3>
            <form onSubmit={submitFuelEdit} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormField label="Data"><input type="datetime-local" className={inputClass} value={editForm.data} onChange={(e) => setEditForm((prev) => ({ ...prev, data: e.target.value }))} /></FormField>
              <FormField label="Tipo combustível">
                <select className={inputClass} value={editForm.tipo_combustivel} onChange={(e) => setEditForm((prev) => ({ ...prev, tipo_combustivel: e.target.value }))}>
                  <option>Diesel</option>
                  <option>Gasolina</option>
                  <option>Etanol</option>
                </select>
              </FormField>
              <FormField label="Veículo">
                <select className={inputClass} value={editForm.veiculo_id} onChange={(e) => setEditForm((prev) => ({ ...prev, veiculo_id: e.target.value }))}>
                  <option value="">Selecione um veículo</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>{vehicle.nome} - {vehicle.placa || "Sem placa"}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Quantidade (L)"><input type="number" min="0" step="0.01" className={inputClass} value={editForm.litros} onChange={(e) => setEditForm((prev) => ({ ...prev, litros: e.target.value }))} /></FormField>
              <FormField label="Valor total (R$)"><input type="number" min="0" step="0.01" className={inputClass} value={editForm.valor_total} onChange={(e) => setEditForm((prev) => ({ ...prev, valor_total: e.target.value }))} /></FormField>
              <FormField label="Horímetro"><input className={inputClass} value={editForm.horimetro} onChange={(e) => setEditForm((prev) => ({ ...prev, horimetro: e.target.value }))} /></FormField>
              <FormField label="Hodômetro"><input className={inputClass} value={editForm.hodometro} onChange={(e) => setEditForm((prev) => ({ ...prev, hodometro: e.target.value }))} /></FormField>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingRow(null)} className="fc-btn btn-secondary rounded-lg px-3 py-2 text-sm">Cancelar</button>
                <button type="submit" disabled={editingLoading} className="fc-btn btn-primary rounded-lg px-3 py-2 text-sm">{editingLoading ? "Salvando..." : "Salvar alterações"}</button>
              </div>
            </form>
          </div>
        </div>
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
