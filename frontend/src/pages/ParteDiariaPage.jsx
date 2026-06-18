import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import FormField, { inputClass, primaryButtonClass } from "../components/FormField";
import { deleteHistoryItem, saveWithOffline } from "../services/syncService";
import { useAuth } from "../services/auth";
import { emitToast } from "../services/uiEvents";
import { generateId } from "../utils/id";
import api from "../services/api";
import { nowLocalDateTimeString, toIsoWithCurrentTimeIfDateOnly } from "../utils/datetime";
import { listHistory } from "../offline/offlineRepo";

const checklistItems = [
  { key: "motor", label: "Motor" },
  { key: "hidráulico", label: "Sistema hidráulico" },
  { key: "freios", label: "Freios" },
  { key: "pneus", label: "Pneus/Esteiras" },
  { key: "iluminação", label: "Iluminação e sinalização" },
  { key: "óleo", label: "Nível de óleo e fluídos" },
  { key: "combustível", label: "Combustível" },
  { key: "outros", label: "Outros" },
];
const checklistStatus = ["ok", "ajuste", "não_funcional"];
const requiredChecklistKeys = ["motor", "hidráulico", "freios", "pneus", "iluminação", "óleo", "combustível"];
const buildEmptyChecklist = () => Object.fromEntries(checklistItems.map((item) => [item.key, ""]));
const normalizeChecklistForSubmit = (checklist = {}) => {
  const normalized = {};
  for (const key of requiredChecklistKeys) {
    normalized[key] = checklistStatus.includes(checklist?.[key]) ? checklist[key] : "ok";
  }
  if (checklistStatus.includes(checklist?.outros)) {
    normalized.outros = checklist.outros;
  }
  return normalized;
};
const requiredFieldLabels = {
  data: "Data de execução",
  contratado: "Empresa/Contratante",
  operador: "Operador",
  equipamento: "Equipamento",
  marca_modelo: "Marca/Modelo",
  local: "Local",
  periodo: "Período",
  clima: "Clima",
  horimetro_inicio: "Horímetro início",
  horimetro_fim: "Horímetro fim",
  checklist: "Checklist obrigatório",
};
const isSyncedStatus = (status) => status === "synced" || status === "sincronizado";
const inferEquipmentType = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase();
  if (normalized.includes("escavadeira")) return "Escavadeira";
  if (normalized.includes("retro")) return "Retroescavadeira";
  if (normalized.includes("caminh")) return "Caminhão";
  if (normalized.includes("trator")) return "Trator";
  if (normalized.includes("p") && normalized.includes("carregadeira")) return "Pá carregadeira";
  return raw;
};
const buildBrandModel = (marca, modelo) => {
  const m1 = String(marca || "").trim();
  const m2 = String(modelo || "").trim();
  return [m1, m2].filter(Boolean).join(" ");
};
const toDatetimeLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const currentLocalDatetime = () => toDatetimeLocal(new Date().toISOString());
const normalizeDraftDatetime = (value) => {
  const normalized = toDatetimeLocal(value);
  const current = currentLocalDatetime();
  if (!normalized) return current;
  return normalized.slice(0, 10) === current.slice(0, 10) ? normalized : current;
};
const operationYmd = (value) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
const addDays = (ymd, delta) => {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};
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
const getDailyHours = (row) => {
  const payload = row?.payload || {};
  if (Number.isFinite(Number(payload?.total_horas))) return Number(payload.total_horas);
  const ini = Number(payload?.horimetro_inicio || 0);
  const fim = Number(payload?.horimetro_fim || 0);
  const total = fim - ini;
  return Number.isFinite(total) ? total : 0;
};
const getDailyKm = (row) => {
  const payload = row?.payload || {};
  if (Number.isFinite(Number(payload?.total_km))) return Number(payload.total_km);
  const ini = Number(payload?.hodometro_inicio || 0);
  const fim = Number(payload?.hodometro_fim || 0);
  const total = fim - ini;
  return Number.isFinite(total) ? total : 0;
};
const getRecordSourceId = (row) => row?.source_id || row?.payload?.source_id || row?.payload?.client_id;

