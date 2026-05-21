import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../services/auth";
import FormField, { inputClass } from "../components/FormField";
import { saveWithOffline } from "../services/syncService";
import SaveBar from "../components/SaveBar";
import { emitToast } from "../services/uiEvents";
import { generateId } from "../utils/id";
import api, { extractApiErrorMessage } from "../services/api";
import { nowLocalDateTimeString, toIsoWithCurrentTimeIfDateOnly } from "../utils/datetime";
import { parseDecimalInput } from "../utils/numberParse";

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
const PERIOD_PRESETS = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "ano", label: "Ano" },
];

const addDays = (ymd, delta) => {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

const formatMoneyBr = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
    valor_total: "",
    tipo_combustivel: "Diesel",
    horimetro: "",
    hodometro: "",
    veiculo_id: user?.veiculo_id || undefined,
  });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [fuelHistory, setFuelHistory] = useState([]);
  const [periodPreset, setPeriodPreset] = useState("semana");
  const [showForm, setShowForm] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const litrosInputRef = useRef(null);

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
    let active = true;
    (async () => {
      try {
        const { data } = await api.get("/app/historico");
        if (!active) return;
        const items = (Array.isArray(data?.items) ? data.items : []).filter((row) => row?.module === "combustiveis");
        setFuelHistory(items);
      } catch {
        if (active) setFuelHistory([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [feedback]);

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
            valor_total: String(record.payload?.valor_total ?? ""),
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

  useEffect(() => {
    if (!showForm) return;
    const timer = window.setTimeout(() => {
      litrosInputRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [showForm]);

  const requiredChecks = useMemo(() => {
    return {
      veiculo_id: Boolean(form.veiculo_id),
      litros: Boolean(form.litros),
      valor_total: Boolean(form.valor_total),
      tipo_combustivel: Boolean(form.tipo_combustivel),
    };
  }, [form.veiculo_id, form.litros, form.valor_total, form.tipo_combustivel]);

  const hasFormInteraction = useMemo(() => {
    return Boolean(
      String(form.litros || "").trim() ||
        String(form.valor_total || "").trim() ||
        String(form.horimetro || "").trim() ||
        String(form.hodometro || "").trim() ||
        Number(form.veiculo_id) > 0
    );
  }, [form.litros, form.valor_total, form.horimetro, form.hodometro, form.veiculo_id]);

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

  const fuelSummary = useMemo(() => {
    const toYmd = (raw) => String(raw || "").slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const periodStart =
      periodPreset === "hoje"
        ? today
        : periodPreset === "semana"
          ? addDays(today, -6)
          : periodPreset === "mes"
            ? `${today.slice(0, 7)}-01`
            : `${today.slice(0, 4)}-01-01`;
    const stats = {
      totalAbastecimentos: 0,
      litrosTotais: 0,
      valorTotal: 0,
      mediaLitro: 0,
    };
    for (const row of fuelHistory) {
      const payload = row?.payload || {};
      const ymd = toYmd(payload.data || payload.recorded_at_client || row?.updatedAt);
      const litros = Number(payload.litros || 0);
      const valor = Number(payload.valor_total || 0);
      if (ymd && ymd >= periodStart && ymd <= today) {
        stats.totalAbastecimentos += 1;
        stats.litrosTotais += litros;
        stats.valorTotal += valor;
      }
    }
    stats.mediaLitro = stats.litrosTotais > 0 ? stats.valorTotal / stats.litrosTotais : 0;
    return stats;
  }, [fuelHistory, periodPreset]);

  const fieldErrors = useMemo(() => {
    if (!submitAttempted) return {};
    const errors = {};
    const litrosNum = parseDecimalInput(form.litros);
    const valorNum = parseDecimalInput(form.valor_total);
    if (!form.veiculo_id) errors.veiculo_id = "Selecione o veículo.";
    if (!Number.isFinite(litrosNum) || litrosNum <= 0) errors.litros = "Informe litros maiores que zero.";
    if (!Number.isFinite(valorNum) || valorNum <= 0) errors.valor_total = "Informe o valor total maior que zero.";
    if (!String(form.tipo_combustivel || "").trim()) errors.tipo_combustivel = "Selecione o combustível.";
    return errors;
  }, [submitAttempted, form.veiculo_id, form.litros, form.valor_total, form.tipo_combustivel]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (!requiredChecks.veiculo_id) {
      emitToast("Selecione o veículo (modelo e placa) para registrar o abastecimento.", "warning");
      return;
    }
    const litrosNum = parseDecimalInput(form.litros);
    const valorTotalRaw = form.valor_total;
    if (
      valorTotalRaw === "" ||
      valorTotalRaw === undefined ||
      valorTotalRaw === null ||
      String(valorTotalRaw).trim() === ""
    ) {
      emitToast("Informe o valor total do abastecimento", "warning");
      return;
    }
    const valorNum = parseDecimalInput(form.valor_total);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      emitToast("Informe o valor total do abastecimento", "warning");
      return;
    }
    if (!Number.isFinite(litrosNum) || litrosNum <= 0) {
      emitToast("Informe a quantidade em litros (número maior que zero). Use ponto ou vírgula para decimais.", "warning");
      return;
    }
    setLoading(true);
    try {
      let editRecord = null;
      const editRaw = localStorage.getItem("fc_edit_record");
      if (editRaw) {
        try {
          editRecord = JSON.parse(editRaw);
        } catch {
          localStorage.removeItem("fc_edit_record");
        }
      }
      const executionDate = editRecord ? toIsoWithCurrentTimeIfDateOnly(form.data) : nowLocalDateTimeString();
      const tipoCombustivel = String(form.tipo_combustivel || "").trim() || "Diesel";
      const horimetroNum =
        form.horimetro === "" || form.horimetro === undefined || form.horimetro === null
          ? undefined
          : Number(form.horimetro);
      const hodometroNum =
        form.hodometro === "" || form.hodometro === undefined || form.hodometro === null
          ? undefined
          : Number(form.hodometro);

      let sourceId;
      let versionOf;
      if (!editRecord) {
        sourceId = generateId();
      } else if (isSyncedStatus(editRecord.status)) {
        sourceId = generateId();
        versionOf = editRecord.source_id;
      } else {
        sourceId = editRecord.source_id || form.source_id || generateId();
      }

      const payload = {
        source_id: sourceId,
        client_id: sourceId,
        ...(versionOf ? { version_of: versionOf } : {}),
        data: executionDate,
        recorded_at_client: executionDate,
        veiculo_id: Number(form.veiculo_id),
        tipo_combustivel: tipoCombustivel,
        litros: litrosNum,
        valor_total: Number(valorNum),
        veiculo_nome: selectedVehicle?.nome || user?.veiculo_nome || "",
        placa: selectedVehicle?.placa || user?.placa || "",
        ...(Number.isFinite(horimetroNum) ? { horimetro: horimetroNum } : {}),
        ...(Number.isFinite(hodometroNum) ? { hodometro: hodometroNum } : {}),
      };

      console.log(payload);

      const result = await saveWithOffline("combustiveis", payload);
      if (result.status === "error") {
        emitToast(
          extractApiErrorMessage(result.error) || "Não foi possível salvar o registro. Tente novamente.",
          "error"
        );
        return;
      }

      onSaved?.(result.status);
      setFeedback(result.status);
      if (result.status === "synced") {
        emitToast("Registro salvo com sucesso", "success");
      } else if (result.status === "pending" && result.apiMessage) {
        /* syncService já emitiu toast com a mensagem do servidor */
      } else if (result.status === "pending") {
        emitToast("Registro salvo com sucesso (pendente de sincronização)", "warning");
      } else if (result.status === "syncing") {
        emitToast("Falha na sincronização. Registro mantido pendente para retry.", "error");
      }
      localStorage.removeItem("fc_edit_record");
      localStorage.removeItem("fc_draft_combustivel");
      setForm((prev) => ({
        ...prev,
        source_id: generateId(),
        data: currentLocalDatetime(),
        litros: "",
        valor_total: "",
        horimetro: "",
        hodometro: "",
      }));
      setSubmitAttempted(false);
      setShowForm(false);
    } catch (err) {
      console.error(err);
      emitToast(
        extractApiErrorMessage(err) || "Erro ao salvar combustível. Verifique os dados e a ligação.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  if (initializing) return <div className="fc-card p-4 text-sm text-slate-300">Carregando...</div>;
  if (error) return <div className="fc-card p-4 text-sm text-red-300">Erro ao carregar dados</div>;

  return (
    <form onSubmit={submit} className="space-y-4 pb-28">
      <section className="fc-card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Combustível</h2>
          <span className="fc-chip">Atividade: Combustível</span>
        </div>
        <p className="mt-1 text-sm text-slate-400">Motorista: {user?.nome} | Equipamento: {user?.veiculo_nome || "-"}</p>
        <div className="flex flex-wrap gap-2">
          {PERIOD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setPeriodPreset(preset.id)}
              className={`fc-btn rounded-full border px-3 py-1.5 text-xs font-semibold ${
                periodPreset === preset.id
                  ? "border-blue-400/45 bg-blue-500/20 text-blue-100"
                  : "border-slate-700 bg-slate-900/70 text-slate-300"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section className="fc-card space-y-3 p-4">
        <p className="text-sm font-semibold text-slate-100">Visão do período</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Abastecimentos</p>
            <p className="mt-1 text-lg font-semibold text-white">{fuelSummary.totalAbastecimentos}</p>
          </div>
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Litros totais</p>
            <p className="mt-1 text-lg font-semibold text-white">{fuelSummary.litrosTotais.toFixed(1)}</p>
          </div>
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Valor total</p>
            <p className="mt-1 text-lg font-semibold text-white">{formatMoneyBr(fuelSummary.valorTotal)}</p>
          </div>
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-2.5">
            <p className="text-[11px] text-slate-400">Média R$/L</p>
            <p className="mt-1 text-lg font-semibold text-white">{formatMoneyBr(fuelSummary.mediaLitro)}</p>
          </div>
        </div>
      </section>

      <section className="fc-card space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-100">Lançamento</p>
          <button
            type="button"
            onClick={() => {
              setShowForm((prev) => !prev);
              setSubmitAttempted(false);
            }}
            className="fc-btn btn-primary rounded-lg px-3 py-2 text-sm"
          >
            {showForm ? "Fechar lançamento" : "+ Novo abastecimento"}
          </button>
        </div>

        {!showForm ? (
          <p className="text-sm text-slate-400">Toque em “+ Novo abastecimento” para registrar um novo lançamento.</p>
        ) : (
          <>
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
            className={inputClass}
            value={form.data}
            readOnly
          />
          <p className="mt-1 text-xs text-slate-400">
            Horário automático do celular no momento de salvar.
          </p>
        </FormField>
        <FormField label="Tipo combustível">
          <select
            className={`${inputClass} ${fieldErrors.tipo_combustivel ? "border-red-500/60" : ""}`}
            value={form.tipo_combustivel}
            onChange={(e) => setForm({ ...form, tipo_combustivel: e.target.value })}
          >
            <option>Diesel</option>
            <option>Gasolina</option>
            <option>Etanol</option>
          </select>
          {fieldErrors.tipo_combustivel ? <p className="mt-1 text-xs text-red-300">{fieldErrors.tipo_combustivel}</p> : null}
        </FormField>
        </div>
      </div>
      <div className="fc-op-section fc-stagger">
        <p className="fc-op-section-title">Veículo Abastecido</p>
        <FormField label="Selecione o veículo">
          <select
            className={`${inputClass} ${fieldErrors.veiculo_id ? "border-red-500/60" : ""}`}
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
          {fieldErrors.veiculo_id ? <p className="mt-1 text-xs text-red-300">{fieldErrors.veiculo_id}</p> : null}
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField label="Quantidade (L)">
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            ref={litrosInputRef}
            className={`${inputClass} ${fieldErrors.litros ? "border-red-500/60" : ""}`}
            value={form.litros}
            onChange={(e) => setForm({ ...form, litros: e.target.value })}
          />
          {fieldErrors.litros ? <p className="mt-1 text-xs text-red-300">{fieldErrors.litros}</p> : null}
        </FormField>
        <FormField label="Valor total (R$)">
          <input
            type="number"
            name="valor_total"
            required
            min="0"
            step="0.01"
            inputMode="decimal"
            className={`${inputClass} ${fieldErrors.valor_total ? "border-red-500/60" : ""}`}
            value={form.valor_total}
            onChange={(e) => setForm({ ...form, valor_total: e.target.value })}
          />
          {fieldErrors.valor_total ? <p className="mt-1 text-xs text-red-300">{fieldErrors.valor_total}</p> : null}
          {Number(form.litros) > 0 && Number(form.valor_total) > 0 ? (
            <p className="mt-1 text-xs text-slate-400">
              Preço por litro (calculado):{" "}
              <strong className="text-slate-200">
                {(Number(form.valor_total) / Number(form.litros)).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 3,
                })}
              </strong>
            </p>
          ) : null}
        </FormField>
        <FormField label="Horímetro">
          <input className={inputClass} value={form.horimetro} onChange={(e) => setForm({ ...form, horimetro: e.target.value })} />
        </FormField>
        <FormField label="Hodômetro">
          <input className={inputClass} value={form.hodometro} onChange={(e) => setForm({ ...form, hodometro: e.target.value })} />
        </FormField>
        </div>
      </div>
          </>
        )}
      </section>
      {showForm && hasFormInteraction ? <SaveBar loading={loading} label="SALVAR ABASTECIMENTO" /> : null}
    </form>
  );
}
