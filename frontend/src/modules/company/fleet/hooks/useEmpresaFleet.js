import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../../../services/api";
import { fleetErrorMessage, fleetGet, FLEET_LOAD_ERROR } from "../utils/fleetApi";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const STATUS_OPTS = [
  { value: "", label: "Todos os status" },
  { value: "ativo", label: "Ativo" },
  { value: "operacao", label: "Em operação" },
  { value: "manutencao", label: "Manutenção" },
  { value: "indisponivel", label: "Indisponível" },
  { value: "parado", label: "Parado" },
];

const emptyVehicleForm = () => ({
  nome: "",
  placa: "",
  marca: "",
  modelo: "",
  tipo: "",
  categoria: "",
  ano: "",
  renavam: "",
  chassi: "",
  combustivel_principal: "",
  capacidade_litros: "",
  capacidade_ton: "",
  capacidade_esteril_ton: "",
  capacidade_rocha_ton: "",
  transporta_esteril: false,
  transporta_rocha: false,
  horimetro_atual: "",
  hodometro_atual: "",
  usa_para_transporte: false,
  status_operacional: "ativo",
  doc_revisao_validade: "",
  doc_licenciamento_validade: "",
  doc_seguro_validade: "",
  doc_inspecao_validade: "",
  manutencao_agendar_ate: "",
  fleet_telemetry_meta: {},
});

function rowToForm(v) {
  const f = emptyVehicleForm();
  if (!v) return f;
  const hasSpecificCapacity = v.capacidade_esteril_ton != null || v.capacidade_rocha_ton != null;
  const transportaEsteril =
    v.transporta_esteril != null
      ? Boolean(v.transporta_esteril)
      : hasSpecificCapacity
        ? v.capacidade_esteril_ton != null
        : v.capacidade_ton != null;
  const transportaRocha =
    v.transporta_rocha != null
      ? Boolean(v.transporta_rocha)
      : hasSpecificCapacity
        ? v.capacidade_rocha_ton != null
        : v.capacidade_ton != null;
  const ymd = (d) => {
    if (!d) return "";
    const s = String(d).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  };
  return {
    ...f,
    nome: v.nome || "",
    placa: v.placa || "",
    marca: v.marca || "",
    modelo: v.modelo || "",
    tipo: v.tipo || "",
    categoria: v.categoria || "",
    ano: v.ano != null ? String(v.ano) : "",
    renavam: v.renavam || "",
    chassi: v.chassi || "",
    combustivel_principal: v.combustivel_principal || "",
    capacidade_litros: v.capacidade_litros != null ? String(v.capacidade_litros) : "",
    capacidade_ton: v.capacidade_ton != null ? String(v.capacidade_ton) : "",
    capacidade_esteril_ton:
      v.capacidade_esteril_ton != null
        ? String(v.capacidade_esteril_ton)
        : !hasSpecificCapacity && v.capacidade_ton != null
          ? String(v.capacidade_ton)
          : "",
    capacidade_rocha_ton:
      v.capacidade_rocha_ton != null
        ? String(v.capacidade_rocha_ton)
        : !hasSpecificCapacity && v.capacidade_ton != null
          ? String(v.capacidade_ton)
          : "",
    transporta_esteril: transportaEsteril,
    transporta_rocha: transportaRocha,
    horimetro_atual: v.horimetro_atual != null ? String(v.horimetro_atual) : "",
    hodometro_atual: v.hodometro_atual != null ? String(v.hodometro_atual) : "",
    usa_para_transporte: Boolean(v.usa_para_transporte),
    status_operacional: v.status_operacional || "ativo",
    doc_revisao_validade: ymd(v.doc_revisao_validade),
    doc_licenciamento_validade: ymd(v.doc_licenciamento_validade),
    doc_seguro_validade: ymd(v.doc_seguro_validade),
    doc_inspecao_validade: ymd(v.doc_inspecao_validade),
    manutencao_agendar_ate: ymd(v.manutencao_agendar_ate),
    fleet_telemetry_meta:
      v.fleet_telemetry_meta && typeof v.fleet_telemetry_meta === "object" ? v.fleet_telemetry_meta : {},
  };
}

