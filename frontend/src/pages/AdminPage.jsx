import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api, { extractApiErrorMessage, resolveBackendAssetUrl } from "../services/api";
import { useAuth } from "../services/auth";
import FormField, { inputClass } from "../components/FormField";
import useDebouncedValue from "../hooks/useDebouncedValue";
import PaginationControls from "../components/PaginationControls";
import SkeletonRows from "../components/SkeletonRows";
import { emitToast } from "../services/uiEvents";
import { CenteredSpinner } from "../components/LoadingState";
import EmptyState from "../components/EmptyState";
import Avatar from "../components/Avatar";
import CompanyLogo from "../components/CompanyLogo";
import UserDetailsModal from "../components/UserDetailsModal";
import ConfirmActionModal from "../components/ConfirmActionModal";

const resolveAsset = (value) => {
  return resolveBackendAssetUrl(value);
};
const formatRole = (role) => {
  if (role === "SUPER_ADMIN") return "Administrador geral";
  if (role === "ADMIN_EMPRESA") return "Administrador da empresa";
  if (role === "APONTADOR") return "Apontador";
  return "Motorista";
};
const roleBadge = (role) =>
  role === "SUPER_ADMIN"
    ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
    : role === "ADMIN_EMPRESA"
      ? "border-violet-500/40 bg-violet-500/15 text-violet-200"
      : role === "APONTADOR"
        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
        : "border-blue-500/40 bg-blue-500/15 text-blue-200";

const contaContaBadgeClass = (conta_status) =>
  conta_status === "inativo"
    ? "border-slate-500/50 bg-slate-800/90 text-slate-300"
    : "border-emerald-500/45 bg-emerald-600/15 text-emerald-200";

/** Ações tabela utilizadores (SaaS): 32px, 8px radius, cores suaves, ícones + tooltip, hover scale. */
const userTableSaaSBtnBase =
  "fc-btn inline-flex h-8 min-h-8 min-w-[32px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-2 text-[15px] leading-none transition duration-200 ease-out hover:scale-105 hover:brightness-[1.03] active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:brightness-100";
const userTableBtnVisualizar = `${userTableSaaSBtnBase} border border-slate-600/35 bg-slate-800/45 text-slate-300 hover:border-slate-500/45 hover:bg-slate-700/55 focus-visible:ring-slate-500/30`;
const userTableBtnEditar = `${userTableSaaSBtnBase} border border-blue-500/22 bg-blue-600/12 text-blue-200/90 hover:border-blue-400/32 hover:bg-blue-600/22 focus-visible:ring-blue-500/35`;
const userTableBtnDesativar = `${userTableSaaSBtnBase} border border-red-500/22 bg-red-950/30 text-red-200/75 hover:border-red-400/30 hover:bg-red-900/38 focus-visible:ring-red-500/30`;
const userTableBtnReativar = `${userTableSaaSBtnBase} border border-emerald-600/22 bg-emerald-950/28 text-emerald-200/80 hover:border-emerald-500/32 hover:bg-emerald-900/35 focus-visible:ring-emerald-500/35`;
const userTableBtnResetSenha = `${userTableSaaSBtnBase} border border-amber-600/22 bg-amber-950/28 text-amber-200/80 hover:border-amber-500/30 hover:bg-amber-900/32 focus-visible:ring-amber-600/28`;

/** Ações Super Admin — cores fixas, hover explícito, ícones nos três tipos pedidos. */
const adminActionBtnBase =
  "fc-btn inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";
const adminBtnVisualizar = `${adminActionBtnBase} border border-slate-500/55 bg-slate-800/60 text-slate-100 hover:bg-slate-700/80 hover:text-white focus-visible:ring-slate-400/40`;
const adminBtnEditar = `${adminActionBtnBase} border border-blue-500/65 bg-blue-600/35 text-blue-50 hover:border-blue-400 hover:bg-blue-600/55 hover:text-white hover:shadow-[0_0_20px_-4px_rgba(59,130,246,0.6)] focus-visible:ring-blue-500/55`;
const adminBtnExcluir = `${adminActionBtnBase} border border-red-600/90 bg-red-700/45 text-red-50 hover:border-red-400 hover:bg-red-600/65 hover:text-white hover:shadow-[0_6px_22px_-2px_rgba(248,113,113,0.55)] hover:brightness-110 focus-visible:ring-red-500/60`;

const adminActionBtnBaseCompact =
  "fc-btn inline-flex items-center justify-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950";
const adminBtnEditarCompact = `${adminActionBtnBaseCompact} border border-blue-500/60 bg-blue-600/32 text-blue-50 hover:border-blue-400 hover:bg-blue-600/52 hover:text-white hover:shadow-[0_0_14px_-3px_rgba(59,130,246,0.5)] focus-visible:ring-blue-500/50`;
const adminBtnExcluirCompact = `${adminActionBtnBaseCompact} border border-red-600/90 bg-red-700/42 text-red-50 hover:border-red-400 hover:bg-red-600/62 hover:text-white hover:shadow-[0_4px_16px_-2px_rgba(248,113,113,0.5)] hover:brightness-110 focus-visible:ring-red-500/55`;

/** Monta estado do formulário de edição a partir da linha da listagem (sem dados sensíveis). */
const toEditUserState = (u) => {
  const rest = { ...(u || {}) };
  delete rest.senha_hash;
  const raw = rest.cnh_validade;
  let cnhInput = "";
  if (raw) {
    const s = typeof raw === "string" ? raw : new Date(raw).toISOString();
    cnhInput = String(s).slice(0, 10);
  }
  return {
    ...rest,
    empresa_id: String(rest.empresa_id ?? ""),
    veiculo_id: String(rest.veiculo_id ?? ""),
    email: rest.email ?? "",
    cnh_validade: cnhInput,
    funcao: rest.funcao ?? "",
    cnh_categoria: rest.cnh_categoria ?? "",
    cnh_numero: rest.cnh_numero ?? "",
    observacoes: rest.observacoes ?? "",
    equipamento_vinculo: rest.equipamento_vinculo ?? "",
    operacao_escopo: rest.operacao_escopo ?? "",
    status_operacional: rest.status_operacional ?? "ativo",
    profile_image_url: rest.profile_image_url ?? "",
    conta_status: rest.conta_status === "inativo" ? "inativo" : "ativo",
  };
};
const dedupeById = (items = []) => {
  const map = new Map();
  for (const item of items) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
};
const hasFullName = (value) => {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  return normalized.split(" ").filter(Boolean).length >= 2;
};

const RESET_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const buildResetPasswordModalState = () => ({
  open: false,
  userId: null,
  mode: "choice",
  customPassword: "",
  loading: false,
});

/** Indica se a linha da tabela pode estar incompleta e convém GET /super-admin/users/:id. */
const userViewNeedsApiRefresh = (u) => {
  if (!u?.id) return false;
  if (!u.role) return true;
  if (!String(u.nome ?? "").trim()) return true;
  const eid = u.empresa_id;
  if (eid != null && eid !== "" && Number(eid) > 0 && !u.empresa_nome && u.role !== "SUPER_ADMIN") return true;
  if (u.role === "MOTORISTA" && u.veiculo_id && !u.veiculo_nome) return true;
  return false;
};

