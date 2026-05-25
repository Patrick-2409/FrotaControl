import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../services/auth";
import FormField, { inputClass, primaryButtonClass } from "../components/FormField";
import { deleteHistoryItem, saveWithOffline } from "../services/syncService";
import { emitToast } from "../services/uiEvents";
import { generateId } from "../utils/id";
import api, { extractApiErrorMessage } from "../services/api";
import { nowLocalDateTimeString, toIsoWithCurrentTimeIfDateOnly } from "../utils/datetime";
import { parseDecimalInput } from "../utils/numberParse";
import { listHistory, saveLocal } from "../offline/offlineRepo";

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

const toInputDateTime = (value) => {
  if (!value) return nowLocalDateTimeString().slice(0, 16);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 16);
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

const getRecordSourceId = (row) => row?.source_id || row?.payload?.source_id || row?.payload?.client_id;

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
  const [createForm, setCreateForm] = useState(() => newEmptyForm(user?.veiculo_id));
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState("");
  const [activeGraphPoint, setActiveGraphPoint] = useState(null);

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

  const lastFiveFuelRecords = useMemo(() => fuelHistory.slice(0, 5), [fuelHistory]);
  const startCreate = useCallback(() => {
    setEditingSourceId(null);
    setCreateForm(newEmptyForm(user?.veiculo_id));
    setCreateSuccess(false);
  }, [user?.veiculo_id]);

  const startEdit = (row) => {
    const payload = row?.payload || {};
    const sourceId = getRecordSourceId(row);
    if (!sourceId) return;
    setEditingSourceId(sourceId);
    setCreateForm({
      data: toInputDateTime(payload?.data || payload?.recorded_at_client || row?.updatedAt),
      litros: String(payload?.litros ?? ""),
      valor_total: String(payload?.valor_total ?? ""),
      tipo_combustivel: payload?.tipo_combustivel || "Diesel",
      horimetro: String(payload?.horimetro ?? ""),
      hodometro: String(payload?.hodometro ?? ""),
      veiculo_id: Number(payload?.veiculo_id || user?.veiculo_id) || undefined,
    });
    setCreateSuccess(false);
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    const sanitized = sanitizeForm(createForm);
    if (!sanitized.ok) {
      emitToast(sanitized.message, "warning");
      return;
    }
    setCreateLoading(true);
    setCreateSuccess(false);
    try {
      if (editingSourceId) {
        if (!navigator.onLine) {
          emitToast("Para editar um abastecimento, conecte-se à internet.", "warning");
          return;
        }
        const payload = {
          ...sanitized.payload,
          data: toIsoWithCurrentTimeIfDateOnly(sanitized.payload.data),
          recorded_at_client: toIsoWithCurrentTimeIfDateOnly(sanitized.payload.recorded_at_client),
        };
        await api.put(`/app/abastecimentos/${encodeURIComponent(editingSourceId)}`, payload);
        await saveLocal({
          client_id: editingSourceId,
          type: "combustiveis",
          data: {
            source_id: editingSourceId,
            client_id: editingSourceId,
            ...payload,
          },
          status: "synced",
        });
        onSaved?.("synced");
        await refreshHistory();
        setCreateSuccess(true);
        emitToast("✔ Abastecimento registrado", "success");
        window.setTimeout(() => {
          setCreateSuccess(false);
          startCreate();
        }, 1400);
        return;
      }

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
      onSaved?.(result.status);
      await refreshHistory();
      setCreateSuccess(true);
      emitToast("✔ Abastecimento registrado", "success");
      window.setTimeout(() => {
        setCreateSuccess(false);
        startCreate();
      }, 1400);
    } catch (err) {
      emitToast(extractApiErrorMessage(err) || "Falha ao salvar abastecimento.", "error");
    } finally {
      setCreateLoading(false);
    }
  };

  const onDeleteRecord = useCallback(async (row) => {
    const sourceId = getRecordSourceId(row);
    if (!sourceId) return;
    const ok = window.confirm("Deseja excluir este abastecimento? Esta ação não pode ser desfeita.");
    if (!ok) return;
    setDeleteLoadingId(sourceId);
    try {
      await deleteHistoryItem(row);
      await refreshHistory();
      emitToast("Registro excluído com sucesso.", "success");
    } catch (err) {
      emitToast(extractApiErrorMessage(err) || "Não foi possível excluir o abastecimento.", "error");
    } finally {
      setDeleteLoadingId("");
    }
  }, [refreshHistory]);

  if (initializing) return <div className="fc-card p-4 text-sm text-slate-300">Carregando...</div>;
  if (error) return <div className="fc-card p-4 text-sm text-red-300">{error}</div>;

  const maxGraphValue = Math.max(...graphData.map((item) => item.total), 1);
  const selectedGraphPoint = activeGraphPoint || graphData.at(-1) || null;

  return (
    <div className="fc-fuel-page fc-stagger space-y-4 pb-28 pt-1">
      <section className="fc-card fc-fuel-panel space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-100">Dashboard</p>
          <Link to="/app/historico" className="fc-btn btn-secondary rounded-lg px-3 py-2 text-xs">
            Ver histórico completo
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="fc-fuel-kpi rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Total dia</p>
            <p className="mt-1 text-lg font-semibold text-white">{formatMoneyBr(fuelDashboard.totalDia)}</p>
          </div>
          <div className="fc-fuel-kpi rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Total semana</p>
            <p className="mt-1 text-lg font-semibold text-white">{formatMoneyBr(fuelDashboard.totalSemana)}</p>
          </div>
          <div className="fc-fuel-kpi rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Média R$/L</p>
            <p className="mt-1 text-lg font-semibold text-white">{formatMoneyBr(fuelDashboard.mediaLitro)}</p>
          </div>
          <div className="fc-fuel-kpi rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Operação</p>
            <p className="mt-1 text-sm font-semibold text-white">Motorista: {user?.nome || "-"}</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-3">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Últimos 7 dias (R$)</p>
            {selectedGraphPoint ? (
              <div className="rounded-md border border-slate-600/80 bg-slate-900/85 px-2 py-1 text-[11px] text-slate-200">
                Dia {selectedGraphPoint.label}: {formatMoneyBr(selectedGraphPoint.total)}
              </div>
            ) : null}
          </div>
          <div className="flex h-24 items-end gap-2">
            {graphData.map((point) => (
              <div key={point.ymd} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <button
                  type="button"
                  className="flex h-16 w-full items-end rounded-md bg-slate-800/80 p-1 transition hover:bg-slate-700/80"
                  onClick={() => setActiveGraphPoint(point)}
                  onTouchStart={() => setActiveGraphPoint(point)}
                  aria-label={`Dia ${point.label}, total ${formatMoneyBr(point.total)}`}
                >
                  <div className="w-full rounded-sm bg-blue-500/80" style={{ height: `${Math.max(6, Math.round((point.total / maxGraphValue) * 100))}%` }} />
                </button>
                <div className="text-[10px] text-slate-500">{point.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="fc-card fc-fuel-panel space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-100">Novo abastecimento</p>
          {editingSourceId ? (
            <button type="button" className="fc-btn btn-secondary rounded-lg px-3 py-2 text-xs" onClick={startCreate}>
              Cancelar edição
            </button>
          ) : null}
        </div>
        <form onSubmit={submitCreate} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormField label="Data automática">
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
          <FormField label="Litros">
            <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={createForm.litros} onChange={(e) => setCreateForm((prev) => ({ ...prev, litros: e.target.value }))} />
          </FormField>
          <FormField label="Valor total">
            <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={createForm.valor_total} onChange={(e) => setCreateForm((prev) => ({ ...prev, valor_total: e.target.value }))} />
          </FormField>
          <FormField label="Horímetro">
            <input className={inputClass} value={createForm.horimetro} onChange={(e) => setCreateForm((prev) => ({ ...prev, horimetro: e.target.value }))} />
          </FormField>
          <FormField label="Hodômetro">
            <input className={inputClass} value={createForm.hodometro} onChange={(e) => setCreateForm((prev) => ({ ...prev, hodometro: e.target.value }))} />
          </FormField>
          <div className="md:col-span-2">
            <button
              type="submit"
              className={`${primaryButtonClass} h-[52px] py-0 transition-all duration-300 ${createSuccess ? "border-emerald-300 bg-emerald-500/90" : ""}`}
              disabled={createLoading}
            >
              {createLoading
                ? "Salvando..."
                : createSuccess
                ? "✔ Abastecimento registrado"
                : editingSourceId
                ? "Salvar edição"
                : "Salvar abastecimento"}
            </button>
          </div>
        </form>
      </section>

      <section className="fc-card fc-fuel-panel space-y-3 p-4">
        <p className="text-sm font-semibold text-slate-100">Últimos registros</p>
        {lastFiveFuelRecords.length === 0 ? (
          <p className="text-sm text-slate-400">Ainda não há abastecimentos recentes.</p>
        ) : (
          <div className="space-y-2">
            {lastFiveFuelRecords.map((row) => {
              const payload = row?.payload || {};
              const sourceId = getRecordSourceId(row);
              return (
                <article
                  key={String(sourceId)}
                  className="fc-fuel-record w-full rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-left text-sm transition hover:border-slate-600"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-100 text-sm">
                      {payload?.veiculo_nome || "Veículo"} {payload?.placa ? `| ${payload.placa}` : ""}
                    </p>
                    <span className="rounded-full border border-slate-600 px-2 py-1 text-[11px] text-slate-300">
                      {row?.status === "synced" ? "Sincronizado" : "Pendente"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
                    <p><strong>Data:</strong> {formatDateTimeBr(payload?.data || payload?.recorded_at_client || row?.updatedAt)}</p>
                    <p><strong>Litros:</strong> {Number(payload?.litros || 0).toFixed(2)} L</p>
                    <p><strong>Total:</strong> {formatMoneyBr(payload?.valor_total || 0)}</p>
                    <p><strong>R$/L:</strong> {formatMoneyBr((Number(payload?.valor_total || 0) / Number(payload?.litros || 0)) || 0)}</p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="fc-btn btn-secondary rounded-lg px-3 py-1.5 text-xs" onClick={() => startEdit(row)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="fc-btn rounded-lg border border-red-500/55 bg-red-900/15 px-3 py-1.5 text-xs text-red-200"
                      onClick={() => void onDeleteRecord(row)}
                      disabled={deleteLoadingId === sourceId}
                    >
                      {deleteLoadingId === sourceId ? "Excluindo..." : "Excluir"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
