import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../services/auth";
import FormField, { inputClass } from "../components/FormField";
import { saveWithOffline } from "../services/syncService";
import SaveBar from "../components/SaveBar";
import { emitToast } from "../services/uiEvents";
import { generateId } from "../utils/id";
import api from "../services/api";
import { nowLocalDateTimeString, toIsoWithCurrentTimeIfDateOnly } from "../utils/datetime";

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
const isSyncedStatus = (status) => status === "synced" || status === "sincronizado";

export default function CombustivelPage({ onSaved }) {
  const { user } = useAuth();
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [form, setForm] = useState({
    source_id: generateId(),
    data: toDatetimeLocal(new Date().toISOString()),
    litros: "",
    tipo_combustivel: "Diesel",
    horimetro: "",
    hodometro: "",
    veiculo_id: user?.veiculo_id || undefined,
  });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem("fc_edit_record");
      if (raw) {
        const record = JSON.parse(raw);
        if (record?.module === "combustiveis") {
          setForm({
            ...record.payload,
            data: toDatetimeLocal(record.payload?.data),
            litros: String(record.payload?.litros || ""),
            horimetro: String(record.payload?.horimetro || ""),
            hodometro: String(record.payload?.hodometro || ""),
          });
        }
        return;
      }
      const draft = localStorage.getItem("fc_draft_combustivel");
      if (draft) {
        const parsed = JSON.parse(draft);
        setForm({ ...parsed, data: normalizeDraftDatetime(parsed?.data) });
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar dados");
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("fc_draft_combustivel", JSON.stringify(form));
  }, [form]);

  const requiredChecks = useMemo(
    () => ({
      data: Boolean(form.data),
      veiculo_id: Boolean(form.veiculo_id),
      litros: Boolean(form.litros),
      tipo_combustivel: Boolean(form.tipo_combustivel),
    }),
    [form.data, form.veiculo_id, form.litros, form.tipo_combustivel]
  );
  const progress = Math.round(
    (Object.values(requiredChecks).filter(Boolean).length / Object.keys(requiredChecks).length) * 100
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
  }, [vehicles, user?.veiculo_id, user?.veiculo_nome, user?.placa]);

  const selectedVehicle = useMemo(
    () => vehicleOptions.find((vehicle) => Number(vehicle.id) === Number(form.veiculo_id)),
    [vehicleOptions, form.veiculo_id]
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!form.veiculo_id) {
      emitToast("Selecione o veículo (modelo e placa) para registrar o abastecimento.", "warning");
      return;
    }
    setLoading(true);
    try {
      const editRaw = localStorage.getItem("fc_edit_record");
      const editRecord = editRaw ? JSON.parse(editRaw) : null;
      const executionDate = editRecord ? toIsoWithCurrentTimeIfDateOnly(form.data) : nowLocalDateTimeString();
      const payload = {
        ...form,
        ...(isSyncedStatus(editRecord?.status)
          ? { source_id: generateId(), version_of: editRecord.source_id }
          : {}),
        data: executionDate,
        recorded_at_client: executionDate,
        veiculo_id: Number(form.veiculo_id),
        veiculo_nome: selectedVehicle?.nome || user?.veiculo_nome || "",
        placa: selectedVehicle?.placa || user?.placa || "",
        litros: Number(form.litros),
        horimetro: form.horimetro ? Number(form.horimetro) : undefined,
        hodometro: form.hodometro ? Number(form.hodometro) : undefined,
      };
      console.log("Combustivel payload:", payload);
      const result = await saveWithOffline("combustiveis", payload);
      console.log("Combustivel response:", result);
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
      localStorage.removeItem("fc_draft_combustivel");
      setForm((prev) => ({
        ...prev,
        source_id: generateId(),
        data: currentLocalDatetime(),
        litros: "",
        horimetro: "",
        hodometro: "",
      }));
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar dados");
      emitToast("Erro ao salvar combustível.", "error");
    } finally {
      setLoading(false);
    }
  };

  if (initializing) return <div className="fc-card p-4 text-sm text-slate-300">Carregando...</div>;
  if (error) return <div className="fc-card p-4 text-sm text-red-300">Erro ao carregar dados</div>;

  return (
    <form onSubmit={submit} className="fc-card fc-op-form space-y-4 p-4 pb-28">
      <div className="fc-op-form-header p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Controle de Combustível Semanal</h2>
          <span className="fc-chip">Atividade: Combustível</span>
        </div>
        <p className="mt-1 text-sm text-slate-400">Motorista: {user?.nome} | Equipamento: {user?.veiculo_nome || "-"}</p>
        <div className="fc-progress">
          <div className="fc-progress-track">
            <div className="fc-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <span className="fc-progress-label">Preenchimento obrigatório: {progress}%</span>
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
        <p className="fc-op-section-title">Identificação do Abastecimento</p>
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
        <FormField label="Tipo combustível">
          <select
            className={`${inputClass} ${requiredChecks.tipo_combustivel ? "fc-required-ok" : "fc-required-pending"}`}
            value={form.tipo_combustivel}
            onChange={(e) => setForm({ ...form, tipo_combustivel: e.target.value })}
          >
            <option>Diesel</option>
            <option>Gasolina</option>
            <option>Etanol</option>
          </select>
        </FormField>
        </div>
      </div>
      <div className="fc-op-section fc-stagger">
        <p className="fc-op-section-title">Veículo Abastecido</p>
        <FormField label="Selecione o veículo">
          <select
            className={`${inputClass} ${requiredChecks.veiculo_id ? "fc-required-ok" : "fc-required-pending"}`}
            value={form.veiculo_id ?? ""}
            onChange={(e) => setForm({ ...form, veiculo_id: e.target.value ? Number(e.target.value) : undefined })}
            disabled={vehiclesLoading}
          >
            <option value="">{vehiclesLoading ? "Carregando veículos..." : "Selecione um veículo"}</option>
            {vehicleOptions.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.nome} - {vehicle.placa || "Sem placa"}
                {vehicle.marca || vehicle.modelo ? ` | ${vehicle.marca || ""} ${vehicle.modelo || ""}` : ""}
                {vehicle.linked ? " (vinculado a você)" : ""}
              </option>
            ))}
          </select>
        </FormField>
        {selectedVehicle ? (
          <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
            Veículo selecionado: <strong>{selectedVehicle.nome}</strong> | Placa:{" "}
            <strong>{selectedVehicle.placa || "Sem placa"}</strong>
            {selectedVehicle.marca || selectedVehicle.modelo
              ? ` | Marca/Modelo: ${selectedVehicle.marca || ""} ${selectedVehicle.modelo || ""}`.trim()
              : ""}
            {selectedVehicle.linked ? " (vinculado ao seu perfil)" : ""}
          </p>
        ) : (
          !vehiclesLoading && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Selecione o veículo para concluir o abastecimento.
            </p>
          )
        )}
      </div>
      <div className="fc-op-section fc-stagger">
        <p className="fc-op-section-title">Registro de Medição</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <FormField label="Quantidade (L)">
          <input
            className={`${inputClass} ${requiredChecks.litros ? "fc-required-ok" : "fc-required-pending"}`}
            value={form.litros}
            onChange={(e) => setForm({ ...form, litros: e.target.value })}
          />
        </FormField>
        <FormField label="Horímetro">
          <input className={inputClass} value={form.horimetro} onChange={(e) => setForm({ ...form, horimetro: e.target.value })} />
        </FormField>
        <FormField label="Hodômetro">
          <input className={inputClass} value={form.hodometro} onChange={(e) => setForm({ ...form, hodometro: e.target.value })} />
        </FormField>
        </div>
      </div>
      <button
        type="button"
        className="mb-2 rounded-lg border border-slate-700 px-3 py-2 text-sm"
        onClick={() => {
          setForm((prev) => ({ ...prev, source_id: generateId(), version_of: prev.source_id }));
          emitToast("Registro duplicado. Ajuste e salve.");
        }}
      >
        Duplicar registro
      </button>
      <SaveBar loading={loading} label="SALVAR ABASTECIMENTO" />
    </form>
  );
}