export default function AdminPage() {
  const { user: authUser } = useAuth();
  const submitLockRef = useRef(false);
  const [overview, setOverview] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [searchResults, setSearchResults] = useState({ companies: [], users: [], vehicles: [] });
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [companyPage, setCompanyPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [vehiclesPage, setVehiclesPage] = useState(1);
  const [companyPages, setCompanyPages] = useState(1);
  const [usersPages, setUsersPages] = useState(1);
  const [vehiclesPages, setVehiclesPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchUsers, setSearchUsers] = useState("");
  const [searchVehicles, setSearchVehicles] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [filters, setFilters] = useState({
    role: "ALL",
    empresa_id: "",
    status: "ALL",
  });
  const [editingUser, setEditingUser] = useState(null);
  const [userEditVehicles, setUserEditVehicles] = useState([]);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [actionConfirm, setActionConfirm] = useState(null);
  const [actionConfirmLoading, setActionConfirmLoading] = useState(false);
  const [resetPasswordModal, setResetPasswordModal] = useState(() => buildResetPasswordModalState());
  const [companyForm, setCompanyForm] = useState({
    id: null,
    nome: "",
    logo: null,
    admin_nome: "",
    admin_email: "",
    admin_senha: "",
  });
  const debouncedSearch = useDebouncedValue(search);
  const debouncedUserSearch = useDebouncedValue(searchUsers);
  const debouncedVehicleSearch = useDebouncedValue(searchVehicles);
  const debouncedGlobalSearch = useDebouncedValue(globalSearch);
  const editingUserRole = editingUser?.role;
  const editingUserEmpresaId = editingUser?.empresa_id;

  const loadOverview = useCallback(async () => {
    const { data } = await api.get("/super-admin/overview");
    setOverview(data);
  }, []);

  const loadCompanyOptions = useCallback(async () => {
    const { data } = await api.get("/super-admin/companies", {
      params: { page: 1, limit: 200, search: "" },
    });
    setCompanyOptions(dedupeById(data.items || []));
  }, []);

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const { data } = await api.get("/super-admin/companies", {
        params: { page: companyPage, limit: 10, search: debouncedSearch },
      });
      setCompanies(dedupeById(data.items || []));
      setCompanyPages(data.totalPages || 1);
    } finally {
      setLoadingCompanies(false);
    }
  }, [companyPage, debouncedSearch]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data } = await api.get("/super-admin/users", {
        params: {
          page: usersPage,
          limit: 10,
          search: debouncedUserSearch,
          role: filters.role,
          empresa_id: filters.empresa_id || undefined,
          status: filters.status,
        },
      });
      setUsers(dedupeById(data.items || []));
      setUsersPages(data.totalPages || 1);
    } finally {
      setLoadingUsers(false);
    }
  }, [usersPage, debouncedUserSearch, filters.role, filters.empresa_id, filters.status]);

  const loadVehicles = useCallback(async () => {
    setLoadingVehicles(true);
    try {
      const { data } = await api.get("/super-admin/vehicles", {
        params: {
          page: vehiclesPage,
          limit: 10,
          search: debouncedVehicleSearch,
          empresa_id: filters.empresa_id || undefined,
        },
      });
      setVehicles(dedupeById(data.items || []));
      setVehiclesPages(data.totalPages || 1);
    } finally {
      setLoadingVehicles(false);
    }
  }, [vehiclesPage, debouncedVehicleSearch, filters.empresa_id]);

  const loadCompanyDetails = useCallback(async (companyId) => {
    setLoadingDetails(true);
    try {
      const { data } = await api.get(`/super-admin/companies/${companyId}/details`);
      setSelectedCompany(data);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const closeUserDetailsModal = useCallback(() => {
    setOpen(false);
    setSelectedUser(null);
    setUserDetailLoading(false);
  }, []);

  const handleViewUser = useCallback(
    async (user) => {
      if (!user?.id) return;
      setSelectedUser(user);
      setOpen(true);
      if (!userViewNeedsApiRefresh(user)) return;
      setUserDetailLoading(true);
      try {
        const { data } = await api.get(`/super-admin/users/${user.id}`);
        setSelectedUser(data);
      } catch (err) {
        const eid = user.empresa_id;
        if (eid != null && eid !== "" && Number(eid) > 0) {
          try {
            const { data } = await api.get(`/super-admin/companies/${Number(eid)}/details`);
            const combined = [
              ...(data.users || []),
              ...(data.admins || []),
              ...(data.motoristas || []),
              ...(data.apontadores || []),
            ];
            const found = combined.find((x) => Number(x.id) === Number(user.id));
            if (found) {
              setSelectedUser((prev) => ({ ...prev, ...found }));
            } else {
              emitToast(extractApiErrorMessage(err) || "Não foi possível carregar todos os detalhes.", "warning");
            }
          } catch {
            emitToast(extractApiErrorMessage(err) || "Não foi possível carregar todos os detalhes.", "warning");
          }
        } else {
          emitToast(extractApiErrorMessage(err) || "Não foi possível carregar todos os detalhes.", "warning");
        }
      } finally {
        setUserDetailLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (editingUserRole !== "MOTORISTA" || !editingUserEmpresaId) {
      setUserEditVehicles([]);
      return;
    }
    let cancelled = false;
    api
      .get("/super-admin/vehicles", {
        params: { page: 1, limit: 200, empresa_id: Number(editingUserEmpresaId) },
      })
      .then(({ data }) => {
        if (!cancelled) setUserEditVehicles(dedupeById(data.items || []));
      })
      .catch(() => {
        if (!cancelled) setUserEditVehicles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [editingUserRole, editingUserEmpresaId]);

  useEffect(() => {
    Promise.all([loadOverview(), loadCompanyOptions()]).catch(() => {
      emitToast("Não foi possível carregar o resumo inicial.", "error");
    });
  }, [loadOverview, loadCompanyOptions]);

  useEffect(() => {
    loadCompanies().catch(() => emitToast("Falha ao carregar empresas.", "error"));
  }, [loadCompanies]);

  useEffect(() => {
    loadUsers().catch(() => emitToast("Falha ao carregar usuários.", "error"));
  }, [loadUsers]);

  useEffect(() => {
    loadVehicles().catch(() => emitToast("Falha ao carregar veículos.", "error"));
  }, [loadVehicles]);

  const closeEditDrawer = useCallback(() => {
    setEditingUser(null);
    setUserEditVehicles([]);
    setEditingVehicle(null);
  }, []);

  useEffect(() => {
    if (!editingUser && !editingVehicle) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeEditDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingUser, editingVehicle, closeEditDrawer]);

  useEffect(() => {
    if (!editingUser && !editingVehicle) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [editingUser, editingVehicle]);

  useEffect(() => {
    if (!debouncedGlobalSearch.trim()) {
      setSearchResults({ companies: [], users: [], vehicles: [] });
      return;
    }
    api
      .get("/super-admin/search", { params: { q: debouncedGlobalSearch } })
      .then(({ data }) => setSearchResults(data))
      .catch(() => emitToast("Não foi possível concluir a busca.", "warning"));
  }, [debouncedGlobalSearch]);

  const onSaveCompany = async (e) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    if (!companyForm.nome?.trim()) {
      emitToast("Informe o nome da empresa.", "error");
      return;
    }
    if (!companyForm.id && !hasFullName(companyForm.admin_nome)) {
      emitToast("Informe o nome completo do administrador da empresa.", "error");
      return;
    }
    if (!companyForm.id && (!companyForm.admin_email?.trim() || !companyForm.admin_senha?.trim())) {
      emitToast("Informe o e-mail e a senha do administrador da empresa.", "error");
      return;
    }
    submitLockRef.current = true;
    setLoading(true);
    try {
      if (companyForm.logo) {
        const formData = new FormData();
        formData.append("nome", companyForm.nome.trim());
        formData.append("logo", companyForm.logo);
        if (!companyForm.id) {
          formData.append("admin_nome", companyForm.admin_nome?.trim() || `Administrador ${companyForm.nome.trim()}`);
          formData.append("admin_email", companyForm.admin_email.trim());
          formData.append("admin_senha", companyForm.admin_senha);
        }
        if (companyForm.id) {
          await api.put(`/super-admin/companies/${companyForm.id}`, formData);
        } else {
          await api.post("/super-admin/companies", formData);
        }
      } else {
        const payload = { nome: companyForm.nome.trim() };
        if (!companyForm.id) {
          payload.admin_nome = companyForm.admin_nome?.trim() || `Administrador ${companyForm.nome.trim()}`;
          payload.admin_email = companyForm.admin_email.trim();
          payload.admin_senha = companyForm.admin_senha;
        }
        if (companyForm.id) {
          await api.put(`/super-admin/companies/${companyForm.id}`, payload);
        } else {
          await api.post("/super-admin/companies", payload);
        }
      }
      emitToast(
        companyForm.id
          ? "Empresa atualizada com sucesso."
          : `Empresa criada. E-mail de acesso do administrador: ${companyForm.admin_email}`,
      );
      setCompanyForm({
        id: null,
        nome: "",
        logo: null,
        admin_nome: "",
        admin_email: "",
        admin_senha: "",
      });
      await Promise.all([loadOverview(), loadCompanies(), loadCompanyOptions()]);
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao salvar empresa.", "error");
    } finally {
      submitLockRef.current = false;
      setLoading(false);
    }
  };

  const closeActionConfirm = useCallback(() => {
    if (actionConfirmLoading) return;
    setActionConfirm(null);
  }, [actionConfirmLoading]);

  const confirmAction = useCallback(async () => {
    if (!actionConfirm?.onConfirm) return;
    setActionConfirmLoading(true);
    try {
      await actionConfirm.onConfirm();
      setActionConfirm(null);
    } finally {
      setActionConfirmLoading(false);
    }
  }, [actionConfirm]);

  const deleteCompany = useCallback(async (id) => {
    try {
      await api.delete(`/super-admin/companies/${id}`);
      emitToast("Empresa excluída.");
      if (selectedCompany?.company?.id === id) {
        setSelectedCompany(null);
      }
      await Promise.all([loadOverview(), loadCompanies(), loadCompanyOptions(), loadUsers(), loadVehicles()]);
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao excluir empresa.", "error");
    }
  }, [selectedCompany, loadOverview, loadCompanies, loadCompanyOptions, loadUsers, loadVehicles]);

  const onDeleteCompany = useCallback((id) => {
    setActionConfirm({
      title: "Excluir empresa",
      description: "Esta exclusão remove a empresa selecionada da operação administrativa.",
      consequence: "A ação pode impactar usuários e veículos vinculados e não possui reversão simples.",
      confirmLabel: "Excluir empresa",
      tone: "danger",
      onConfirm: () => deleteCompany(id),
    });
  }, [deleteCompany]);

  const deactivateUser = useCallback(async (id) => {
    try {
      const { data } = await api.patch(`/super-admin/users/${id}/conta-status`, { conta_status: "inativo" });
      setUsers((prev) => prev.map((x) => (x.id === id ? { ...x, ...data } : x)));
      emitToast("Usuário desativado.", "success");
      await Promise.all([
        loadOverview(),
        loadUsers(),
        selectedCompany ? loadCompanyDetails(selectedCompany.company.id) : Promise.resolve(),
      ]);
    } catch (err) {
      emitToast(extractApiErrorMessage(err) || "Falha ao desativar usuário.", "error");
    }
  }, [loadOverview, loadUsers, selectedCompany, loadCompanyDetails]);

  const onDeactivateUser = useCallback((id) => {
    setActionConfirm({
      title: "Desativar usuário",
      description: "A conta será bloqueada e o usuário não poderá iniciar sessão.",
      consequence: "O acesso ficará suspenso até uma reativação administrativa.",
      confirmLabel: "Desativar usuário",
      tone: "warning",
      onConfirm: () => deactivateUser(id),
    });
  }, [deactivateUser]);

  const onReactivateUser = async (id) => {
    try {
      const { data } = await api.patch(`/super-admin/users/${id}/conta-status`, { conta_status: "ativo" });
      setUsers((prev) => prev.map((x) => (x.id === id ? { ...x, ...data } : x)));
      emitToast("Usuário reativado.", "success");
      await Promise.all([
        loadOverview(),
        loadUsers(),
        selectedCompany ? loadCompanyDetails(selectedCompany.company.id) : Promise.resolve(),
      ]);
    } catch (err) {
      emitToast(extractApiErrorMessage(err) || "Falha ao reativar usuário.", "error");
    }
  };

  const onResetPassword = useCallback((id) => {
    setResetPasswordModal({
      open: true,
      userId: id,
      mode: "choice",
      customPassword: "",
      loading: false,
    });
  }, []);

  const closeResetPasswordModal = useCallback(() => {
    setResetPasswordModal((prev) => (prev.loading ? prev : buildResetPasswordModalState()));
  }, []);

  const switchResetPasswordMode = useCallback((mode) => {
    setResetPasswordModal((prev) => ({
      ...prev,
      mode,
      customPassword: mode === "manual" ? prev.customPassword : "",
    }));
  }, []);

  const confirmResetPassword = useCallback(async () => {
    if (!resetPasswordModal.userId || resetPasswordModal.loading) return;

    const isManual = resetPasswordModal.mode === "manual";
    const customPassword = String(resetPasswordModal.customPassword || "");
    if (isManual && !RESET_PASSWORD_REGEX.test(customPassword)) {
      emitToast("Senha inválida. Use ao menos 8 caracteres, maiúscula, minúscula e número.", "error");
      return;
    }

    setResetPasswordModal((prev) => ({ ...prev, loading: true }));
    try {
      const payload = isManual ? { new_password: customPassword } : {};
      const { data } = await api.post(`/super-admin/users/${resetPasswordModal.userId}/reset-password`, payload);
      if (isManual) {
        emitToast("Senha atualizada com sucesso.");
      } else {
        emitToast(`Senha resetada. Temporária: ${data.temporary_password}`);
      }
      setResetPasswordModal(buildResetPasswordModalState());
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao resetar senha.", "error");
      setResetPasswordModal((prev) => ({ ...prev, loading: false }));
    }
  }, [resetPasswordModal]);

  const onSaveUserEdit = async () => {
    if (!editingUser) return;
    if (submitLockRef.current) return;
    const emailTrim = String(editingUser.email || "").trim();
    if (editingUser.role !== "MOTORISTA" && !emailTrim) {
      emitToast("E-mail é obrigatório para este tipo de usuário.", "error");
      return;
    }
    submitLockRef.current = true;
    try {
      const empresaIdNum =
        editingUser.role === "SUPER_ADMIN" ? null : (editingUser.empresa_id ? Number(editingUser.empresa_id) : null);
      const payload = {
        nome: String(editingUser.nome || "").trim(),
        cpf_id: String(editingUser.cpf_id || "").trim(),
        role: editingUser.role,
        empresa_id: empresaIdNum,
        veiculo_id:
          editingUser.role === "MOTORISTA" && editingUser.veiculo_id
            ? Number(editingUser.veiculo_id)
            : null,
        funcao: String(editingUser.funcao || "").trim() || null,
        cnh_categoria: String(editingUser.cnh_categoria || "").trim() || null,
        cnh_numero: String(editingUser.cnh_numero || "").trim() || null,
        cnh_validade: String(editingUser.cnh_validade || "").trim() || null,
        observacoes: String(editingUser.observacoes || "").trim() || null,
        equipamento_vinculo: String(editingUser.equipamento_vinculo || "").trim() || null,
        operacao_escopo: String(editingUser.operacao_escopo || "").trim() || null,
        status_operacional: editingUser.status_operacional || "ativo",
        conta_status: editingUser.conta_status === "inativo" ? "inativo" : "ativo",
      };
      const profileUrl = String(editingUser.profile_image_url || "").trim();
      if (profileUrl) payload.profile_image_url = profileUrl;
      if (editingUser.role === "MOTORISTA") {
        if (emailTrim) payload.email = emailTrim.toLowerCase();
      } else {
        payload.email = emailTrim.toLowerCase();
      }
      await api.put(`/super-admin/users/${editingUser.id}`, payload);
      emitToast("Atualizado com sucesso", "success");
      closeEditDrawer();
      await Promise.all([loadUsers(), loadOverview(), selectedCompany ? loadCompanyDetails(selectedCompany.company.id) : Promise.resolve()]);
    } catch (err) {
      emitToast(extractApiErrorMessage(err) || "Falha ao atualizar usuário.", "error");
    } finally {
      submitLockRef.current = false;
    }
  };

  const deleteVehicle = useCallback(async (id) => {
    try {
      await api.delete(`/super-admin/vehicles/${id}`);
      emitToast("Veículo excluído.");
      await Promise.all([loadVehicles(), loadOverview(), selectedCompany ? loadCompanyDetails(selectedCompany.company.id) : Promise.resolve()]);
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao excluir veículo.", "error");
    }
  }, [loadVehicles, loadOverview, selectedCompany, loadCompanyDetails]);

  const onDeleteVehicle = useCallback((id) => {
    setActionConfirm({
      title: "Excluir veículo",
      description: "Este veículo será removido do cadastro administrativo.",
      consequence: "A ação pode afetar vínculos operacionais e não é facilmente reversível.",
      confirmLabel: "Excluir veículo",
      tone: "danger",
      onConfirm: () => deleteVehicle(id),
    });
  }, [deleteVehicle]);

  const onSaveVehicleEdit = async () => {
    if (!editingVehicle) return;
    try {
      await api.put(`/super-admin/vehicles/${editingVehicle.id}`, {
        nome: editingVehicle.nome,
        placa: editingVehicle.placa,
        empresa_id: Number(editingVehicle.empresa_id),
      });
      emitToast("Veículo atualizado com sucesso.");
      closeEditDrawer();
      await Promise.all([loadVehicles(), loadOverview(), selectedCompany ? loadCompanyDetails(selectedCompany.company.id) : Promise.resolve()]);
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao atualizar veículo.", "error");
    }
  };

  const kpis = [
    { label: "Total de empresas", value: overview?.total_empresas ?? 0 },
    { label: "Total de usuários", value: overview?.total_usuarios ?? 0 },
    { label: "Total de motoristas", value: overview?.total_motoristas ?? 0 },
    { label: "Total de administradores", value: overview?.total_admins ?? 0 },
    { label: "Total de veículos", value: overview?.total_veiculos ?? 0 },
    { label: "Total de registros", value: overview?.total_registros ?? 0 },
  ];

  const motoristaVehicleSelectOptions = useMemo(() => {
    if (!editingUser || editingUser.role !== "MOTORISTA") return [];
    const list = [...userEditVehicles];
    const vid = String(editingUser.veiculo_id || "");
    if (vid && !list.some((v) => String(v.id) === vid)) {
      list.unshift({
        id: Number(vid),
        nome: editingUser.veiculo_nome || `Veículo ${vid}`,
        placa: editingUser.placa || "—",
      });
    }
    return list;
  }, [editingUser, userEditVehicles]);

  return (
    <div className="fc-superadmin-page-root min-w-0 w-full space-y-6">
      {loading && <CenteredSpinner label="Salvando empresa..." />}

      <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="fc-card min-w-0 rounded-2xl border border-violet-500/20 p-4">
            <p className="text-xs text-slate-400">{kpi.label}</p>
            <p className="mt-2 text-2xl font-bold text-white">{kpi.value}</p>
          </article>
        ))}
      </section>

      <section className="fc-card min-w-0 p-5">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input
            className={`${inputClass} min-w-0`}
            placeholder="Buscar em todo o sistema: empresas, pessoas ou veículos"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
          <select
            className={`${inputClass} min-w-0`}
            value={filters.role}
            onChange={(e) => {
              setUsersPage(1);
              setFilters((f) => ({ ...f, role: e.target.value }));
            }}
          >
            <option value="ALL">Tipo de usuário (todos)</option>
            <option value="MOTORISTA">Motorista</option>
            <option value="ADMIN_EMPRESA">Administrador da empresa</option>
            <option value="APONTADOR">Apontador</option>
            <option value="SUPER_ADMIN">Administrador geral</option>
          </select>
          <select
            className={`${inputClass} min-w-0`}
            value={filters.empresa_id}
            onChange={(e) => {
              setUsersPage(1);
              setVehiclesPage(1);
              setFilters((f) => ({ ...f, empresa_id: e.target.value }));
            }}
          >
            <option value="">Empresa (todas)</option>
            {companyOptions.map((c) => (
              <option key={`co-${c.id}`} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <select
            className={`${inputClass} min-w-0`}
            value={filters.status}
            onChange={(e) => {
              setUsersPage(1);
              setFilters((f) => ({ ...f, status: e.target.value }));
            }}
          >
            <option value="ALL">Status (todos)</option>
            <option value="COM_VEICULO">Com veículo</option>
            <option value="SEM_VEICULO">Sem veículo</option>
          </select>
        </div>

        {(searchResults.companies.length > 0 || searchResults.users.length > 0 || searchResults.vehicles.length > 0) && (
          <div className="mt-3 min-w-0 rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-sm">
            <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Resultados da busca</p>
            <div className="grid min-w-0 gap-3 md:grid-cols-3">
              <div className="min-w-0">
                <p className="mb-1 text-xs text-slate-400">Empresas</p>
                {searchResults.companies.map((c) => (
                  <p key={`sr-c-${c.id}`} className="break-words text-slate-200">
                    {c.nome}
                  </p>
                ))}
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs text-slate-400">Usuários</p>
                {searchResults.users.map((u) => (
                  <p key={`sr-u-${u.id}`} className="break-words text-slate-200">
                    {u.nome} - {u.empresa_nome}
                  </p>
                ))}
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs text-slate-400">Veículos</p>
                {searchResults.vehicles.map((v) => (
                  <p key={`sr-v-${v.id}`} className="break-words text-slate-200">
                    {v.nome} - {v.placa}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <form onSubmit={onSaveCompany} className="fc-superadmin-company-form fc-card min-w-0 w-full p-5">
          <h2 className="mb-1 text-lg font-semibold text-white">
            {companyForm.id ? "Editar empresa" : "Nova empresa"}
          </h2>
          <p className="mb-4 text-sm text-slate-400">Cadastre empresas e o administrador responsável por cada uma.</p>
          <FormField label="Nome da empresa">
            <input className={inputClass} value={companyForm.nome} onChange={(e) => setCompanyForm({ ...companyForm, nome: e.target.value })} />
          </FormField>
          {!companyForm.id && (
            <>
              <FormField label="Nome completo do administrador">
                <input className={inputClass} value={companyForm.admin_nome} onChange={(e) => setCompanyForm({ ...companyForm, admin_nome: e.target.value })} placeholder="Ex.: Maria Gestora" />
              </FormField>
              <FormField label="E-mail do administrador">
                <input className={inputClass} value={companyForm.admin_email} onChange={(e) => setCompanyForm({ ...companyForm, admin_email: e.target.value })} placeholder="gestor@empresa.com" />
              </FormField>
              <FormField label="Senha do administrador">
                <input type="password" className={inputClass} value={companyForm.admin_senha} onChange={(e) => setCompanyForm({ ...companyForm, admin_senha: e.target.value })} placeholder="Mínimo 8 caracteres, com maiúscula, minúscula e número" />
              </FormField>
            </>
          )}
          <FormField label="Logo">
            <input type="file" className={inputClass} onChange={(e) => setCompanyForm({ ...companyForm, logo: e.target.files?.[0] || null })} />
          </FormField>
          <button type="submit" disabled={loading} className="fc-btn w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold">
            {companyForm.id ? "Atualizar empresa" : "Criar empresa"}
          </button>
          {companyForm.id && (
            <button
              type="button"
              onClick={() => setCompanyForm({ id: null, nome: "", logo: null, admin_nome: "", admin_email: "", admin_senha: "" })}
              className="fc-btn mt-2 w-full rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300"
            >
              Cancelar edição
            </button>
          )}
        </form>

        <section className="min-w-0 space-y-4">
          <article className="fc-card relative min-w-0 overflow-hidden rounded-2xl border-2 border-violet-500/35 bg-gradient-to-b from-violet-950/45 via-slate-950/90 to-slate-950 p-6 shadow-[0_22px_50px_-14px_rgba(124,58,237,0.32)]">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-400/70 via-fuchsia-400/50 to-transparent"
              aria-hidden
            />
            <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-300/90">Cadastro</p>
                <h3 className="text-xl font-semibold tracking-tight text-white">Empresas</h3>
              </div>
              <input
                className={`${inputClass} min-w-0 w-full sm:max-w-md sm:flex-1`}
                placeholder="Buscar empresa"
                value={search}
                onChange={(e) => {
                  setCompanyPage(1);
                  setSearch(e.target.value);
                }}
              />
            </div>
            <div className="fc-superadmin-table-scroll -mx-1 px-1 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="pb-2">Logo</th>
                    <th className="pb-2">Nome</th>
                    <th className="pb-2">Usuários</th>
                    <th className="pb-2">Veículos</th>
                    <th className="pb-2">Criação</th>
                    <th className="pb-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {loadingCompanies && (
                    <tr>
                      <td colSpan={6}><SkeletonRows rows={3} /></td>
                    </tr>
                  )}
                  {!loadingCompanies && companies.map((company) => (
                    <tr key={company.id} className="text-slate-100">
                      <td className="py-2"><CompanyLogo logoUrl={resolveAsset(company.logo_url)} companyName={company.nome} className="h-10 w-10" /></td>
                      <td className="max-w-[14rem] break-words py-2 font-medium sm:max-w-none">{company.nome}</td>
                      <td className="py-2">{company.usuarios_count ?? "-"}</td>
                      <td className="py-2">{company.veiculos_count ?? "-"}</td>
                      <td className="py-2">{new Date(company.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="py-2 text-right">
                        <div className="flex max-w-[22rem] flex-wrap justify-end gap-2 sm:ml-auto sm:max-w-none">
                          <button type="button" onClick={() => loadCompanyDetails(company.id)} className={adminBtnVisualizar}>
                            👁️ Visualizar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setCompanyForm({
                                id: company.id,
                                nome: company.nome,
                                logo: null,
                                admin_nome: "",
                                admin_email: "",
                                admin_senha: "",
                              })
                            }
                            className={adminBtnEditar}
                          >
                            ✏️ Editar
                          </button>
                          <button type="button" onClick={() => onDeleteCompany(company.id)} className={adminBtnExcluir}>
                            🗑️ Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loadingCompanies && companies.length === 0 && (
              <EmptyState compact title="Nenhuma empresa encontrada" description="Crie a primeira empresa para iniciar a operação do sistema." />
            )}
            <PaginationControls
              page={companyPage}
              totalPages={companyPages}
              onPrev={() => setCompanyPage((p) => Math.max(1, p - 1))}
              onNext={() => setCompanyPage((p) => Math.min(companyPages, p + 1))}
            />
          </article>

          <article className="fc-card min-w-0 rounded-xl border border-slate-700/50 bg-slate-950/50 p-5 shadow-[0_10px_28px_-12px_rgba(0,0,0,0.45)]">
            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h3 className="w-full min-w-0 text-base font-semibold text-slate-100 sm:w-auto">Usuários (todas as empresas)</h3>
              <input
                className={`${inputClass} min-w-0 w-full border-slate-700/60 bg-slate-950/60 sm:max-w-md sm:flex-1`}
                placeholder="Buscar por nome ou e-mail"
                value={searchUsers}
                onChange={(e) => {
                  setUsersPage(1);
                  setSearchUsers(e.target.value);
                }}
              />
            </div>
            <div className="fc-superadmin-table-scroll -mx-1 px-1 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="pb-2">Avatar</th>
                    <th className="pb-2">Nome</th>
                    <th className="pb-2">Email/CPF</th>
                    <th className="pb-2">Tipo</th>
                    <th className="pb-2">Empresa</th>
                    <th className="pb-2">Veículo</th>
                    <th className="pb-2">Conta</th>
                    <th className="pb-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/55">
                  {loadingUsers && (
                    <tr>
                      <td colSpan={8}><SkeletonRows rows={3} /></td>
                    </tr>
                  )}
                  {!loadingUsers && users.map((u) => (
                    <tr key={`u-${u.id}`} className="text-slate-400">
                      <td className="py-2">
                        <Avatar imageUrl={resolveAsset(u.profile_image_url)} name={u.nome} size="list" />
                      </td>
                      <td className="min-w-0 max-w-[10rem] break-words py-2 font-medium text-slate-300 sm:max-w-[12rem] lg:max-w-none">
                        {u.nome}
                      </td>
                      <td className="min-w-0 max-w-[11rem] break-words py-2 sm:max-w-[14rem] lg:max-w-none">{u.email || u.cpf_id}</td>
                      <td className="py-2">
                        <span
                          className={`inline-block whitespace-nowrap rounded-full border px-2 py-1 text-xs font-semibold ${roleBadge(u.role)}`}
                        >
                          {formatRole(u.role)}
                        </span>
                      </td>
                      <td className="min-w-0 max-w-[9rem] break-words py-2 sm:max-w-[11rem] lg:max-w-none">{u.empresa_nome || "-"}</td>
                      <td className="min-w-0 max-w-[9rem] break-words py-2 sm:max-w-[11rem] lg:max-w-none">{u.veiculo_nome || "-"}</td>
                      <td className="py-2">
                        <span
                          className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${contaContaBadgeClass(u.conta_status)}`}
                        >
                          {u.conta_status === "inativo" ? "Inativo" : "Ativo"}
                        </span>
                      </td>
                      <td className="min-w-0 py-2 text-right align-middle">
                        <div className="flex w-full min-w-0 justify-end overflow-x-auto overflow-y-visible [-ms-overflow-style:auto] [scrollbar-width:thin]">
                          <div className="fc-superadmin-user-actions inline-flex flex-nowrap items-center gap-[6px] pr-0.5">
                            <button
                              type="button"
                              onClick={() => handleViewUser(u)}
                              className={userTableBtnVisualizar}
                              title="Visualizar usuário"
                              aria-label="Visualizar usuário"
                            >
                              👁
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingUser(toEditUserState(u))}
                              className={userTableBtnEditar}
                              title="Editar"
                              aria-label="Editar"
                            >
                              ✏️
                            </button>
                            {u.conta_status !== "inativo" ? (
                              <button
                                type="button"
                                disabled={authUser?.id != null && Number(authUser.id) === Number(u.id)}
                                title={
                                  authUser?.id != null && Number(authUser.id) === Number(u.id)
                                    ? "Não pode desativar a sua própria conta"
                                    : "Desativar"
                                }
                                onClick={() => onDeactivateUser(u.id)}
                                className={userTableBtnDesativar}
                                aria-label="Desativar"
                              >
                                ⛔
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onReactivateUser(u.id)}
                                className={userTableBtnReativar}
                                title="Reativar"
                                aria-label="Reativar"
                              >
                                ↩️
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={u.conta_status === "inativo"}
                              onClick={() => onResetPassword(u.id)}
                              className={userTableBtnResetSenha}
                              title={
                                u.conta_status === "inativo"
                                  ? "Reative a conta para alterar a senha"
                                  : "Resetar senha"
                              }
                              aria-label="Resetar senha"
                            >
                              🔑
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={usersPage}
              totalPages={usersPages}
              onPrev={() => setUsersPage((p) => Math.max(1, p - 1))}
              onNext={() => setUsersPage((p) => Math.min(usersPages, p + 1))}
            />
          </article>

          <article className="min-w-0 rounded-xl border border-dashed border-slate-700/45 bg-slate-950/20 p-4 ring-1 ring-slate-800/30">
            <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h3 className="w-full min-w-0 text-sm font-medium uppercase tracking-wide text-slate-400 sm:w-auto">Veículos (todas as empresas)</h3>
              <input
                className={`${inputClass} min-w-0 w-full border-slate-800/50 bg-slate-950/40 text-slate-300 placeholder:text-slate-600 sm:max-w-md sm:flex-1`}
                placeholder="Buscar veículo"
                value={searchVehicles}
                onChange={(e) => {
                  setVehiclesPage(1);
                  setSearchVehicles(e.target.value);
                }}
              />
            </div>
            <div className="fc-superadmin-table-scroll -mx-1 px-1 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[800px] text-[13px]">
                <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="pb-1.5 font-medium">Nome</th>
                    <th className="pb-1.5 font-medium">Placa</th>
                    <th className="pb-1.5 font-medium">Empresa</th>
                    <th className="pb-1.5 font-medium">Motorista vinculado</th>
                    <th className="pb-1.5 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {loadingVehicles && (
                    <tr>
                      <td colSpan={5}><SkeletonRows rows={3} /></td>
                    </tr>
                  )}
                  {!loadingVehicles && vehicles.map((v) => (
                    <tr key={`v-${v.id}`} className="text-slate-500">
                      <td className="min-w-0 max-w-[10rem] break-words py-1.5 font-medium text-slate-400 sm:max-w-[12rem] lg:max-w-none">
                        {v.nome}
                      </td>
                      <td className="py-1.5 tabular-nums text-slate-500">{v.placa}</td>
                      <td className="min-w-0 max-w-[9rem] break-words py-1.5 sm:max-w-[11rem] lg:max-w-none">{v.empresa_nome || "-"}</td>
                      <td className="min-w-0 max-w-[9rem] break-words py-1.5 sm:max-w-[11rem] lg:max-w-none">{v.motorista_nome || "-"}</td>
                      <td className="py-1.5 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={() => setEditingVehicle({ ...v, empresa_id: String(v.empresa_id || "") })} className={adminBtnEditarCompact}>
                            ✏️ Editar
                          </button>
                          <button type="button" onClick={() => onDeleteVehicle(v.id)} className={adminBtnExcluirCompact}>
                            🗑️ Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={vehiclesPage}
              totalPages={vehiclesPages}
              onPrev={() => setVehiclesPage((p) => Math.max(1, p - 1))}
              onNext={() => setVehiclesPage((p) => Math.min(vehiclesPages, p + 1))}
            />
          </article>
        </section>
      </div>

      <section className="grid min-w-0 gap-5">
        <article className="fc-card min-w-0 p-5">
          <h3 className="mb-3 text-lg font-semibold text-white">Visualização detalhada da empresa</h3>
          {loadingDetails && <SkeletonRows rows={4} />}
          {!loadingDetails && !selectedCompany && (
            <p className="text-sm text-slate-400">Clique em &quot;Visualizar&quot; na tabela de empresas ou de usuários (com empresa) para abrir os detalhes.</p>
          )}
          {!loadingDetails && selectedCompany && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <CompanyLogo logoUrl={resolveAsset(selectedCompany.company.logo_url)} companyName={selectedCompany.company.nome} />
                <div>
                  <p className="font-semibold text-slate-100">{selectedCompany.company.nome}</p>
                  <p className="text-xs text-slate-400">Criada em {new Date(selectedCompany.company.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 text-slate-200">
                <p className="text-xs uppercase tracking-wider text-slate-400">Resumo</p>
                <p className="mt-2 font-medium">
                  Usuários na empresa:{" "}
                  <span className="text-white">{selectedCompany.company.usuarios_count ?? selectedCompany.users?.length ?? 0}</span>
                </p>
                <p className="mt-1 font-medium">
                  Veículos vinculados:{" "}
                  <span className="text-white">{selectedCompany.company.veiculos_count ?? selectedCompany.vehicles?.length ?? 0}</span>
                </p>
              </div>
              <p className="text-slate-300">
                Motoristas: {selectedCompany.motoristas.length} | Administradores: {selectedCompany.admins.length} | Apontadores:{" "}
                {(selectedCompany.apontadores || []).length}
              </p>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Apontadores</p>
                {(selectedCompany.apontadores || []).length === 0 && <p className="text-slate-500">Nenhum apontador cadastrado.</p>}
                {(selectedCompany.apontadores || []).map((u) => (
                  <p key={`ap-${u.id}`} className="text-slate-200">
                    {u.nome} - {u.email || u.cpf_id}
                  </p>
                ))}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Administradores</p>
                {selectedCompany.admins.map((u) => <p key={`ad-${u.id}`} className="text-slate-200">{u.nome} - {u.email || u.cpf_id}</p>)}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Motoristas</p>
                {selectedCompany.motoristas.map((u) => <p key={`mo-${u.id}`} className="text-slate-200">{u.nome}</p>)}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Veículos</p>
                {selectedCompany.vehicles.map((v) => <p key={`dv-${v.id}`} className="text-slate-200">{v.nome} - {v.placa}</p>)}
              </div>
            </div>
          )}
        </article>
      </section>

      {(editingUser || editingVehicle) && (
        <div className="fixed inset-0 z-[100] flex" role="dialog" aria-modal="true" aria-labelledby="fc-admin-edit-drawer-title">
          <button
            type="button"
            className="min-h-0 flex-1 cursor-default bg-slate-950/70 backdrop-blur-[2px] transition-opacity"
            aria-label="Fechar painel de edição"
            onClick={closeEditDrawer}
          />
          <aside className="fc-superadmin-drawer flex h-full max-h-[100dvh] w-[min(100vw,26rem)] min-w-0 flex-col border-l border-slate-700/90 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 shadow-[-16px_0_48px_rgba(0,0,0,0.5)] sm:w-[min(100vw,32rem)]">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/90">Edição</p>
                <h4 id="fc-admin-edit-drawer-title" className="truncate text-lg font-semibold text-white">
                  {editingUser ? "Editar usuário" : "Editar veículo"}
                </h4>
                {editingUser && (
                  <p className="mt-1 truncate text-sm text-slate-400">{editingUser.nome}</p>
                )}
                {editingVehicle && (
                  <p className="mt-1 truncate text-sm text-slate-400">
                    {editingVehicle.nome} — {editingVehicle.placa}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeEditDrawer}
                className="fc-btn shrink-0 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
              >
                Fechar
              </button>
            </header>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              {editingUser && (
                <div className="grid min-w-0 gap-2 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <FormField label="Nome completo">
                      <input
                        className={inputClass}
                        value={editingUser.nome}
                        onChange={(e) => setEditingUser((u) => ({ ...u, nome: e.target.value }))}
                        placeholder="Nome e sobrenome"
                      />
                    </FormField>
                  </div>
                  <FormField label="E-mail">
                    <input
                      className={inputClass}
                      value={editingUser.email || ""}
                      onChange={(e) => setEditingUser((u) => ({ ...u, email: e.target.value }))}
                      placeholder={editingUser.role === "MOTORISTA" ? "Opcional para motorista" : "Obrigatório"}
                    />
                  </FormField>
                  <FormField label="CPF / identificador">
                    <input
                      className={inputClass}
                      value={editingUser.cpf_id || ""}
                      onChange={(e) => setEditingUser((u) => ({ ...u, cpf_id: e.target.value }))}
                      placeholder="CPF ou ID"
                    />
                  </FormField>
                  <FormField label="Tipo de usuário">
                    <select
                      className={inputClass}
                      value={editingUser.role}
                      onChange={(e) => {
                        const role = e.target.value;
                        setEditingUser((u) => ({
                          ...u,
                          role,
                          empresa_id: role === "SUPER_ADMIN" ? "" : u.empresa_id,
                          veiculo_id: role === "MOTORISTA" ? u.veiculo_id : "",
                        }));
                      }}
                    >
                      <option value="MOTORISTA">Motorista</option>
                      <option value="ADMIN_EMPRESA">Administrador da empresa</option>
                      <option value="APONTADOR">Apontador</option>
                      <option value="SUPER_ADMIN">Administrador geral</option>
                    </select>
                  </FormField>
                  <FormField label="Status operacional (pessoa)">
                    <select
                      className={inputClass}
                      value={editingUser.status_operacional || "ativo"}
                      onChange={(e) => setEditingUser((u) => ({ ...u, status_operacional: e.target.value }))}
                    >
                      <option value="ativo">Ativo</option>
                      <option value="afastado">Afastado</option>
                      <option value="suspenso">Suspenso</option>
                    </select>
                  </FormField>
                  <FormField label="Conta (acesso ao sistema)">
                    <select
                      className={inputClass}
                      value={editingUser.conta_status === "inativo" ? "inativo" : "ativo"}
                      onChange={(e) => setEditingUser((u) => ({ ...u, conta_status: e.target.value }))}
                    >
                      <option value="ativo">Ativo — pode fazer login</option>
                      <option value="inativo">Inativo — bloqueado</option>
                    </select>
                  </FormField>
                  <div className="md:col-span-2">
                    <FormField label="Empresa">
                      <select
                        className={inputClass}
                        value={editingUser.empresa_id}
                        onChange={(e) => setEditingUser((u) => ({ ...u, empresa_id: e.target.value, veiculo_id: "" }))}
                        disabled={editingUser.role === "SUPER_ADMIN"}
                      >
                        <option value="">Selecione a empresa</option>
                        {companyOptions.map((c) => (
                          <option key={`ec-${c.id}`} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="Veículo vinculado (opcional)">
                      {editingUser.role === "MOTORISTA" ? (
                        <select
                          className={inputClass}
                          value={editingUser.veiculo_id || ""}
                          onChange={(e) => setEditingUser((u) => ({ ...u, veiculo_id: e.target.value }))}
                          disabled={!editingUser.empresa_id}
                        >
                          <option value="">{editingUser.empresa_id ? "Selecione o veículo" : "Escolha primeiro a empresa"}</option>
                          {motoristaVehicleSelectOptions.map((v) => (
                            <option key={`uv-${v.id}`} value={v.id}>
                              {v.nome} — {v.placa}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-500">
                          Apenas motoristas têm veículo vinculado.
                        </p>
                      )}
                    </FormField>
                  </div>
                  <FormField label="Função / cargo">
                    <input
                      className={inputClass}
                      value={editingUser.funcao || ""}
                      onChange={(e) => setEditingUser((u) => ({ ...u, funcao: e.target.value }))}
                      placeholder="Ex.: Operador de caçamba"
                    />
                  </FormField>
                  <FormField label="URL da foto de perfil">
                    <input
                      className={inputClass}
                      value={editingUser.profile_image_url || ""}
                      onChange={(e) => setEditingUser((u) => ({ ...u, profile_image_url: e.target.value }))}
                      placeholder="Caminho ou URL (opcional)"
                    />
                  </FormField>
                  <FormField label="CNH categoria (opcional)">
                    <input
                      className={inputClass}
                      value={editingUser.cnh_categoria || ""}
                      onChange={(e) => setEditingUser((u) => ({ ...u, cnh_categoria: e.target.value }))}
                      placeholder="Ex.: D"
                    />
                  </FormField>
                  <FormField label="CNH número (opcional)">
                    <input
                      className={inputClass}
                      value={editingUser.cnh_numero || ""}
                      onChange={(e) => setEditingUser((u) => ({ ...u, cnh_numero: e.target.value }))}
                    />
                  </FormField>
                  <FormField label="CNH validade (opcional)">
                    <input
                      type="date"
                      className={inputClass}
                      value={editingUser.cnh_validade || ""}
                      onChange={(e) => setEditingUser((u) => ({ ...u, cnh_validade: e.target.value }))}
                    />
                  </FormField>
                  <div className="md:col-span-2">
                    <FormField label="Equipamento vínculo">
                      <input
                        className={inputClass}
                        value={editingUser.equipamento_vinculo || ""}
                        onChange={(e) => setEditingUser((u) => ({ ...u, equipamento_vinculo: e.target.value }))}
                      />
                    </FormField>
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="Escopo operação">
                      <input
                        className={inputClass}
                        value={editingUser.operacao_escopo || ""}
                        onChange={(e) => setEditingUser((u) => ({ ...u, operacao_escopo: e.target.value }))}
                      />
                    </FormField>
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="Observações">
                      <textarea
                        className={inputClass}
                        rows={3}
                        value={editingUser.observacoes || ""}
                        onChange={(e) => setEditingUser((u) => ({ ...u, observacoes: e.target.value }))}
                      />
                    </FormField>
                  </div>
                </div>
              )}

              {editingVehicle && (
                <div className="grid min-w-0 gap-3">
                  <FormField label="Nome do veículo">
                    <input
                      className={inputClass}
                      value={editingVehicle.nome}
                      onChange={(e) => setEditingVehicle((v) => ({ ...v, nome: e.target.value }))}
                      placeholder="Nome do veículo"
                    />
                  </FormField>
                  <FormField label="Placa">
                    <input
                      className={inputClass}
                      value={editingVehicle.placa}
                      onChange={(e) => setEditingVehicle((v) => ({ ...v, placa: e.target.value }))}
                      placeholder="Placa"
                    />
                  </FormField>
                  <FormField label="Empresa">
                    <select
                      className={inputClass}
                      value={editingVehicle.empresa_id}
                      onChange={(e) => setEditingVehicle((v) => ({ ...v, empresa_id: e.target.value }))}
                    >
                      <option value="">Empresa</option>
                      {companyOptions.map((c) => (
                        <option key={`ev-${c.id}`} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
              )}
            </div>

            <footer className="flex min-w-0 shrink-0 flex-wrap gap-2 border-t border-slate-800 bg-slate-950/95 px-4 py-4 sm:px-5">
              {editingUser && (
                <>
                  <button type="button" onClick={onSaveUserEdit} className="fc-btn flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold sm:flex-none">
                    Salvar alterações
                  </button>
                  <button
                    type="button"
                    onClick={closeEditDrawer}
                    className="fc-btn rounded-lg border border-slate-600 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                </>
              )}
              {editingVehicle && (
                <>
                  <button type="button" onClick={onSaveVehicleEdit} className="fc-btn flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold sm:flex-none">
                    Salvar alterações
                  </button>
                  <button
                    type="button"
                    onClick={closeEditDrawer}
                    className="fc-btn rounded-lg border border-slate-600 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                </>
              )}
            </footer>
          </aside>
        </div>
      )}

      <ConfirmActionModal
        open={Boolean(actionConfirm)}
        title={actionConfirm?.title || "Confirmar ação"}
        description={actionConfirm?.description || ""}
        consequence={actionConfirm?.consequence || ""}
        confirmLabel={actionConfirm?.confirmLabel || "Confirmar"}
        confirmLoadingLabel={actionConfirm?.confirmLoadingLabel || "Confirmando..."}
        tone={actionConfirm?.tone || "danger"}
        loading={actionConfirmLoading}
        onClose={closeActionConfirm}
        onConfirm={() => void confirmAction()}
      />

      <ConfirmActionModal
        open={resetPasswordModal.open}
        title={resetPasswordModal.mode === "manual" ? "Definir nova senha" : "Redefinir senha de usuário"}
        description={
          resetPasswordModal.mode === "manual"
            ? "Informe uma nova senha forte para substituir a senha atual do usuário."
            : "Escolha como deseja resetar a credencial de acesso deste usuário."
        }
        consequence={
          resetPasswordModal.mode === "manual"
            ? "A nova senha passará a valer imediatamente no próximo login."
            : "A senha atual será invalidada e substituída por uma senha temporária."
        }
        confirmLabel={resetPasswordModal.mode === "manual" ? "Atualizar senha" : "Gerar senha temporária"}
        confirmLoadingLabel={resetPasswordModal.mode === "manual" ? "Atualizando..." : "Gerando senha..."}
        confirmDisabled={resetPasswordModal.mode === "manual" && !String(resetPasswordModal.customPassword || "").trim()}
        secondaryActionLabel={resetPasswordModal.mode === "manual" ? "Usar senha temporária" : "Definir senha manual"}
        onSecondaryAction={() => switchResetPasswordMode(resetPasswordModal.mode === "manual" ? "choice" : "manual")}
        tone="warning"
        loading={resetPasswordModal.loading}
        onClose={closeResetPasswordModal}
        onConfirm={() => void confirmResetPassword()}
      >
        {resetPasswordModal.mode === "manual" ? (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-amber-100">
              Nova senha
              <input
                type="password"
                autoComplete="new-password"
                value={resetPasswordModal.customPassword}
                onChange={(event) => setResetPasswordModal((prev) => ({ ...prev, customPassword: event.target.value }))}
                className="mt-2 w-full rounded-lg border border-amber-400/45 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-300"
                placeholder="Mínimo 8 caracteres"
              />
            </label>
            <p className="text-xs text-amber-200/90">Requisitos: ao menos 8 caracteres, com maiúscula, minúscula e número.</p>
          </div>
        ) : null}
      </ConfirmActionModal>

      <UserDetailsModal open={open} onClose={closeUserDetailsModal} user={selectedUser} loading={userDetailLoading} />

    </div>
  );
}
