import { useCallback, useEffect, useState } from "react";
import api, { extractApiErrorMessage, getFriendlyApiErrorMessage } from "../../../../services/api";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const ROLE_OPTS = [
  { value: "", label: "Todos os papéis" },
  { value: "MOTORISTA", label: "Motoristas" },
  { value: "APONTADOR", label: "Apontadores" },
  { value: "ADMIN_EMPRESA", label: "Administradores" },
];

const STATUS_OPTS = [
  { value: "", label: "Todos os status" },
  { value: "ativo", label: "Ativo" },
  { value: "afastado", label: "Afastado" },
  { value: "suspenso", label: "Suspenso" },
];

const emptyPersonForm = () => ({
  nome: "",
  email: "",
  cpf_id: "",
  senha: "",
  role: "MOTORISTA",
  veiculo_id: "",
  profile_image_url: "",
  funcao: "",
  cnh_categoria: "",
  cnh_numero: "",
  cnh_validade: "",
  treinamentos: [],
  observacoes: "",
  equipamento_vinculo: "",
  operacao_escopo: "",
  status_operacional: "ativo",
});

function rowToForm(u) {
  const f = emptyPersonForm();
  if (!u) return f;
  const ymd = (d) => {
    if (!d) return "";
    if (typeof d === "string") return d.slice(0, 10);
    try {
      return new Date(d).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  };
  let tr = [];
  if (Array.isArray(u.treinamentos)) tr = u.treinamentos;
  return {
    ...f,
    nome: u.nome || "",
    email: u.email || "",
    cpf_id: u.cpf_id || "",
    role: u.role || "MOTORISTA",
    veiculo_id: u.veiculo_id != null ? String(u.veiculo_id) : "",
    profile_image_url: u.profile_image_url || "",
    funcao: u.funcao || "",
    cnh_categoria: u.cnh_categoria || "",
    cnh_numero: u.cnh_numero || "",
    cnh_validade: ymd(u.cnh_validade),
    treinamentos: tr.map((t) => ({
      titulo: t.titulo || "",
      validade: t.validade ? ymd(t.validade) : "",
    })),
    observacoes: u.observacoes || "",
    equipamento_vinculo: u.equipamento_vinculo || "",
    operacao_escopo: u.operacao_escopo || "",
    status_operacional: u.status_operacional || "ativo",
  };
}

function formToPayload(form, { includePassword } = {}) {
  const veiculoRaw = String(form.veiculo_id || "").trim();
  const veiculo_id =
    form.role === "MOTORISTA" && veiculoRaw ? Number(veiculoRaw) : form.role === "MOTORISTA" ? null : null;
  const out = {
    nome: form.nome.trim(),
    email: form.email.trim() || undefined,
    cpf_id: form.cpf_id.trim(),
    role: form.role,
    veiculo_id: form.role === "MOTORISTA" ? veiculo_id : null,
    profile_image_url: form.profile_image_url.trim() || undefined,
    funcao: form.funcao.trim() || undefined,
    cnh_categoria: form.cnh_categoria.trim() || undefined,
    cnh_numero: form.cnh_numero.trim() || undefined,
    cnh_validade: form.cnh_validade || undefined,
    treinamentos: (form.treinamentos || [])
      .filter((t) => String(t.titulo || "").trim())
      .map((t) => ({
        titulo: String(t.titulo).trim(),
        validade: t.validade || null,
      })),
    observacoes: form.observacoes.trim() || undefined,
    equipamento_vinculo: form.equipamento_vinculo.trim() || undefined,
    operacao_escopo: form.operacao_escopo.trim() || undefined,
    status_operacional: form.status_operacional,
  };
  if (includePassword && String(form.senha || "").trim()) {
    out.senha = form.senha;
  }
  return out;
}

export function useEmpresaPeople() {
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  const [prod, setProd] = useState([]);
  const [prodLoading, setProdLoading] = useState(true);
  const [prodError, setProdError] = useState(null);

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [vehicles, setVehicles] = useState([]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyPersonForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => clearTimeout(t);
  }, [search]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const { data } = await api.get("/dashboard/people/summary");
      setSummary(data?.summary ?? null);
    } catch (e) {
      setSummaryError(getFriendlyApiErrorMessage(e) || extractApiErrorMessage(e));
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadProductivity = useCallback(async () => {
    setProdLoading(true);
    setProdError(null);
    try {
      const { data } = await api.get("/dashboard/people/productivity", { params: { days: 30, limit: 50 } });
      setProd(data?.items ?? []);
    } catch (e) {
      setProdError(getFriendlyApiErrorMessage(e) || extractApiErrorMessage(e));
      setProd([]);
    } finally {
      setProdLoading(false);
    }
  }, []);

  const loadVehicles = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/manage/vehicles", { params: { page: 1, limit: 300, search: "" } });
      setVehicles(data?.items ?? []);
    } catch {
      setVehicles([]);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const { data } = await api.get("/dashboard/manage/users", {
        params: {
          page,
          limit: 20,
          search: debouncedSearch,
          role: roleFilter || undefined,
          status_operacional: statusFilter || undefined,
        },
      });
      setUsers(data?.items ?? []);
      setTotal(Number(data?.total ?? 0));
      setTotalPages(Number(data?.totalPages ?? 1));
    } catch (e) {
      setListError(getFriendlyApiErrorMessage(e) || extractApiErrorMessage(e));
      setUsers([]);
    } finally {
      setListLoading(false);
    }
  }, [page, debouncedSearch, roleFilter, statusFilter]);

  useEffect(() => {
    loadSummary();
    loadProductivity();
    loadVehicles();
  }, [loadSummary, loadProductivity, loadVehicles]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openEdit = useCallback((u) => {
    setSelected(u);
    setForm(rowToForm(u));
    setSaveError(null);
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setSelected(null);
  }, []);

  const savePerson = useCallback(async () => {
    if (!selected?.id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = formToPayload(form, { includePassword: true });
      await api.put(`/dashboard/manage/users/${selected.id}`, payload);
      await loadUsers();
      await loadSummary();
      await loadProductivity();
      closePanel();
    } catch (e) {
      setSaveError(getFriendlyApiErrorMessage(e) || extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [form, selected, loadUsers, loadSummary, loadProductivity, closePanel]);

  const addTreinoRow = useCallback(() => {
    setForm((f) => ({ ...f, treinamentos: [...(f.treinamentos || []), { titulo: "", validade: "" }] }));
  }, []);

  const removeTreinoRow = useCallback((idx) => {
    setForm((f) => ({
      ...f,
      treinamentos: (f.treinamentos || []).filter((_, i) => i !== idx),
    }));
  }, []);

  return {
    fmtInt,
    ROLE_OPTS,
    STATUS_OPTS,
    summary,
    summaryLoading,
    summaryError,
    refetchSummary: loadSummary,
    prod,
    prodLoading,
    prodError,
    refetchProd: loadProductivity,
    users,
    total,
    page,
    setPage,
    totalPages,
    search,
    setSearch,
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    listLoading,
    listError,
    refetchUsers: loadUsers,
    vehicles,
    panelOpen,
    form,
    setForm,
    selected,
    saving,
    saveError,
    openEdit,
    closePanel,
    savePerson,
    addTreinoRow,
    removeTreinoRow,
  };
}