export default function ParteDiariaPage({ onSaved }) {
  const { user } = useAuth();
  const draftKey = `fc_draft_parte_${user?.id || "anon"}`;
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [dailyHistory, setDailyHistory] = useState([]);
  const [form, setForm] = useState({
    source_id: generateId(),
    data: toDatetimeLocal(new Date().toISOString()),
    contratado: user?.empresa_nome || "",
    operador: user?.nome || "",
    equipamento: inferEquipmentType(user?.veiculo_nome),
    marca_modelo: buildBrandModel(user?.veiculo_marca, user?.veiculo_modelo),
    local: "",
    expediente: "",
    periodo: "manhã",
    clima: "bom",
    horimetro_inicio: "",
    horimetro_fim: "",
    hodometro_inicio: "",
    hodometro_fim: "",
    tempo_parado: "",
    observacoes: "",
    producao: "",
    outros_descricao: "",
    veiculo_id: user?.veiculo_id || undefined,
    checklist: buildEmptyChecklist(),
  });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [formVisible, setFormVisible] = useState(false);
  const [recentVisible, setRecentVisible] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState("");
  const [editingSourceId, setEditingSourceId] = useState(null);
  const userEmpresaNome = user?.empresa_nome || "";
  const userNome = user?.nome || "";

  useEffect(() => {
    let active = true;
    const loadVehicles = async () => {
      setVehiclesLoading(true);
      try {
        const { data } = await api.get("/app/veiculos");
        if (!active) return;
        setVehicles(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        console.error("Erro ao carregar veículos:", err);
        if (!active) return;
        setVehicles([]);
      } finally {
        if (active) {
          setVehiclesLoading(false);
        }
      }
    };
    loadVehicles();
    return () => {
      active = false;
    };
  }, []);

  const mergeHistory = useCallback((remoteRows, localRows) => {
    const merged = new Map();
    for (const row of remoteRows || []) {
      if (!row?.source_id || row?.module !== "parteDiaria") continue;
      merged.set(`parteDiaria:${row.source_id}`, row);
    }
    for (const row of localRows || []) {
      if (!row?.source_id || row?.module !== "parteDiaria") continue;
      merged.set(`parteDiaria:${row.source_id}`, row);
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
      setDailyHistory(mergeHistory(remoteRows, localRows));
    } catch {
      setDailyHistory(mergeHistory([], localRows));
    }
  }, [mergeHistory]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      contratado: user?.empresa_nome || prev.contratado,
      operador: user?.nome || prev.operador,
      veiculo_id: prev.veiculo_id || user?.veiculo_id || undefined,
      equipamento: prev.equipamento || inferEquipmentType(user?.veiculo_nome),
      marca_modelo: prev.marca_modelo || buildBrandModel(user?.veiculo_marca, user?.veiculo_modelo),
    }));
  }, [user?.empresa_nome, user?.nome, user?.veiculo_id, user?.veiculo_nome, user?.veiculo_marca, user?.veiculo_modelo]);

  useEffect(() => {
    // Limpa rascunho legado compartilhado entre usuários para evitar contaminação de perfil.
    localStorage.removeItem("fc_draft_parte");
    try {
      const raw = localStorage.getItem("fc_edit_record");
      if (raw) {
        const record = JSON.parse(raw);
        if (record?.module === "parteDiaria") {
          setEditingSourceId(record?.source_id || record?.payload?.source_id || record?.payload?.client_id || null);
          setFormVisible(true);
          setForm({
            ...record.payload,
            data: toDatetimeLocal(record.payload?.data),
            horimetro_inicio: String(record.payload?.horimetro_inicio ?? ""),
            horimetro_fim: String(record.payload?.horimetro_fim ?? ""),
            hodometro_inicio: String(record.payload?.hodometro_inicio ?? ""),
            hodometro_fim: String(record.payload?.hodometro_fim ?? ""),
            checklist: {
              ...buildEmptyChecklist(),
              ...(record.payload?.checklist || {}),
            },
          });
        }
        return;
      }
      const userDraftRaw = localStorage.getItem(draftKey);
      if (userDraftRaw) {
        const draft = JSON.parse(userDraftRaw);
        setForm({
          ...draft,
          data: normalizeDraftDatetime(draft?.data),
          contratado: userEmpresaNome || draft.contratado || "",
          operador: userNome || draft.operador || "",
          checklist: {
            ...buildEmptyChecklist(),
            ...(draft.checklist || {}),
          },
        });
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar dados");
    } finally {
      setInitializing(false);
    }
  }, [draftKey, userEmpresaNome, userNome]);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify(form));
  }, [form, draftKey]);

  const total = useMemo(() => {
    const ini = Number(form.horimetro_inicio || 0);
    const fim = Number(form.horimetro_fim || 0);
    return (fim - ini).toFixed(2);
  }, [form.horimetro_inicio, form.horimetro_fim]);
  const totalKm = useMemo(() => {
    const ini = Number(form.hodometro_inicio || 0);
    const fim = Number(form.hodometro_fim || 0);
    return (fim - ini).toFixed(2);
  }, [form.hodometro_inicio, form.hodometro_fim]);
  const requiredChecks = useMemo(
    () => {
      const checklistValido = requiredChecklistKeys.every((key) =>
        checklistStatus.includes(form.checklist?.[key])
      );
      return {
        data: Boolean(form.data),
        contratado: Boolean(form.contratado.trim()),
        operador: Boolean(form.operador.trim()),
        equipamento: Boolean(form.equipamento.trim()),
        marca_modelo: Boolean(form.marca_modelo.trim()),
        local: Boolean(form.local.trim()),
        periodo: Boolean(form.periodo),
        clima: Boolean(form.clima),
        horimetro_inicio: form.horimetro_inicio !== "",
        horimetro_fim: form.horimetro_fim !== "",
        checklist: checklistValido,
      };
    },
    [form]
  );
  const completedRequired = Object.values(requiredChecks).filter(Boolean).length;
  const progressBase = Object.keys(requiredChecks).length || 1;
  const progress = Math.round((completedRequired / progressBase) * 100);
  const missingRequiredLabels = useMemo(
    () =>
      Object.entries(requiredChecks)
        .filter(([, ok]) => !ok)
        .map(([key]) => requiredFieldLabels[key] || key),
    [requiredChecks]
  );

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
        linked: true,
      });
    }
    for (const vehicle of Array.isArray(vehicles) ? vehicles : []) {
      const id = Number(vehicle.id);
      if (!id) continue;
      byId.set(id, {
        ...vehicle,
        linked: userVehicleId === id,
      });
    }
    return Array.from(byId.values());
  }, [vehicles, user?.veiculo_id, user?.veiculo_nome, user?.placa, user?.veiculo_marca, user?.veiculo_modelo]);

  const selectedVehicle = useMemo(
    () => vehicleOptions.find((vehicle) => Number(vehicle.id) === Number(form.veiculo_id)),
    [vehicleOptions, form.veiculo_id]
  );

  const hasMultipleVehicles = vehicleOptions.length > 1;

  const todayDashboard = useMemo(() => {
    const today = operationYmd(new Date().toISOString());
    const weekStart = addDays(today, -6);
    let totalHoje = 0;
    let totalSemana = 0;
    let kmHoje = 0;
    let kmSemana = 0;
    for (const row of dailyHistory) {
      const raw = row?.payload?.data || row?.payload?.recorded_at_client || row?.updatedAt;
      const ymd = operationYmd(raw);
      const horas = getDailyHours(row);
      const kms = getDailyKm(row);
      if (ymd === today) {
        totalHoje += horas;
        kmHoje += kms;
      }
      if (ymd >= weekStart && ymd <= today) {
        totalSemana += horas;
        kmSemana += kms;
      }
    }
    return {
      totalHoje,
      totalSemana,
      mediaDiaSemana: totalSemana / 7,
      kmHoje,
      kmSemana,
    };
  }, [dailyHistory]);

  const chartData = useMemo(() => {
    const today = operationYmd(new Date().toISOString());
    const start = addDays(today, -6);
    const labels = [];
    for (let cursor = start; cursor <= today; cursor = addDays(cursor, 1)) {
      labels.push(cursor);
    }
    const totals = new Map(labels.map((d) => [d, 0]));
    for (const row of dailyHistory) {
      const raw = row?.payload?.data || row?.payload?.recorded_at_client || row?.updatedAt;
      const ymd = operationYmd(raw);
      if (!totals.has(ymd)) continue;
      totals.set(ymd, Number(totals.get(ymd) || 0) + getDailyHours(row));
    }
    return labels.map((ymd) => ({ ymd, label: ymd.slice(8, 10), total: totals.get(ymd) || 0 }));
  }, [dailyHistory]);

  const lastFiveRecords = useMemo(() => dailyHistory.slice(0, 5), [dailyHistory]);

  const onVehicleChange = useCallback(
    (rawId) => {
      const nextId = rawId ? Number(rawId) : undefined;
      const vehicle = vehicleOptions.find((v) => Number(v.id) === nextId);
      const equipmentType = inferEquipmentType(vehicle?.nome);
      const brandModel = buildBrandModel(vehicle?.marca, vehicle?.modelo);
      setForm((prev) => ({
        ...prev,
        veiculo_id: nextId,
        equipamento: equipmentType || prev.equipamento,
        marca_modelo: brandModel || prev.marca_modelo,
      }));
    },
    [vehicleOptions]
  );

  useEffect(() => {
    if (form.veiculo_id || !vehicleOptions.length) return;
    const defaultVehicle = vehicleOptions.find((v) => v.linked) || vehicleOptions[0];
    if (!defaultVehicle) return;
    onVehicleChange(String(defaultVehicle.id));
  }, [vehicleOptions, form.veiculo_id, onVehicleChange]);

  const hydrateFormFromPayload = useCallback((payload = {}) => {
    setForm((prev) => ({
      ...prev,
      ...payload,
      data: toDatetimeLocal(payload?.data || payload?.recorded_at_client || new Date().toISOString()),
      horimetro_inicio: String(payload?.horimetro_inicio ?? ""),
      horimetro_fim: String(payload?.horimetro_fim ?? ""),
      hodometro_inicio: String(payload?.hodometro_inicio ?? ""),
      hodometro_fim: String(payload?.hodometro_fim ?? ""),
      checklist: {
        ...buildEmptyChecklist(),
        ...(payload?.checklist || {}),
      },
      source_id: payload?.source_id || payload?.client_id || prev.source_id || generateId(),
    }));
  }, []);

  const resetForCreate = useCallback(() => {
    localStorage.removeItem("fc_edit_record");
    setEditingSourceId(null);
    setFeedback(null);
    setForm((prev) => ({
      ...prev,
      source_id: generateId(),
      data: currentLocalDatetime(),
      checklist: buildEmptyChecklist(),
      horimetro_inicio: "",
      horimetro_fim: "",
      hodometro_inicio: "",
      hodometro_fim: "",
      tempo_parado: "",
      observacoes: "",
      producao: "",
      outros_descricao: "",
    }));
  }, []);

  const startEditRecord = useCallback((row) => {
    const payload = row?.payload || {};
    localStorage.setItem("fc_edit_record", JSON.stringify(row));
    setEditingSourceId(getRecordSourceId(row));
    setFeedback(null);
    hydrateFormFromPayload(payload);
    setFormVisible(true);
  }, [hydrateFormFromPayload]);

  const onDeleteRecord = useCallback(async (row) => {
    const sourceId = getRecordSourceId(row);
    if (!sourceId) return;
    const ok = window.confirm("Deseja excluir este registro de parte diária?");
    if (!ok) return;
    setDeleteLoadingId(sourceId);
    try {
      await deleteHistoryItem(row);
      await refreshHistory();
      emitToast("Registro excluído com sucesso.", "success");
    } catch (err) {
      emitToast(err?.response?.data?.message || "Não foi possível excluir o registro.", "error");
    } finally {
      setDeleteLoadingId("");
    }
  }, [refreshHistory]);

  const submit = async (e) => {
    e.preventDefault();
    if (missingRequiredLabels.length) {
      emitToast(`Campos obrigatórios pendentes: ${missingRequiredLabels.join(", ")}.`, "warning");
      return;
    }
    if (Number(form.horimetro_fim) < Number(form.horimetro_inicio)) {
      emitToast("Horímetro final deve ser maior que o inicial.", "error");
      return;
    }
    if (
      (form.hodometro_inicio || form.hodometro_fim) &&
      Number(form.hodometro_fim || 0) < Number(form.hodometro_inicio || 0)
    ) {
      emitToast("Hodômetro final deve ser maior que o inicial.", "error");
      return;
    }
    setLoading(true);
    try {
      const editRaw = localStorage.getItem("fc_edit_record");
      const editRecord = editRaw ? JSON.parse(editRaw) : null;
      const executionDate = editRecord ? toIsoWithCurrentTimeIfDateOnly(form.data) : nowLocalDateTimeString();
      const createPayloadIdentity = editRecord
        ? {}
        : {
            source_id: generateId(),
          };
      const payload = {
        ...form,
        ...createPayloadIdentity,
        ...(isSyncedStatus(editRecord?.status)
          ? { source_id: generateId(), version_of: editRecord.source_id }
          : {}),
        data: executionDate,
        recorded_at_client: executionDate,
        horimetro_inicio: Number(form.horimetro_inicio),
        horimetro_fim: Number(form.horimetro_fim),
        hodometro_inicio: form.hodometro_inicio ? Number(form.hodometro_inicio) : undefined,
        hodometro_fim: form.hodometro_fim ? Number(form.hodometro_fim) : undefined,
        veiculo_id: form.veiculo_id ? Number(form.veiculo_id) : undefined,
        checklist: normalizeChecklistForSubmit(form.checklist),
      };
      const result = await saveWithOffline("parteDiaria", payload);
      onSaved(result.status);
      setFeedback(result.status);
      emitToast(
        result.status === "synced"
          ? "Registro salvo com sucesso"
          : result.status === "syncing"
          ? "Falha na sincronização. Registro mantido pendente para retry."
          : "Registro salvo com sucesso (pendente de sincronização)",
        result.status === "synced" ? "success" : result.status === "syncing" ? "error" : "warning"
      );
      localStorage.removeItem("fc_edit_record");
      localStorage.removeItem(draftKey);
      setEditingSourceId(null);
      await refreshHistory();
      setFormVisible(false);
      setForm((prev) => ({
        ...prev,
        source_id: generateId(),
        data: currentLocalDatetime(),
        checklist: buildEmptyChecklist(),
      }));
    } catch (err) {
      console.error(err);
      const apiMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.response?.data?.issues?.[0]?.message;
      emitToast(apiMsg || "Erro ao salvar parte diária. Verifique os dados e a ligação.", "error");
    } finally {
      setLoading(false);
    }
  };

  if (initializing) return <div className="fc-card p-4 text-sm text-slate-300">Carregando...</div>;
  if (error) return <div className="fc-card p-4 text-sm text-red-300">Erro ao carregar dados</div>;
  const maxGraphValue = Math.max(...chartData.map((item) => item.total), 1);

  return (
    <div className="space-y-4 pb-28">
      <section className="fc-card space-y-3 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-100">Dashboard rápido</p>
          <Link to="/app/historico" className="fc-btn btn-secondary w-full rounded-lg px-3 py-2 text-center text-xs sm:w-auto">
            Ver histórico completo
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Horas hoje</p>
            <p className="mt-1 text-lg font-semibold text-white">{todayDashboard.totalHoje.toFixed(2)} h</p>
          </div>
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Horas semana</p>
            <p className="mt-1 text-lg font-semibold text-white">{todayDashboard.totalSemana.toFixed(2)} h</p>
          </div>
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Média dia (7d)</p>
            <p className="mt-1 text-lg font-semibold text-white">{todayDashboard.mediaDiaSemana.toFixed(2)} h</p>
          </div>
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">KM hoje / semana</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {todayDashboard.kmHoje.toFixed(1)} / {todayDashboard.kmSemana.toFixed(1)}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">Últimos 7 dias (horas)</p>
          <div className="overflow-x-auto">
            <div className="flex h-24 min-w-[340px] items-end gap-2 sm:min-w-0">
              {chartData.map((point) => (
                <div key={point.ymd} className="flex min-w-[36px] flex-1 flex-col items-center gap-1">
                  <div className="text-[10px] text-slate-400">{point.total > 0 ? point.total.toFixed(1) : "-"}</div>
                  <div className="flex h-16 w-full items-end rounded-md bg-slate-800/80 p-1">
                    <div className="w-full rounded-sm bg-blue-500/80" style={{ height: `${Math.max(6, Math.round((point.total / maxGraphValue) * 100))}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-500">{point.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="fc-card space-y-3 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-100">Nova parte diária</p>
          {!formVisible ? (
            <button type="button" className="fc-btn btn-primary w-full rounded-lg px-3 py-2 text-xs sm:w-auto" onClick={() => { resetForCreate(); setFormVisible(true); }}>
              + Nova parte diária
            </button>
          ) : (
            <button type="button" className="fc-btn btn-secondary w-full rounded-lg px-3 py-2 text-xs sm:w-auto" onClick={() => { resetForCreate(); setFormVisible(false); }}>
              {editingSourceId ? "Cancelar edição" : "Fechar formulário"}
            </button>
          )}
        </div>

        {formVisible ? (
          <form onSubmit={submit} className="fc-op-form space-y-4">
            <div className="fc-op-form-header p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-white">{editingSourceId ? "Editar parte diária" : "Parte Diária de Equipamento"}</h2>
                <span className="fc-chip">Atividade: Parte Diária</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Preencha conforme formulário oficial da operação.</p>
              <div className="fc-progress">
                <div className="fc-progress-track">
                  <div className="fc-progress-bar" style={{ width: `${progress}%` }} />
                </div>
                <span className="fc-progress-label">Preenchimento obrigatório: {progress}%</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {missingRequiredLabels.length
                    ? `Faltam ${missingRequiredLabels.length} campo(s): ${missingRequiredLabels.join(", ")}.`
                    : "Todos os campos obrigatórios foram preenchidos."}
                </span>
              </div>
            </div>
            {feedback && (
              <p
                className={`mb-3 rounded-lg px-3 py-2 text-sm ${
                  feedback === "synced"
                    ? "bg-emerald-600/20 text-emerald-300"
                    : feedback === "syncing"
                    ? "bg-red-600/20 text-red-200"
                    : "bg-amber-500/20 text-amber-100"
                }`}
              >
                {feedback === "synced"
                  ? "Sincronizado com sucesso"
                  : feedback === "syncing"
                  ? "Erro de sincronização. Tentaremos novamente."
                  : "Registro salvo localmente"}
              </p>
            )}
            <div className="fc-op-section fc-stagger">
              <p className="fc-op-section-title">Identificação</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField label="Data de execução">
                  <input
                    type="datetime-local"
                    className={`${inputClass} ${requiredChecks.data ? "fc-required-ok" : "fc-required-pending"}`}
                    value={form.data}
                    readOnly
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Horário automático do celular no momento de salvar.
                  </p>
                </FormField>
                <FormField label="Expediente">
                  <input
                    className={inputClass}
                    placeholder="Ex: 07:00 às 17:00"
                    value={form.expediente}
                    onChange={(e) => setForm({ ...form, expediente: e.target.value })}
                  />
                </FormField>
              </div>
            </div>

            <div className="fc-op-section fc-stagger">
              <p className="fc-op-section-title">Campos Gerais</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField label="Empresa / Contratante">
                  <input
                    className={`${inputClass} ${requiredChecks.contratado ? "fc-required-ok" : "fc-required-pending"}`}
                    value={form.contratado}
                    onChange={(e) => setForm({ ...form, contratado: e.target.value })}
                  />
                </FormField>
                <FormField label="Operador (motorista)">
                  <input
                    className={`${inputClass} ${requiredChecks.operador ? "fc-required-ok" : "fc-required-pending"}`}
                    value={form.operador}
                    readOnly
                    disabled
                  />
                </FormField>
              </div>
              {hasMultipleVehicles ? (
                <FormField label="Veículo vinculado nesta operação">
                  <select
                    className={inputClass}
                    value={form.veiculo_id ?? ""}
                    onChange={(e) => onVehicleChange(e.target.value)}
                    disabled={vehiclesLoading}
                  >
                    <option value="">{vehiclesLoading ? "Carregando veículos..." : "Selecione um veículo"}</option>
                    {vehicleOptions.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.nome} - {vehicle.placa || "Sem placa"}{vehicle.linked ? " (vinculado a você)" : ""}
                      </option>
                    ))}
                  </select>
                </FormField>
              ) : null}
              {selectedVehicle && (
                <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
                  Veículo selecionado: <strong>{selectedVehicle.nome}</strong> | Placa:{" "}
                  <strong>{selectedVehicle.placa || "Sem placa"}</strong>
                  {buildBrandModel(selectedVehicle.marca, selectedVehicle.modelo)
                    ? ` | Marca/Modelo: ${buildBrandModel(selectedVehicle.marca, selectedVehicle.modelo)}`
                    : ""}
                  {selectedVehicle.linked ? " (vinculado ao seu perfil)" : ""}
                </p>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {["equipamento", "marca_modelo", "local"].map((k) => (
                  <FormField key={k} label={k.replace("_", " ")}>
                    <input
                      className={`${inputClass} ${requiredChecks[k] ? "fc-required-ok" : "fc-required-pending"}`}
                      value={form[k]}
                      placeholder={
                        k === "equipamento"
                          ? "Ex: Escavadeira"
                          : k === "marca_modelo"
                          ? "Ex: Caterpillar 320 / Komatsu PC200"
                          : ""
                      }
                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    />
                  </FormField>
                ))}
              </div>
            </div>

            <div className="fc-op-section fc-stagger">
              <p className="fc-op-section-title">Registro de Tempo</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField label="Período">
                  <select className={inputClass} value={form.periodo} onChange={(e) => setForm({ ...form, periodo: e.target.value })}>
                    <option>manhã</option><option>tarde</option><option>noite</option>
                  </select>
                </FormField>
                <FormField label="Clima">
                  <select className={inputClass} value={form.clima} onChange={(e) => setForm({ ...form, clima: e.target.value })}>
                    <option>bom</option><option>chuva</option>
                  </select>
                </FormField>
              </div>
            </div>

            <div className="fc-op-section fc-stagger">
              <p className="fc-op-section-title">Registro de Horas</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Horímetro início">
                  <input
                    className={`${inputClass} ${requiredChecks.horimetro_inicio ? "fc-required-ok" : "fc-required-pending"}`}
                    value={form.horimetro_inicio}
                    onChange={(e) => setForm({ ...form, horimetro_inicio: e.target.value })}
                  />
                </FormField>
                <FormField label="Horímetro fim">
                  <input
                    className={`${inputClass} ${requiredChecks.horimetro_fim ? "fc-required-ok" : "fc-required-pending"}`}
                    value={form.horimetro_fim}
                    onChange={(e) => setForm({ ...form, horimetro_fim: e.target.value })}
                  />
                </FormField>
                <FormField label="Hodômetro início (opcional)">
                  <input className={inputClass} value={form.hodometro_inicio} onChange={(e) => setForm({ ...form, hodometro_inicio: e.target.value })} />
                </FormField>
                <FormField label="Hodômetro fim (opcional)">
                  <input className={inputClass} value={form.hodometro_fim} onChange={(e) => setForm({ ...form, hodometro_fim: e.target.value })} />
                </FormField>
              </div>
              <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <p className="rounded-lg bg-slate-800 p-2 text-sm text-blue-300">Total horas: {total} h</p>
                <p className="rounded-lg bg-slate-800 p-2 text-sm text-blue-300">Total KM: {totalKm} km</p>
              </div>
            </div>

            <div className="fc-op-section fc-stagger">
              <p className="fc-op-section-title">Checklist de Condições</p>
              <div className="space-y-2">
                {(Array.isArray(checklistItems) ? checklistItems : []).map((item) => (
                  <div key={item.key} className="rounded-lg border border-slate-700/60 p-2">
                    <p className="mb-2 text-sm text-slate-200">{item.label}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {checklistStatus.map((status) => (
                        <button
                          key={`${item.key}-${status}`}
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              checklist: { ...prev.checklist, [item.key]: status },
                            }))
                          }
                          className={`fc-btn rounded-md border px-2 py-1 text-xs ${
                            form.checklist[item.key] === status
                              ? "border-blue-500 bg-blue-500/20 text-blue-200"
                              : "border-slate-700 text-slate-300"
                          }`}
                        >
                          {status === "ok" ? "OK" : status === "ajuste" ? "Ajuste" : "Não funcional"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <FormField label="Outros (especificar)">
                  <textarea
                    className={inputClass}
                    value={form.outros_descricao}
                    onChange={(e) => setForm({ ...form, outros_descricao: e.target.value })}
                  />
                </FormField>
              </div>
            </div>

            <div className="fc-op-section fc-stagger">
              <p className="fc-op-section-title">Ocorrências e Produção</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField label="Tempo parado">
                  <input className={inputClass} value={form.tempo_parado} onChange={(e) => setForm({ ...form, tempo_parado: e.target.value })} />
                </FormField>
                <FormField label="Produção">
                  <input className={inputClass} value={form.producao} onChange={(e) => setForm({ ...form, producao: e.target.value })} />
                </FormField>
              </div>
            </div>
            <FormField label="Observações">
              <textarea className={inputClass} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </FormField>

            <div className="pt-2">
              <button type="submit" disabled={loading} className={`${primaryButtonClass} h-[52px] py-0`}>
                {loading ? "Salvando..." : editingSourceId ? "Salvar edição" : "Salvar parte diária"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-400">Toque em <strong>+ Nova parte diária</strong> para abrir o formulário.</p>
        )}
      </section>

      <section className="fc-card space-y-3 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-100">Últimos registros</p>
          <button type="button" className="fc-btn btn-secondary w-full rounded-lg px-3 py-2 text-xs sm:w-auto" onClick={() => setRecentVisible((prev) => !prev)}>
            {recentVisible ? "Ocultar registros" : "Ver últimos registros"}
          </button>
        </div>
        {recentVisible ? (
          lastFiveRecords.length === 0 ? (
            <p className="text-sm text-slate-400">Ainda não há partes diárias recentes.</p>
          ) : (
            <div className="space-y-2">
              {lastFiveRecords.map((row) => {
                const payload = row?.payload || {};
                const sourceId = getRecordSourceId(row);
                return (
                  <article key={String(sourceId)} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-100">{payload?.equipamento || "Equipamento"} | {payload?.operador || "-"}</p>
                      <span className="rounded-full border border-slate-600 px-2 py-1 text-[11px] text-slate-300">
                        {isSyncedStatus(row?.status) ? "Sincronizado" : "Pendente"}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
                      <p><strong>Data:</strong> {formatDateTimeBr(payload?.data || payload?.recorded_at_client || row?.updatedAt)}</p>
                      <p><strong>Horas:</strong> {getDailyHours(row).toFixed(2)} h</p>
                      <p><strong>Período:</strong> {payload?.periodo || "-"}</p>
                      <p><strong>Local:</strong> {payload?.local || "-"}</p>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button type="button" className="fc-btn btn-secondary w-full rounded-lg px-3 py-1.5 text-xs sm:w-auto" onClick={() => startEditRecord(row)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="fc-btn w-full rounded-lg border border-red-500/55 bg-red-900/15 px-3 py-1.5 text-xs text-red-200 sm:w-auto"
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
          )
        ) : (
          <p className="text-sm text-slate-400">Os registros recentes ficam ocultos para deixar a operação mais enxuta.</p>
        )}
      </section>
    </div>
  );
}
