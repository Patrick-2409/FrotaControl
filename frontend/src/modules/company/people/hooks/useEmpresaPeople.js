import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { getFriendlyApiErrorMessage, extractApiErrorMessage } from "../../../../services/api";
import { computeRiscoDisplayMetrics, splitRiscoCadastroLists } from "../../../../utils/riscoOperacional";
import { peopleErrorMessage, peopleGet, PEOPLE_LOAD_ERROR } from "../utils/peopleApi";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export const PEOPLE_ROLE_FILTER_OPTS = [
  { value: "", label: "Todos" },
  { value: "MOTORISTA", label: "Motoristas" },
  { value: "APONTADOR", label: "Apontadores" },
  { value: "ADMIN_EMPRESA", label: "Administradores" },
];

const ROLE_OPTS = PEOPLE_ROLE_FILTER_OPTS;

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
  const isMotorista = form.role === "MOTORISTA";
  const out = {
    nome: form.nome.trim(),
    email: form.email.trim() || undefined,
    cpf_id: form.cpf_id.trim(),
    role: form.role,
    veiculo_id: isMotorista ? veiculo_id : null,
    profile_image_url: form.profile_image_url.trim() || undefined,
    funcao: form.funcao.trim() || undefined,
    cnh_categoria: isMotorista ? form.cnh_categoria.trim() || undefined : null,
    cnh_numero: isMotorista ? form.cnh_numero.trim() || undefined : null,
    cnh_validade: isMotorista ? form.cnh_validade || undefined : null,
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
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [vehiclesPicklistLoading, setVehiclesPicklistLoading] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyPersonForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [riscoDisplay, setRiscoDisplay] = useState(null);
  const [prod7d, setProd7d] = useState([]);
  const [riscoListFilter, setRiscoListFilter] = useState(false);
  const [riscoMotoristaIds, setRiscoMotoristaIds] = useState(() => new Set());
  const [riscoFilterLoading, setRiscoFilterLoading] = useState(false);

  const usersReqRef = useRef(0);
  const dashboardReqRef = useRef(0);
  const dashboardLoadedRef = useRef(false);
  const riscoUrlInitRef = useRef(false);
  const vehiclesPicklistLoadedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => clearTimeout(t);
  }, [search]);

  const loadUsers = useCallback(async () => {
    const reqId = ++usersReqRef.current;
    setListLoading(true);
    setListError(null);
    try {
      const { data } = await peopleGet("/dashboard/manage/users", {
        label: "fetch-pessoas-usuarios",
        params: {
          page,
          limit: 20,
          search: debouncedSearch,
          role: roleFilter || undefined,
          status_operacional: statusFilter || undefined,
        },
      });
      if (reqId !== usersReqRef.current) return;
      setUsers(data?.items ?? []);
      setTotal(Number(data?.total ?? 0));
      setTotalPages(Number(data?.totalPages ?? 1));
    } catch (e) {
      if (reqId !== usersReqRef.current) return;
      setListError(peopleErrorMessage(e, PEOPLE_LOAD_ERROR));
      setUsers([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      if (reqId === usersReqRef.current) setListLoading(false);
    }
  }, [page, debouncedSearch, roleFilter, statusFilter]);

  const loadDashboard = useCallback(async () => {
    const reqId = ++dashboardReqRef.current;
    setSummaryLoading(true);
    setProdLoading(true);
    setSummaryError(null);
    setProdError(null);
    try {
      const [summaryRes, prodRes] = await Promise.all([
        peopleGet("/dashboard/people/summary", { label: "fetch-pessoas-summary" }),
        peopleGet("/dashboard/people/productivity", {
          label: "fetch-pessoas-prod",
          params: { days: 30, limit: 50, with_7d: 1 },
        }),
      ]);
      if (reqId !== dashboardReqRef.current) return;
      const summaryData = summaryRes.data?.summary ?? null;
      const prodItems = prodRes.data?.items ?? [];
      const items7d = prodItems.map((row) => ({
        ...row,
        romaneios: Number(row.romaneios_7d ?? row.romaneios ?? 0),
        partes_diaria: Number(row.partes_diaria_7d ?? row.partes_diaria ?? 0),
      }));
      setSummary(summaryData);
      setProd(prodItems);
      setProd7d(items7d);
      setRiscoDisplay(computeRiscoDisplayMetrics(summaryData, items7d, []));
    } catch (e) {
      if (reqId !== dashboardReqRef.current) return;
      const msg = peopleErrorMessage(e, PEOPLE_LOAD_ERROR);
      setSummaryError(msg);
      setProdError(msg);
      setSummary(null);
      setProd([]);
      setProd7d([]);
      setRiscoDisplay(null);
    } finally {
      if (reqId === dashboardReqRef.current) {
        setSummaryLoading(false);
        setProdLoading(false);
      }
    }
  }, []);

  const loadVehiclesPicklist = useCallback(async () => {
    if (vehiclesPicklistLoadedRef.current && vehicles.length > 0) return;
    setVehiclesPicklistLoading(true);
    try {
      const { data } = await peopleGet("/dashboard/manage/vehicles", {
        label: "fetch-pessoas-veiculos-picklist",
        params: { page: 1, limit: 50, search: "" },
      });
      setVehicles(data?.items ?? []);
      vehiclesPicklistLoadedRef.current = true;
    } catch {
      setVehicles([]);
    } finally {
      setVehiclesPicklistLoading(false);
    }
  }, [vehicles.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (import.meta.env.DEV) console.time("fetch-pessoas");
      await loadUsers();
      if (cancelled) return;
      if (!dashboardLoadedRef.current) {
        dashboardLoadedRef.current = true;
        await loadDashboard();
      }
      if (import.meta.env.DEV) console.timeEnd("fetch-pessoas");
    })();
    return () => {
      cancelled = true;
      usersReqRef.current += 1;
    };
  }, [loadUsers, loadDashboard]);

  useEffect(() => {
    if (!panelOpen) return;
    loadVehiclesPicklist();
  }, [panelOpen, loadVehiclesPicklist]);

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
      await loadDashboard();
      closePanel();
    } catch (e) {
      setSaveError(getFriendlyApiErrorMessage(e) || extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [form, selected, loadUsers, loadDashboard, closePanel]);

  const addTreinoRow = useCallback(() => {
    setForm((f) => ({ ...f, treinamentos: [...(f.treinamentos || []), { titulo: "", validade: "" }] }));
  }, []);

  const removeTreinoRow = useCallback((idx) => {
    setForm((f) => ({
      ...f,
      treinamentos: (f.treinamentos || []).filter((_, i) => i !== idx),
    }));
  }, []);

  const applyRiscoOperacionalFilter = useCallback(async () => {
    setRiscoFilterLoading(true);
    try {
      let ids = riscoDisplay?.riscoMotoristaIds;
      let items7d = prod7d;
      if (!ids?.size || !items7d.length) {
        const prodRes = await peopleGet("/dashboard/people/productivity", {
          label: "fetch-pessoas-prod-7d",
          params: { days: 30, limit: 50, with_7d: 1 },
        });
        const raw = prodRes.data?.items ?? [];
        items7d = raw.map((row) => ({
          ...row,
          romaneios: Number(row.romaneios_7d ?? row.romaneios ?? 0),
          partes_diaria: Number(row.partes_diaria_7d ?? row.partes_diaria ?? 0),
        }));
        const metrics = computeRiscoDisplayMetrics(summary, items7d, []);
        ids = metrics.riscoMotoristaIds;
        setProd7d(items7d);
        setRiscoDisplay(metrics);
      }
      setRiscoMotoristaIds(new Set(ids));
      setRiscoListFilter(true);
      setPage(1);
      setSearchParams({ risco: "1" }, { replace: true });
      requestAnimationFrame(() => {
        document.getElementById("lista-pessoas")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch {
      setRiscoListFilter(true);
      setPage(1);
      setSearchParams({ risco: "1" }, { replace: true });
      requestAnimationFrame(() => {
        document.getElementById("lista-pessoas")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } finally {
      setRiscoFilterLoading(false);
    }
  }, [setSearchParams, riscoDisplay, summary, prod7d]);

  const clearRiscoListFilter = useCallback(() => {
    setRiscoListFilter(false);
    setRiscoMotoristaIds(new Set());
    if (searchParams.get("risco")) {
      const next = new URLSearchParams(searchParams);
      next.delete("risco");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (searchParams.get("risco") !== "1") return;
    if (riscoListFilter || riscoUrlInitRef.current) return;
    riscoUrlInitRef.current = true;
    applyRiscoOperacionalFilter();
  }, [searchParams, riscoListFilter, applyRiscoOperacionalFilter]);

  const displayUsers = useMemo(() => {
    if (!riscoListFilter) return users;
    return users;
  }, [users, riscoListFilter]);

  const riscoCadastroLists = useMemo(() => {
    if (!riscoListFilter) return null;
    return splitRiscoCadastroLists(prod7d, riscoMotoristaIds);
  }, [riscoListFilter, prod7d, riscoMotoristaIds]);

  return {
    fmtInt,
    ROLE_OPTS,
    STATUS_OPTS,
    summary,
    riscoDisplay,
    summaryLoading,
    summaryError,
    refetchSummary: loadDashboard,
    prod,
    prodLoading,
    prodError,
    refetchProd: loadDashboard,
    users,
    displayUsers,
    riscoCadastroLists,
    prod7d,
    riscoListFilter,
    riscoFilterLoading,
    applyRiscoOperacionalFilter,
    clearRiscoListFilter,
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
    vehiclesPicklistLoading,
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