function formToPayload(form) {
  const num = (x) => {
    const s = String(x ?? "").trim();
    if (!s) return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const intOrNull = (x) => {
    const s = String(x ?? "").trim();
    if (!s) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  };
  const usa = Boolean(form.usa_para_transporte);
  const transportaEsteril = usa && Boolean(form.transporta_esteril);
  const transportaRocha = usa && Boolean(form.transporta_rocha);
  const capacidadeEsterilTon = num(form.capacidade_esteril_ton);
  const capacidadeRochaTon = num(form.capacidade_rocha_ton);
  return {
    nome: form.nome.trim(),
    placa: form.placa.trim(),
    marca: form.marca.trim() || null,
    modelo: form.modelo.trim() || null,
    tipo: form.tipo.trim() || null,
    categoria: form.categoria.trim() || null,
    ano: intOrNull(form.ano),
    renavam: form.renavam.trim() || null,
    chassi: form.chassi.trim() || null,
    combustivel_principal: form.combustivel_principal.trim() || null,
    capacidade_litros: num(form.capacidade_litros),
    capacidade_ton: usa ? (transportaEsteril ? capacidadeEsterilTon : null) ?? (transportaRocha ? capacidadeRochaTon : null) ?? num(form.capacidade_ton) : null,
    transporta_esteril: transportaEsteril,
    transporta_rocha: transportaRocha,
    capacidade_esteril_ton: transportaEsteril ? capacidadeEsterilTon : null,
    capacidade_rocha_ton: transportaRocha ? capacidadeRochaTon : null,
    horimetro_atual: num(form.horimetro_atual),
    hodometro_atual: num(form.hodometro_atual),
    usa_para_transporte: usa,
    status_operacional: form.status_operacional,
    doc_revisao_validade: form.doc_revisao_validade || null,
    doc_licenciamento_validade: form.doc_licenciamento_validade || null,
    doc_seguro_validade: form.doc_seguro_validade || null,
    doc_inspecao_validade: form.doc_inspecao_validade || null,
    manutencao_agendar_ate: form.manutencao_agendar_ate || null,
    fleet_telemetry_meta: form.fleet_telemetry_meta || {},
  };
}

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const codigoLabel = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(n).padStart(2, "0") : "-";
};

const materialLabel = (vehicle) => {
  const parts = [];
  const hasSpecificCapacity = vehicle.capacidade_esteril_ton != null || vehicle.capacidade_rocha_ton != null;
  const transportaEsteril =
    vehicle.transporta_esteril != null
      ? Boolean(vehicle.transporta_esteril)
      : hasSpecificCapacity
        ? vehicle.capacidade_esteril_ton != null
        : vehicle.capacidade_ton != null;
  const transportaRocha =
    vehicle.transporta_rocha != null
      ? Boolean(vehicle.transporta_rocha)
      : hasSpecificCapacity
        ? vehicle.capacidade_rocha_ton != null
        : vehicle.capacidade_ton != null;
  const capacidadeEsteril = hasSpecificCapacity ? vehicle.capacidade_esteril_ton : vehicle.capacidade_ton;
  const capacidadeRocha = hasSpecificCapacity ? vehicle.capacidade_rocha_ton : vehicle.capacidade_ton;
  if (transportaEsteril && capacidadeEsteril != null) {
    parts.push(`Estéril ${Number(capacidadeEsteril).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`);
  }
  if (transportaRocha && capacidadeRocha != null) {
    parts.push(`Rocha ${Number(capacidadeRocha).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`);
  }
  return parts.length ? parts.join(" / ") : "Não configurado";
};

const motoristasLabel = (vehicle) => {
  const linked = Array.isArray(vehicle.motoristas_vinculados) ? vehicle.motoristas_vinculados : [];
  if (linked.length) {
    return linked.map((m) => `${m.nome || "Motorista"}${m.is_principal ? " (principal)" : ""}`).join(", ");
  }
  return vehicle.motorista_nome || "-";
};

