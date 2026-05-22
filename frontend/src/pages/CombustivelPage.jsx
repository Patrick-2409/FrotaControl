import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../services/auth";
import FormField, { inputClass, primaryButtonClass } from "../components/FormField";
import { deleteHistoryItem, saveWithOffline } from "../services/syncService";
import { emitToast } from "../services/uiEvents";
import { generateId } from "../utils/id";
import api, { extractApiErrorMessage } from "../services/api";
import { nowLocalDateTimeString, toIsoWithCurrentTimeIfDateOnly } from "../utils/datetime";
import { parseDecimalInput } from "../utils/numberParse";
import { listHistory } from "../offline/offlineRepo";

const HISTORY_FILTERS = [
  { id: "dia", label: "Dia" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
];
const OPERATION_TIMEZONE = "America/Sao_Paulo";

const newEmptyForm = (defaultVehicleId) => ({
  data: nowLocalDateTimeString().slice(0, 16),
  litros: "",
  valor_total: "",
  tipo_combustivel: "Diesel",
  horimetro: "",
  hodometro: "",
  veiculo_id: defaultVehicleId || undefined,
});

const addDays = (ymd, delta) => {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

const toYmdInOperationTimezone = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const direct = String(value || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(direct) ? direct : "";
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
};

const getTodayInOperationTimezone = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const toHistoryYmd = (row) => {
  const payload = row?.payload || {};
  const raw = payload.data || payload.recorded_at_client || row?.updatedAt;
  return toYmdInOperationTimezone(raw);
};

const toRangeStartByFilter = (today, filter) => {
  if (filter === "dia") return today;
  if (filter === "semana") return addDays(today, -6);
  return `${today.slice(0, 7)}-01`;
};

const formatMoneyBr = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDateTimeBr = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Não informado";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sanitizeForm = (form) => {
  const litros = parseDecimalInput(form.litros);
  const valorTotal = parseDecimalInput(form.valor_total);
  const veiculoId = Number(form.veiculo_id);
  if (!Number.isFinite(veiculoId) || veiculoId <= 0) return { ok: false, message: "Selecione um veículo válido." };
  if (!Number.isFinite(litros) || litros <= 0) return { ok: false, message: "Informe litros maiores que zero." };
  if (!Number.isFinite(valorTotal) || valorTotal <= 0) return { ok: false, message: "Informe valor total maior que zero." };
  return {
    ok: true,
    payload: {
      data: toIsoWithCurrentTimeIfDateOnly(form.data),
      recorded_at_client: toIsoWithCurrentTimeIfDateOnly(form.data),
      veiculo_id: veiculoId,
      litros,
      valor_total: valorTotal,
      tipo_combustivel: String(form.tipo_combustivel || "Diesel").trim() || "Diesel",
      ...(String(form.horimetro || "").trim() ? { horimetro: Number(form.horimetro) } : {}),
      ...(String(form.hodometro || "").trim() ? { hodometro: Number(form.hodometro) } : {}),
    },
  };
};

export default function CombustivelPage({ onSaved }) {
  const { user } = useAuth();
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [fuelHistory, setFuelHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState("semana");
  const [createForm, setCreateForm] = useState(() => newEmptyForm(user?.veiculo_id));
  const [createLoading, setCreateLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(() => newEmptyForm(user?.veiculo_id));
  const [editLoading, setEditLoading] = useState(false);

  const vehicleOptions = useMemo(() => {
    const byId = new Map();
    const userVehicleId = Number(user?.veiculo_id);
    if (userVehicleId) {
      byId.set(userVehicleId, {
        id: userVehicleId,
        nome: user?.veiculo_nome || "Veículo vinculado",
        placa: user?.placa || "",
        marca: user?.veiculo_marca || "",
        modelo: user?.veiculo_modelo || "",
      });
    }
    for (const vehicle of Array.isArray(vehicles) ? vehicles : []) {
      const id = Number(vehicle.id);
      if (!id) continue;
      byId.set(id, vehicle);
    }
    return Array.from(byId.values());
  }, [vehicles, user?.veiculo_id, user?.veiculo_nome, user?.placa, user?.veiculo_marca, user?.veiculo_modelo]);

  const mergeHistory = useCallback((remoteRows, localRows) => {
    const merged = new Map();
    for (const row of remoteRows || []) {
      if (!row?.source_id || row?.module !== "combustiveis") continue;
      merged.set(`combustiveis:${row.source_id}`, row);
    }
    for (const row of localRows || []) {
      if (!row?.source_id || row?.module !== "combustiveis") continue;
      merged.set(`combustiveis:${row.source_id}`, row);
    }
    return Array.from(merged.values())
      .sort((a, b) => String(a?.updatedAt || "").localeCompare(String(b?.updatedAt || ""), undefined, { numeric: true }))
      .reverse();
  }, []);

  const refreshHistory = useCallback(async () => {
    const localRows = await listHistory();
    try {
      const { data } = await api.get("/app/historico");
      const remoteRows = Array.isArray(data?.items) ? data.items : [];
      setFuelHistory(mergeHistory(remoteRows, localRows));
    } catch {
      setFuelHistory(mergeHistory([], localRows));
    }
  }, [mergeHistory]);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const [{ data }] = await Promise.all([api.get("/app/veiculos"), refreshHistory()]);
        if (!active) return;
        setVehicles(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        if (!active) return;
        setError(extractApiErrorMessage(err) || "Erro ao carregar combustível.");
      } finally {
        if (active) {
          setVehiclesLoading(false);
          setInitializing(false);
        }
      }
    };
    boot();
    return () => {
      active = false;
    };
  }, [refreshHistory]);

  const fuelDashboard = useMemo(() => {
    const today = getTodayInOperationTimezone();
    const weekStart = addDays(today, -6);
    let totalDia = 0;
    let totalSemana = 0;
    let litrosMes = 0;
    let valorMes = 0;
    for (const row of fuelHistory) {
      const ymd = toHistoryYmd(row);
      if (!ymd || ymd > today) continue;
      const litros = Number(row?.payload?.litros || 0);
      const valor = Number(row?.payload?.valor_total || 0);
      if (ymd === today) totalDia += valor;
      if (ymd >= weekStart) totalSemana += valor;
      if (ymd.slice(0, 7) === today.slice(0, 7)) {
        litrosMes += litros;
        valorMes += valor;
      }
    }
    return {
      totalDia,
      totalSemana,
      mediaLitro: litrosMes > 0 ? valorMes / litrosMes : 0,
    };
  }, [fuelHistory]);

  const graphData = useMemo(() => {
    const today = getTodayInOperationTimezone();
    const start = addDays(today, -6);
    const labels = [];
    for (let cursor = start; cursor <= today; cursor = addDays(cursor, 1)) {
      labels.push(cursor);
    }
    const totals = new Map(labels.map((d) => [d, 0]));
    for (const row of fuelHistory) {
      const ymd = toHistoryYmd(row);
      if (!totals.has(ymd)) continue;
      totals.set(ymd, Number(totals.get(ymd) || 0) + Number(row?.payload?.valor_total || 0));
    }
    return labels.map((ymd) => ({ ymd, label: ymd.slice(8, 10), total: totals.get(ymd) || 0 }));
  }, [fuelHistory]);

  const filteredFuelHistory = useMemo(() => {
    const today = getTodayInOperationTimezone();
    const start = toRangeStartByFilter(today, historyFilter);
    return fuelHistory.filter((row) => {
      const ymd = toHistoryYmd(row);
      return ymd && ymd >= start && ymd <= today;
    });
  }, [fuelHistory, historyFilter]);

  const hydrateEditForm = useCallback(
    (record) => {
      const payload = record?.payload || {};
      setEditForm({
        data: String(payload.data || payload.recorded_at_client || nowLocalDateTimeString()).slice(0, 16),
        litros: String(payload.litros ?? ""),
        valor_total: String(payload.valor_total ?? ""),
        tipo_combustivel: payload.tipo_combustivel || "Diesel",
        horimetro: String(payload.horimetro ?? ""),
        hodometro: String(payload.hodometro ?? ""),
        veiculo_id: payload.veiculo_id ? Number(payload.veiculo_id) : user?.veiculo_id || undefined,
      });
    },
    [user?.veiculo_id]
  );

  useEffect(() => {
    const raw = localStorage.getItem("fc_edit_record");
    if (!raw) return;
    try {
      const record = JSON.parse(raw);
      if (record?.module === "combustiveis") {
        setEditingId(record?.source_id || null);
        setIsEditing(true);
        hydrateEditForm(record);
      }
    } finally {
      localStorage.removeItem("fc_edit_record");
    }
  }, [hydrateEditForm]);

  const submitCreate = async (e) => {
    e.preventDefault();
    const sanitized = sanitizeForm(createForm);
    if (!sanitized.ok) {
      emitToast(sanitized.message, "warning");
      return;
    }
    setCreateLoading(true);
    try {
      const sourceId = generateId();
      const payload = {
        source_id: sourceId,
        client_id: sourceId,
        ...sanitized.payload,
      };
      const result = await saveWithOffline("combustiveis", payload);
      if (result.status === "error") {
        emitToast(extractApiErrorMessage(result.error) || "Falha ao salvar abastecimento.", "error");
        return;
      }
      setCreateForm(newEmptyForm(user?.veiculo_id));
      onSaved?.(result.status);
      await refreshHistory();
      emitToast("Abastecimento salvo com sucesso.", "success");
    } catch (err) {
      emitToast(extractApiErrorMessage(err) || "Falha ao salvar abastecimento.", "error");
    } finally {
      setCreateLoading(false);
    }
  };

  const openEditModal = (record) => {
    setEditingId(record?.source_id || null);
    hydrateEditForm(record);
    setIsEditing(true);
  };

  const closeEditModal = () => {
    setIsEditing(false);
    setEditingId(null);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!editingId) return;
    const sanitized = sanitizeForm(editForm);
    if (!sanitized.ok) {
      emitToast(sanitized.message, "warning");
      return;
    }
    setEditLoading(true);
    try {
      await api.put(`/app/abastecimentos/${encodeURIComponent(editingId)}`, sanitized.payload);
      setFuelHistory((prev) =>
        prev.map((row) =>
          String(row?.source_id || "") === String(editingId)
            ? {
                ...row,
                status: "synced",
                updatedAt: nowLocalDateTimeString(),
                payload: {
                  ...(row?.payload || {}),
                  source_id: editingId,
                  client_id: editingId,
                  ...sanitized.payload,
                },
              }
            : row
        )
      );
      closeEditModal();
      onSaved?.("synced");
      emitToast("Abastecimento atualizado com sucesso.", "success");
    } catch (err) {
      emitToast(extractApiErrorMessage(err) || "Não foi possível salvar alterações.", "error");
    } finally {
      setEditLoading(false);
    }
  };

  const onDeleteRecord = async (record) => {
    const ok = window.confirm("Tem certeza que deseja excluir este abastecimento?");
    if (!ok) return;
    await deleteHistoryItem(record);
    setFuelHistory((prev) => prev.filter((row) => String(row?.source_id || "") !== String(record?.source_id || "")));
    if (String(record?.source_id || "") === String(editingId || "")) {
      closeEditModal();
    }
  };

  if (initializing) return <div className="fc-card p-4 text-sm text-slate-300">Carregando...</div>;
  if (error) return <div className="fc-card p-4 text-sm text-red-300">{error}</div>;

  const maxGraphValue = Math.max(...graphData.map((item) => item.total), 1);

  return (
    <div className="space-y-4 pb-28">
      <section className="fc-card space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Combustível</h2>
          <span className="fc-chip">Atividade: Combustível</span>
        </div>
        <p className="text-sm text-slate-400">Motorista: {user?.nome} | Equipamento: {user?.veiculo_nome || "-"}</p>
      </section>

      <section className="fc-card space-y-3 p-4">
        <p className="text-sm font-semibold text-slate-100">Dashboard rápido</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Total dia</p>
            <p className="mt-1 text-lg font-semibold text-white">{formatMoneyBr(fuelDashboard.totalDia)}</p>
          </div>
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Total semana</p>
            <p className="mt-1 text-lg font-semibold text-white">{formatMoneyBr(fuelDashboard.totalSemana)}</p>
          </div>
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Média R$/L</p>
            <p className="mt-1 text-lg font-semibold text-white">{formatMoneyBr(fuelDashboard.mediaLitro)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">Últimos 7 dias (R$)</p>
          <div className="flex h-24 items-end gap-2">
            {graphData.map((point) => (
              <div key={point.ymd} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="text-[10px] text-slate-400">{point.total > 0 ? Math.round(point.total) : "-"}</div>
                <div className="flex h-16 w-full items-end rounded-md bg-slate-800/80 p-1">
                  <div className="w-full rounded-sm bg-blue-500/80" style={{ height: `${Math.max(6, Math.round((point.total / maxGraphValue) * 100))}%` }} />
                </div>
                <div className="text-[10px] text-slate-500">{point.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="fc-card space-y-3 p-4">
        <p className="text-sm font-semibold text-slate-100">Novo abastecimento</p>
        <form onSubmit={submitCreate} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormField label="Data">
            <input type="datetime-local" className={inputClass} value={createForm.data} onChange={(e) => setCreateForm((prev) => ({ ...prev, data: e.target.value }))} />
          </FormField>
          <FormField label="Tipo combustível">
            <select className={inputClass} value={createForm.tipo_combustivel} onChange={(e) => setCreateForm((prev) => ({ ...prev, tipo_combustivel: e.target.value }))}>
              <option>Diesel</option>
              <option>Gasolina</option>
              <option>Etanol</option>
            </select>
          </FormField>
          <FormField label="Veículo">
            <select className={inputClass} value={createForm.veiculo_id ?? ""} onChange={(e) => setCreateForm((prev) => ({ ...prev, veiculo_id: e.target.value ? Number(e.target.value) : undefined }))} disabled={vehiclesLoading}>
              <option value="">{vehiclesLoading ? "Carregando veículos..." : "Selecione um veículo"}</option>
              {vehicleOptions.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>{vehicle.nome} - {vehicle.placa || "Sem placa"}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Quantidade (L)">
            <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={createForm.litros} onChange={(e) => setCreateForm((prev) => ({ ...prev, litros: e.target.value }))} />
          </FormField>
          <FormField label="Valor total (R$)">
            <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={createForm.valor_total} onChange={(e) => setCreateForm((prev) => ({ ...prev, valor_total: e.target.value }))} />
          </FormField>
          <FormField label="Horímetro">
            <input className={inputClass} value={createForm.horimetro} onChange={(e) => setCreateForm((prev) => ({ ...prev, horimetro: e.target.value }))} />
          </FormField>
          <FormField label="Hodômetro">
            <input className={inputClass} value={createForm.hodometro} onChange={(e) => setCreateForm((prev) => ({ ...prev, hodometro: e.target.value }))} />
          </FormField>
          <div className="md:col-span-2">
            <button type="submit" className={primaryButtonClass} disabled={createLoading}>
              {createLoading ? "Salvando..." : "Salvar abastecimento"}
            </button>
          </div>
        </form>
      </section>

      <section className="fc-card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-100">Lista de abastecimentos</p>
          <div className="flex flex-wrap gap-2">
            {HISTORY_FILTERS.map((preset) => (
              <button key={preset.id} type="button" onClick={() => setHistoryFilter(preset.id)} className={`fc-btn rounded-full border px-3 py-1.5 text-xs font-semibold ${historyFilter === preset.id ? "border-blue-400/45 bg-blue-500/20 text-blue-100" : "border-slate-700 bg-slate-900/70 text-slate-300"}`}>
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        {filteredFuelHistory.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum abastecimento encontrado no período selecionado.</p>
        ) : (
          <div className="space-y-2">
            {filteredFuelHistory.map((row) => {
              const payload = row?.payload || {};
              const sourceId = row?.source_id || payload?.source_id;
              return (
                <article key={String(sourceId)} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">{payload?.veiculo_nome || "Veículo"} {payload?.placa ? `| ${payload.placa}` : ""}</p>
                    <span className="rounded-full border border-slate-600 px-2 py-1 text-[11px] text-slate-300">{row?.status === "synced" ? "Sincronizado" : "Pendente"}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
                    <p><strong>Data:</strong> {formatDateTimeBr(payload?.data || payload?.recorded_at_client || row?.updatedAt)}</p>
                    <p><strong>Litros:</strong> {Number(payload?.litros || 0).toFixed(2)} L</p>
                    <p><strong>Total:</strong> {formatMoneyBr(payload?.valor_total || 0)}</p>
                    <p><strong>R$/L:</strong> {formatMoneyBr((Number(payload?.valor_total || 0) / Number(payload?.litros || 0)) || 0)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setSelectedRecord(row)} className="fc-btn btn-secondary rounded-lg px-3 py-2 text-xs">Visualizar</button>
                    <button type="button" onClick={() => openEditModal(row)} className="fc-btn btn-primary rounded-lg px-3 py-2 text-xs">Editar</button>
                    <button type="button" onClick={() => onDeleteRecord(row)} className="fc-btn rounded-lg border border-red-600/70 bg-red-900/20 px-3 py-2 text-xs text-red-200">Excluir</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isEditing && (
        <div className="fixed inset-0 z-50 grid overflow-y-auto bg-slate-950/70 p-4 sm:place-content-center">
          <div className="fc-card w-full max-w-xl rounded-2xl border border-slate-800 p-4">
            <h3 className="text-base font-semibold text-white">Editar abastecimento</h3>
            <form onSubmit={submitEdit} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormField label="Data"><input type="datetime-local" className={inputClass} value={editForm.data} onChange={(e) => setEditForm((prev) => ({ ...prev, data: e.target.value }))} /></FormField>
              <FormField label="Tipo combustível">
                <select className={inputClass} value={editForm.tipo_combustivel} onChange={(e) => setEditForm((prev) => ({ ...prev, tipo_combustivel: e.target.value }))}>
                  <option>Diesel</option><option>Gasolina</option><option>Etanol</option>
                </select>
              </FormField>
              <FormField label="Veículo">
                <select className={inputClass} value={editForm.veiculo_id ?? ""} onChange={(e) => setEditForm((prev) => ({ ...prev, veiculo_id: e.target.value ? Number(e.target.value) : undefined }))} disabled={vehiclesLoading}>
                  <option value="">{vehiclesLoading ? "Carregando veículos..." : "Selecione um veículo"}</option>
                  {vehicleOptions.map((vehicle) => (<option key={vehicle.id} value={vehicle.id}>{vehicle.nome} - {vehicle.placa || "Sem placa"}</option>))}
                </select>
              </FormField>
              <FormField label="Quantidade (L)"><input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={editForm.litros} onChange={(e) => setEditForm((prev) => ({ ...prev, litros: e.target.value }))} /></FormField>
              <FormField label="Valor total (R$)"><input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={editForm.valor_total} onChange={(e) => setEditForm((prev) => ({ ...prev, valor_total: e.target.value }))} /></FormField>
              <FormField label="Horímetro"><input className={inputClass} value={editForm.horimetro} onChange={(e) => setEditForm((prev) => ({ ...prev, horimetro: e.target.value }))} /></FormField>
              <FormField label="Hodômetro"><input className={inputClass} value={editForm.hodometro} onChange={(e) => setEditForm((prev) => ({ ...prev, hodometro: e.target.value }))} /></FormField>
              <div className="flex justify-end gap-2 md:col-span-2">
                <button type="button" onClick={closeEditModal} className="fc-btn btn-secondary rounded-lg px-3 py-2 text-sm">Cancelar</button>
                <button type="submit" disabled={editLoading} className="fc-btn btn-primary rounded-lg px-3 py-2 text-sm">{editLoading ? "Salvando..." : "Salvar alterações"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedRecord && (
        <div className="fixed inset-0 z-50 grid overflow-y-auto bg-slate-950/70 p-4 sm:place-content-center">
          <div className="fc-card w-full max-w-xl rounded-2xl border border-slate-800 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-white">Detalhes do abastecimento</h3>
              <button type="button" onClick={() => setSelectedRecord(null)} className="fc-btn btn-secondary rounded-lg px-3 py-1.5 text-xs">Fechar</button>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-300">
              {Object.entries(selectedRecord?.payload || {}).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{key.replaceAll("_", " ")}</p>
                  <p className="mt-1 break-words text-sm text-slate-200">{String(value ?? "-")}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
