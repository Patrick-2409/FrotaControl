import { useEffect, useMemo, useState } from "react";
import FormField, { inputClass } from "../components/FormField";
import { saveWithOffline } from "../services/syncService";
import { useAuth } from "../services/auth";
import SaveBar from "../components/SaveBar";
import { emitToast } from "../services/uiEvents";
import { generateId } from "../utils/id";
import api from "../services/api";
import { nowLocalDateTimeString, toIsoWithCurrentTimeIfDateOnly } from "../utils/datetime";

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

export default function ParteDiariaPage({ onSaved }) {
  const { user } = useAuth();
  const draftKey = `fc_draft_parte_${user?.id || "anon"}`;
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
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
          contratado: user?.empresa_nome || draft.contratado || "",
          operador: user?.nome || draft.operador || "",
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
  }, []);

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
  }, [vehicles, user?.veiculo_id, user?.veiculo_nome, user?.placa]);

  const selectedVehicle = useMemo(
    () => vehicleOptions.find((vehicle) => Number(vehicle.id) === Number(form.veiculo_id)),
    [vehicleOptions, form.veiculo_id]
  );

  const hasMultipleVehicles = vehicleOptions.length > 1;

  useEffect(() => {
    if (form.veiculo_id || !vehicleOptions.length) return;
    const defaultVehicle = vehicleOptions.find((v) => v.linked) || vehicleOptions[0];
    if (!defaultVehicle) return;
    onVehicleChange(String(defaultVehicle.id));
  }, [vehicleOptions, form.veiculo_id]);

  const onVehicleChange = (rawId) => {
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
  };

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
      const payload = {
        ...form,
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
      console.log("ParteDiaria payload:", payload);
      const result = await saveWithOffline("parteDiaria", payload);
      console.log("ParteDiaria response:", result);
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
      setForm((prev) => ({
        ...prev,
        source_id: generateId(),
        data: currentLocalDatetime(),
      }));
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar dados");
      emitToast("Erro ao salvar parte diária.", "error");
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
          <h2 className="text-lg font-semibold text-white">Parte Diária de Equipamento</h2>
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
      <SaveBar loading={loading} label="SALVAR PARTE DIÁRIA" />
    </form>
  );
}