const buildPrintableFleetHtml = (vehicles, filtros = {}) => {
  const data = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const filtroTexto = [
    filtros.search ? `Busca: ${filtros.search}` : null,
    filtros.status ? `Status: ${filtros.status}` : null,
    filtros.tipo ? `Tipo: ${filtros.tipo}` : null,
  ].filter(Boolean).join(" · ") || "Todos os veículos";
  const rows = vehicles
    .map((v) => `
      <tr>
        <td class="code">#${escapeHtml(codigoLabel(v.codigo_operacional))}</td>
        <td><strong>${escapeHtml(v.placa || "-")}</strong><br><span>${escapeHtml(v.nome || "-")}</span></td>
        <td>${escapeHtml(motoristasLabel(v))}</td>
        <td>${escapeHtml(materialLabel(v))}</td>
        <td>${escapeHtml([v.tipo, v.categoria].filter(Boolean).join(" · ") || "-")}</td>
      </tr>
    `)
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relação de veículos - FrotaMax</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Arial, sans-serif; }
    header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 22px; }
    p { margin: 4px 0 0; color: #4b5563; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #111827; color: #fff; text-align: left; padding: 8px; }
    td { border-bottom: 1px solid #d1d5db; padding: 8px; vertical-align: top; }
    .code { width: 56px; font-size: 18px; font-weight: 800; color: #92400e; white-space: nowrap; }
    span { color: #6b7280; }
    footer { margin-top: 14px; color: #6b7280; font-size: 10px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Relação de veículos e motoristas</h1>
      <p>${escapeHtml(filtroTexto)}</p>
    </div>
    <div>
      <p>FrotaMax</p>
      <p>Emitido em ${escapeHtml(data)}</p>
    </div>
  </header>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Veículo</th>
        <th>Motorista(s)</th>
        <th>Materiais autorizados</th>
        <th>Tipo / categoria</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="5">Nenhum veículo encontrado.</td></tr>'}</tbody>
  </table>
  <footer>Use o ID operacional no PWA do apontador para selecionar rapidamente o veículo correto.</footer>
</body>
</html>`;
};

export function useEmpresaFleet() {
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  const [vehicles, setVehicles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [selected, setSelected] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState(emptyVehicleForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [maintItems, setMaintItems] = useState([]);
  const [maintLoading, setMaintLoading] = useState(false);
  const [maintForm, setMaintForm] = useState({
    tipo: "preventiva",
    titulo: "",
    descricao: "",
    custo: "",
    data_servico: new Date().toISOString().slice(0, 10),
    odometro_snapshot: "",
  });
  const [maintSaving, setMaintSaving] = useState(false);

  const vehiclesReqRef = useRef(0);
  const summaryReqRef = useRef(0);
  const summaryLoadedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => clearTimeout(t);
  }, [search]);

  const loadSummary = useCallback(async () => {
    const reqId = ++summaryReqRef.current;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const { data } = await fleetGet("/dashboard/fleet/summary", { label: "fetch-fleet-summary" });
      if (reqId !== summaryReqRef.current) return;
      setSummary(data?.summary ?? null);
    } catch (e) {
      if (reqId !== summaryReqRef.current) return;
      if (e?.code === "ECONNABORTED" || String(e?.message || "").toLowerCase().includes("timeout")) {
        setSummary({
          total_veiculos: 0,
          disponiveis_operacao: 0,
          por_status: {},
          documentacao_janela_45d: 0,
          manutencao_fila_30d: 0,
          manutencoes_registradas: 0,
          consumo_medio_litros_100km: null,
          veiculos_sem_movimento_14d: null,
        });
        setSummaryError(null);
      } else {
        setSummaryError(fleetErrorMessage(e, FLEET_LOAD_ERROR));
        setSummary(null);
      }
    } finally {
      if (reqId === summaryReqRef.current) setSummaryLoading(false);
    }
  }, []);

  const loadVehicles = useCallback(async () => {
    const reqId = ++vehiclesReqRef.current;
    setListLoading(true);
    setListError(null);
    try {
      const { data } = await fleetGet("/dashboard/manage/vehicles", {
        label: "fetch-veiculos",
        params: {
          page,
          limit: 20,
          search: debouncedSearch,
          status_operacional: statusFilter || undefined,
          tipo: tipoFilter || undefined,
        },
      });
      if (reqId !== vehiclesReqRef.current) return;
      setVehicles(data?.items ?? []);
      setTotal(Number(data?.total ?? 0));
      setTotalPages(Number(data?.totalPages ?? 1));
    } catch (e) {
      if (reqId !== vehiclesReqRef.current) return;
      setListError(fleetErrorMessage(e, FLEET_LOAD_ERROR));
      setVehicles([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      if (reqId === vehiclesReqRef.current) setListLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, tipoFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (import.meta.env.DEV) console.time("fetch-frota");
      await loadVehicles();
      if (cancelled) return;
      if (!summaryLoadedRef.current) {
        summaryLoadedRef.current = true;
        await loadSummary();
      }
      if (import.meta.env.DEV) console.timeEnd("fetch-frota");
    })();
    return () => {
      cancelled = true;
      vehiclesReqRef.current += 1;
    };
  }, [loadVehicles, loadSummary]);

  const openCreate = useCallback(() => {
    setSelected(null);
    setForm(emptyVehicleForm());
    setSaveError(null);
    setMaintItems([]);
    setPanelOpen(true);
  }, []);

  const openEdit = useCallback((v) => {
    setSelected(v);
    setForm(rowToForm(v));
    setSaveError(null);
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setSelected(null);
  }, []);

  const loadMaintenance = useCallback(async (vehicleId) => {
    if (!vehicleId) {
      setMaintItems([]);
      return;
    }
    setMaintLoading(true);
    try {
      const { data } = await fleetGet(`/dashboard/fleet/vehicles/${vehicleId}/maintenance`, {
        label: "fetch-fleet-manutencao",
      });
      setMaintItems(data?.items ?? []);
    } catch {
      setMaintItems([]);
    } finally {
      setMaintLoading(false);
    }
  }, []);

  useEffect(() => {
    const vehicleId = selected?.id;
    if (panelOpen && vehicleId) loadMaintenance(vehicleId);
    else if (!panelOpen || !vehicleId) setMaintItems([]);
  }, [panelOpen, selected?.id, loadMaintenance]);

  const saveVehicle = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = formToPayload(form);
      if (selected?.id) {
        await api.put(`/dashboard/manage/vehicles/${selected.id}`, payload);
      } else {
        await api.post("/dashboard/manage/vehicles", payload);
      }
      await loadVehicles();
      await loadSummary();
      closePanel();
    } catch (e) {
      setSaveError(fleetErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [form, selected, loadVehicles, loadSummary, closePanel]);

  const deleteVehicle = useCallback(
    async (id) => {
      if (!id) return;
      try {
        await api.delete(`/dashboard/manage/vehicles/${id}`);
        await loadVehicles();
        await loadSummary();
        if (selected?.id === id) closePanel();
      } catch {
        /* toast opcional */
      }
    },
    [loadVehicles, loadSummary, selected, closePanel]
  );

  const addMaintenance = useCallback(async () => {
    if (!selected?.id) return;
    setMaintSaving(true);
    try {
      const custoRaw = String(maintForm.custo || "").trim();
      const odoRaw = String(maintForm.odometro_snapshot || "").trim();
      await api.post(`/dashboard/fleet/vehicles/${selected.id}/maintenance`, {
        tipo: maintForm.tipo,
        titulo: maintForm.titulo.trim(),
        descricao: maintForm.descricao.trim() || null,
        custo: custoRaw ? Number(custoRaw.replace(",", ".")) : null,
        data_servico: maintForm.data_servico,
        odometro_snapshot: odoRaw ? Number(odoRaw.replace(",", ".")) : null,
      });
      setMaintForm((f) => ({
        ...f,
        titulo: "",
        descricao: "",
        custo: "",
        odometro_snapshot: "",
      }));
      await loadMaintenance(selected.id);
      await loadSummary();
    } finally {
      setMaintSaving(false);
    }
  }, [selected, maintForm, loadMaintenance, loadSummary]);

  const removeMaintenance = useCallback(
    async (mid) => {
      if (!selected?.id || !mid) return;
      try {
        await api.delete(`/dashboard/fleet/maintenance/${mid}`);
        await loadMaintenance(selected.id);
        await loadSummary();
      } catch {
        /* */
      }
    },
    [selected, loadMaintenance, loadSummary]
  );

  const downloadFleetCsv = useCallback(async () => {
    const { data } = await api.get("/dashboard/fleet/export/vehicles.csv", {
      params: {
        search: debouncedSearch || undefined,
        status_operacional: statusFilter || undefined,
        tipo: tipoFilter || undefined,
      },
      responseType: "blob",
    });
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "frota_veiculos.csv";
    a.rel = "noopener";
    a.click();
    URL.revokeObjectURL(url);
  }, [debouncedSearch, statusFilter, tipoFilter]);

  const printFleetAssignments = useCallback(async () => {
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
    if (!printWindow) {
      throw new Error("Não foi possível abrir a janela de impressão.");
    }
    printWindow.document.write("<p>Preparando relação de veículos...</p>");
    const { data } = await fleetGet("/dashboard/manage/vehicles", {
      label: "print-veiculos",
      params: {
        page: 1,
        limit: 1000,
        search: debouncedSearch || undefined,
        status_operacional: statusFilter || undefined,
        tipo: tipoFilter || undefined,
      },
    });
    const html = buildPrintableFleetHtml(data?.items ?? [], {
      search: debouncedSearch,
      status: statusFilter,
      tipo: tipoFilter,
    });
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  }, [debouncedSearch, statusFilter, tipoFilter]);

  return {
    fmtInt,
    STATUS_OPTS,
    summary,
    summaryLoading,
    summaryError,
    refetchSummary: loadSummary,
    vehicles,
    total,
    page,
    setPage,
    totalPages,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    tipoFilter,
    setTipoFilter,
    listLoading,
    listError,
    refetchVehicles: loadVehicles,
    selected,
    panelOpen,
    form,
    setForm,
    saving,
    saveError,
    openCreate,
    openEdit,
    closePanel,
    saveVehicle,
    deleteVehicle,
    maintItems,
    maintLoading,
    maintForm,
    setMaintForm,
    maintSaving,
    addMaintenance,
    removeMaintenance,
    downloadFleetCsv,
    printFleetAssignments,
  };
}
