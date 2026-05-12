import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../services/auth";
import FormField, { inputClass } from "../components/FormField";
import { saveWithOffline } from "../services/syncService";
import SaveBar from "../components/SaveBar";
import { emitToast } from "../services/uiEvents";
import { generateId } from "../utils/id";
import { nowLocalDateTimeString, toIsoWithCurrentTimeIfDateOnly } from "../utils/datetime";

const transportOptions = ["Estéril", "Rocha (amarração)", "Rocha (pulmão)"];
const isSyncedStatus = (status) => status === "synced" || status === "sincronizado";
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

export default function RomaneioPage({ onSaved }) {
  const { user } = useAuth();
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    source_id: generateId(),
    data: toDatetimeLocal(new Date().toISOString()),
    tipo_transporte: "Estéril",
    destino: "",
    observacao: "",
    veiculo_id: user?.veiculo_id || undefined,
  });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("fc_edit_record");
      if (raw) {
        const record = JSON.parse(raw);
        if (record?.module === "romaneios") {
          setForm({ ...record.payload, data: toDatetimeLocal(record.payload?.data) });
        }
        return;
      }
      const draft = localStorage.getItem("fc_draft_romaneio");
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
    localStorage.setItem("fc_draft_romaneio", JSON.stringify(form));
  }, [form]);

  const requiredChecks = useMemo(
    () => ({
      data: Boolean(form.data),
      tipo_transporte: Boolean(form.tipo_transporte),
      destino: Boolean(form.destino.trim()),
    }),
    [form.data, form.tipo_transporte, form.destino]
  );
  const progress = Math.round(
    (Object.values(requiredChecks).filter(Boolean).length / Object.keys(requiredChecks).length) * 100
  );

  const onSubmit = async (e) => {
    e.preventDefault();
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
        veiculo_nome: user?.veiculo_nome || "",
        placa: user?.placa || "",
      };
      console.log("Romaneio payload:", payload);
      const result = await saveWithOffline("romaneios", payload);
      console.log("Romaneio response:", result);
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
      localStorage.removeItem("fc_draft_romaneio");
      setForm((prev) => ({
        ...prev,
        source_id: generateId(),
        data: currentLocalDatetime(),
        destino: "",
        observacao: "",
      }));
    } catch (err) {
      console.error(err);
      const apiMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.response?.data?.issues?.[0]?.message;
      emitToast(apiMsg || "Erro ao salvar romaneio. Verifique os dados e a ligação.", "error");
    } finally {
      setLoading(false);
    }
  };

  if (initializing) return <div className="fc-card p-4 text-sm text-slate-300">Carregando...</div>;
  if (error) return <div className="fc-card p-4 text-sm text-red-300">Erro ao carregar dados</div>;

  return (
    <form onSubmit={onSubmit} className="fc-card fc-op-form space-y-4 p-4 pb-28">
      <div className="fc-op-form-header p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Controle Diário de Transporte</h2>
          <span className="fc-chip">Atividade: Romaneio</span>
        </div>
        <p className="mt-1 text-sm text-slate-400">Motorista: {user?.nome} | Veículo: {user?.veiculo_nome || "-"}</p>
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
        <p className="fc-op-section-title">Identificação</p>
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
      </div>
      <div className="fc-op-section fc-stagger">
        <p className="fc-op-section-title">Tipo de Transporte</p>
        <FormField label="Transporte">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Array.isArray(transportOptions) ? transportOptions : []).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, tipo_transporte: option }))}
                className={`fc-btn rounded-lg border px-3 py-2 text-sm ${
                  form.tipo_transporte === option
                  ? "border-blue-500 bg-blue-500/20 text-blue-100 fc-required-ok"
                  : "border-slate-700 text-slate-300"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </FormField>
      </div>
      <div className="fc-op-section fc-stagger">
        <p className="fc-op-section-title">Destino e Observação</p>
        <FormField label="Destino">
          <input
            className={`${inputClass} ${requiredChecks.destino ? "fc-required-ok" : "fc-required-pending"}`}
            value={form.destino}
            onChange={(e) => setForm({ ...form, destino: e.target.value })}
          />
        </FormField>
        <FormField label="Observação">
          <textarea className={inputClass} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
        </FormField>
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
      <SaveBar loading={loading} label="SALVAR ROMANEIO" />
    </form>
  );
}
