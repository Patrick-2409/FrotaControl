import { useCallback, useEffect, useRef, useState } from "react";
import api, { getBaseURL } from "../services/api";
import FormField, { inputClass } from "../components/FormField";
import useDebouncedValue from "../hooks/useDebouncedValue";
import PaginationControls from "../components/PaginationControls";
import SkeletonRows from "../components/SkeletonRows";
import { emitToast } from "../services/uiEvents";
import { CenteredSpinner } from "../components/LoadingState";
import EmptyState from "../components/EmptyState";
import Avatar from "../components/Avatar";
import CompanyLogo from "../components/CompanyLogo";

const API_BASE = getBaseURL();
const resolveAsset = (value) => {
  if (!value) return null;
  return value.startsWith("http") ? value : `${API_BASE}${value.startsWith("/") ? value : `/${value}`}`;
};
const formatRole = (role) => {
  if (role === "SUPER_ADMIN") return "Super Admin";
  if (role === "ADMIN_EMPRESA") return "Admin Empresa";
  return "Motorista";
};
const roleBadge = (role) =>
  role === "SUPER_ADMIN"
    ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
    : role === "ADMIN_EMPRESA"
      ? "border-violet-500/40 bg-violet-500/15 text-violet-200"
      : "border-blue-500/40 bg-blue-500/15 text-blue-200";
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

export default function AdminPage() {
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
  const [editingVehicle, setEditingVehicle] = useState(null);
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

  useEffect(() => {
    Promise.all([loadOverview(), loadCompanyOptions()]).catch(() => {
      emitToast("Falha ao carregar dados iniciais do painel global.", "error");
    });
  }, []);

  useEffect(() => {
    loadCompanies().catch(() => emitToast("Falha ao carregar empresas.", "error"));
  }, [loadCompanies]);

  useEffect(() => {
    loadUsers().catch(() => emitToast("Falha ao carregar usuários.", "error"));
  }, [loadUsers]);

  useEffect(() => {
    loadVehicles().catch(() => emitToast("Falha ao carregar veículos.", "error"));
  }, [loadVehicles]);

  useEffect(() => {
    if (!debouncedGlobalSearch.trim()) {
      setSearchResults({ companies: [], users: [], vehicles: [] });
      return;
    }
    api
      .get("/super-admin/search", { params: { q: debouncedGlobalSearch } })
      .then(({ data }) => setSearchResults(data))
      .catch(() => emitToast("Falha na busca global.", "warning"));
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
      emitToast("Informe e-mail e senha do admin da empresa.", "error");
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
          formData.append("admin_nome", companyForm.admin_nome?.trim() || `Admin ${companyForm.nome.trim()}`);
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
          payload.admin_nome = companyForm.admin_nome?.trim() || `Admin ${companyForm.nome.trim()}`;
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
          : `Empresa criada. Login do admin: ${companyForm.admin_email}`,
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

  const onDeleteCompany = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir esta empresa?")) return;
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
  };

  const onDeleteUser = async (id) => {
    if (!window.confirm("Excluir usuário?")) return;
    try {
      await api.delete(`/super-admin/users/${id}`);
      emitToast("Usuário excluído.");
      await Promise.all([loadOverview(), loadUsers(), selectedCompany ? loadCompanyDetails(selectedCompany.company.id) : Promise.resolve()]);
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao excluir usuário.", "error");
    }
  };

  const onResetPassword = async (id) => {
    const useCustomPassword = window.confirm(
      "Deseja definir uma nova senha manualmente?\n\nOK = definir senha personalizada\nCancelar = gerar senha temporária"
    );
    let payload = {};
    if (useCustomPassword) {
      const customPassword = window.prompt(
        "Digite a nova senha (mín. 8 caracteres, com maiúscula, minúscula e número):"
      );
      if (customPassword == null) return;
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(customPassword)) {
        emitToast("Senha inválida. Use ao menos 8 caracteres, maiúscula, minúscula e número.", "error");
        return;
      }
      payload = { new_password: customPassword };
    }
    try {
      const { data } = await api.post(`/super-admin/users/${id}/reset-password`, payload);
      if (useCustomPassword) {
        emitToast("Senha atualizada com sucesso.");
      } else {
        emitToast(`Senha resetada. Temporária: ${data.temporary_password}`);
      }
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao resetar senha.", "error");
    }
  };

  const onSaveUserEdit = async () => {
    if (!editingUser) return;
    try {
      await api.put(`/super-admin/users/${editingUser.id}`, {
        nome: editingUser.nome,
        email: editingUser.email,
        cpf_id: editingUser.cpf_id,
        role: editingUser.role,
        empresa_id:
          editingUser.role === "SUPER_ADMIN"
            ? null
            : (editingUser.empresa_id ? Number(editingUser.empresa_id) : null),
        veiculo_id:
          editingUser.role === "MOTORISTA" && editingUser.veiculo_id
            ? Number(editingUser.veiculo_id)
            : null,
        senha: "",
      });
      emitToast("Usuário atualizado com sucesso.");
      setEditingUser(null);
      await Promise.all([loadUsers(), loadOverview(), selectedCompany ? loadCompanyDetails(selectedCompany.company.id) : Promise.resolve()]);
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao atualizar usuário.", "error");
    }
  };

  const onDeleteVehicle = async (id) => {
    if (!window.confirm("Excluir veículo?")) return;
    try {
      await api.delete(`/super-admin/vehicles/${id}`);
      emitToast("Veículo excluído.");
      await Promise.all([loadVehicles(), loadOverview(), selectedCompany ? loadCompanyDetails(selectedCompany.company.id) : Promise.resolve()]);
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao excluir veículo.", "error");
    }
  };

  const onSaveVehicleEdit = async () => {
    if (!editingVehicle) return;
    try {
      await api.put(`/super-admin/vehicles/${editingVehicle.id}`, {
        nome: editingVehicle.nome,
        placa: editingVehicle.placa,
        empresa_id: Number(editingVehicle.empresa_id),
      });
      emitToast("Veículo atualizado com sucesso.");
      setEditingVehicle(null);
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

  return (
    <div className="space-y-6">
      {loading && <CenteredSpinner label="Salvando empresa..." />}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="fc-card rounded-2xl border border-violet-500/20 p-4">
            <p className="text-xs text-slate-400">{kpi.label}</p>
            <p className="mt-2 text-2xl font-bold text-white">{kpi.value}</p>
          </article>
        ))}
      </section>

      <section className="fc-card p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px_220px]">
          <input
            className={inputClass}
            placeholder="Buscar globalmente: empresa, usuário ou veículo"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
          <select
            className={inputClass}
            value={filters.role}
            onChange={(e) => {
              setUsersPage(1);
              setFilters((f) => ({ ...f, role: e.target.value }));
            }}
          >
            <option value="ALL">Tipo de usuário (todos)</option>
            <option value="MOTORISTA">Motorista</option>
            <option value="ADMIN_EMPRESA">Admin empresa</option>
            <option value="SUPER_ADMIN">Super admin</option>
          </select>
          <select
            className={inputClass}
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
            className={inputClass}
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
          <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-sm">
            <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Resultado da busca global</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <p className="mb-1 text-xs text-slate-400">Empresas</p>
                {searchResults.companies.map((c) => <p key={`sr-c-${c.id}`} className="truncate text-slate-200">{c.nome}</p>)}
              </div>
              <div>
                <p className="mb-1 text-xs text-slate-400">Usuários</p>
                {searchResults.users.map((u) => <p key={`sr-u-${u.id}`} className="truncate text-slate-200">{u.nome} - {u.empresa_nome}</p>)}
              </div>
              <div>
                <p className="mb-1 text-xs text-slate-400">Veículos</p>
                {searchResults.vehicles.map((v) => <p key={`sr-v-${v.id}`} className="truncate text-slate-200">{v.nome} - {v.placa}</p>)}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form onSubmit={onSaveCompany} className="fc-card p-5">
          <h2 className="mb-1 text-lg font-semibold text-white">
            {companyForm.id ? "Editar empresa" : "Nova empresa"}
          </h2>
          <p className="mb-4 text-sm text-slate-400">Controle global de empresas e admins.</p>
          <FormField label="Nome da empresa">
            <input className={inputClass} value={companyForm.nome} onChange={(e) => setCompanyForm({ ...companyForm, nome: e.target.value })} />
          </FormField>
          {!companyForm.id && (
            <>
              <FormField label="Nome do admin da empresa">
                <input className={inputClass} value={companyForm.admin_nome} onChange={(e) => setCompanyForm({ ...companyForm, admin_nome: e.target.value })} placeholder="Ex: Maria Gestora" />
              </FormField>
              <FormField label="E-mail do admin da empresa">
                <input className={inputClass} value={companyForm.admin_email} onChange={(e) => setCompanyForm({ ...companyForm, admin_email: e.target.value })} placeholder="admin@empresa.com" />
              </FormField>
              <FormField label="Senha do admin da empresa">
                <input type="password" className={inputClass} value={companyForm.admin_senha} onChange={(e) => setCompanyForm({ ...companyForm, admin_senha: e.target.value })} placeholder="Min 8, com maiúscula, minúscula e número" />
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

        <section className="space-y-5">
          <article className="fc-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-white">Empresas</h3>
              <input
                className={inputClass}
                placeholder="Buscar empresa"
                value={search}
                onChange={(e) => {
                  setCompanyPage(1);
                  setSearch(e.target.value);
                }}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
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
                <tbody className="divide-y divide-slate-800">
                  {loadingCompanies && (
                    <tr>
                      <td colSpan={6}><SkeletonRows rows={3} /></td>
                    </tr>
                  )}
                  {!loadingCompanies && companies.map((company) => (
                    <tr key={company.id} className="text-slate-200">
                      <td className="py-2"><CompanyLogo logoUrl={resolveAsset(company.logo_url)} companyName={company.nome} className="h-10 w-10" /></td>
                      <td className="py-2 font-medium">{company.nome}</td>
                      <td className="py-2">{company.usuarios_count ?? "-"}</td>
                      <td className="py-2">{company.veiculos_count ?? "-"}</td>
                      <td className="py-2">{new Date(company.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button type="button" onClick={() => loadCompanyDetails(company.id)} className="fc-btn rounded-lg border border-blue-400/35 bg-blue-500/15 px-2 py-1 text-xs text-blue-100">Visualizar</button>
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
                            className="fc-btn rounded-lg border border-violet-400/35 bg-violet-500/15 px-2 py-1 text-xs text-violet-100"
                          >
                            Editar
                          </button>
                          <button type="button" onClick={() => onDeleteCompany(company.id)} className="fc-btn rounded-lg border border-red-400/35 bg-red-500/10 px-2 py-1 text-xs text-red-200">Excluir</button>
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

          <article className="fc-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-white">Usuários (global)</h3>
              <input
                className={inputClass}
                placeholder="Buscar usuário"
                value={searchUsers}
                onChange={(e) => {
                  setUsersPage(1);
                  setSearchUsers(e.target.value);
                }}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="pb-2">Avatar</th>
                    <th className="pb-2">Nome</th>
                    <th className="pb-2">Email/CPF</th>
                    <th className="pb-2">Tipo</th>
                    <th className="pb-2">Empresa</th>
                    <th className="pb-2">Veículo</th>
                    <th className="pb-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loadingUsers && (
                    <tr>
                      <td colSpan={7}><SkeletonRows rows={3} /></td>
                    </tr>
                  )}
                  {!loadingUsers && users.map((u) => (
                    <tr key={`u-${u.id}`} className="text-slate-200">
                      <td className="py-2">
                        <Avatar imageUrl={resolveAsset(u.profile_image_url)} name={u.nome} size="list" />
                      </td>
                      <td className="py-2 font-medium">{u.nome}</td>
                      <td className="py-2">{u.email || u.cpf_id}</td>
                      <td className="py-2">
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${roleBadge(u.role)}`}>{formatRole(u.role)}</span>
                      </td>
                      <td className="py-2">{u.empresa_nome || "-"}</td>
                      <td className="py-2">{u.veiculo_nome || "-"}</td>
                      <td className="py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button type="button" onClick={() => setEditingUser({ ...u, empresa_id: String(u.empresa_id || ""), veiculo_id: String(u.veiculo_id || "") })} className="fc-btn rounded-lg border border-blue-400/35 bg-blue-500/15 px-2 py-1 text-xs text-blue-100">Editar</button>
                          <button type="button" onClick={() => onDeleteUser(u.id)} className="fc-btn rounded-lg border border-red-400/35 bg-red-500/10 px-2 py-1 text-xs text-red-200">Excluir</button>
                          <button type="button" onClick={() => onResetPassword(u.id)} className="fc-btn rounded-lg border border-amber-400/35 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">Resetar senha</button>
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

          <article className="fc-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-white">Veículos (global)</h3>
              <input
                className={inputClass}
                placeholder="Buscar veículo"
                value={searchVehicles}
                onChange={(e) => {
                  setVehiclesPage(1);
                  setSearchVehicles(e.target.value);
                }}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="pb-2">Nome</th>
                    <th className="pb-2">Placa</th>
                    <th className="pb-2">Empresa</th>
                    <th className="pb-2">Motorista vinculado</th>
                    <th className="pb-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loadingVehicles && (
                    <tr>
                      <td colSpan={5}><SkeletonRows rows={3} /></td>
                    </tr>
                  )}
                  {!loadingVehicles && vehicles.map((v) => (
                    <tr key={`v-${v.id}`} className="text-slate-200">
                      <td className="py-2 font-medium">{v.nome}</td>
                      <td className="py-2">{v.placa}</td>
                      <td className="py-2">{v.empresa_nome || "-"}</td>
                      <td className="py-2">{v.motorista_nome || "-"}</td>
                      <td className="py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button type="button" onClick={() => setEditingVehicle({ ...v, empresa_id: String(v.empresa_id || "") })} className="fc-btn rounded-lg border border-blue-400/35 bg-blue-500/15 px-2 py-1 text-xs text-blue-100">Editar</button>
                          <button type="button" onClick={() => onDeleteVehicle(v.id)} className="fc-btn rounded-lg border border-red-400/35 bg-red-500/10 px-2 py-1 text-xs text-red-200">Excluir</button>
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

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="fc-card p-5">
          <h3 className="mb-3 text-lg font-semibold text-white">Visualização detalhada da empresa</h3>
          {loadingDetails && <SkeletonRows rows={4} />}
          {!loadingDetails && !selectedCompany && (
            <p className="text-sm text-slate-400">Clique em "Visualizar" na tabela de empresas para abrir os detalhes.</p>
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
              <p className="text-slate-300">Motoristas: {selectedCompany.motoristas.length} | Admins: {selectedCompany.admins.length} | Veículos: {selectedCompany.vehicles.length}</p>
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

        <article className="space-y-4">
          {editingUser && (
            <div className="fc-card p-5">
              <h4 className="mb-3 text-base font-semibold text-white">Editar usuário global</h4>
              <div className="grid gap-2 md:grid-cols-2">
                <input className={inputClass} value={editingUser.nome} onChange={(e) => setEditingUser((u) => ({ ...u, nome: e.target.value }))} placeholder="Nome" />
                <input className={inputClass} value={editingUser.email || ""} onChange={(e) => setEditingUser((u) => ({ ...u, email: e.target.value }))} placeholder="E-mail" />
                <input className={inputClass} value={editingUser.cpf_id || ""} onChange={(e) => setEditingUser((u) => ({ ...u, cpf_id: e.target.value }))} placeholder="CPF/ID" />
                <select className={inputClass} value={editingUser.role} onChange={(e) => setEditingUser((u) => ({ ...u, role: e.target.value }))}>
                  <option value="MOTORISTA">Motorista</option>
                  <option value="ADMIN_EMPRESA">Admin Empresa</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
                <select
                  className={inputClass}
                  value={editingUser.empresa_id}
                  onChange={(e) => setEditingUser((u) => ({ ...u, empresa_id: e.target.value }))}
                  disabled={editingUser.role === "SUPER_ADMIN"}
                >
                  <option value="">Empresa</option>
                  {companyOptions.map((c) => <option key={`ec-${c.id}`} value={c.id}>{c.nome}</option>)}
                </select>
                <input
                  className={inputClass}
                  value={editingUser.veiculo_id || ""}
                  onChange={(e) => setEditingUser((u) => ({ ...u, veiculo_id: e.target.value }))}
                  placeholder="ID do veículo (opcional)"
                  disabled={editingUser.role !== "MOTORISTA"}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={onSaveUserEdit} className="fc-btn rounded-lg bg-blue-600 px-4 py-2 text-sm">Salvar</button>
                <button type="button" onClick={() => setEditingUser(null)} className="fc-btn rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancelar</button>
              </div>
            </div>
          )}

          {editingVehicle && (
            <div className="fc-card p-5">
              <h4 className="mb-3 text-base font-semibold text-white">Editar veículo global</h4>
              <div className="grid gap-2 md:grid-cols-2">
                <input className={inputClass} value={editingVehicle.nome} onChange={(e) => setEditingVehicle((v) => ({ ...v, nome: e.target.value }))} placeholder="Nome do veículo" />
                <input className={inputClass} value={editingVehicle.placa} onChange={(e) => setEditingVehicle((v) => ({ ...v, placa: e.target.value }))} placeholder="Placa" />
                <select className={inputClass} value={editingVehicle.empresa_id} onChange={(e) => setEditingVehicle((v) => ({ ...v, empresa_id: e.target.value }))}>
                  <option value="">Empresa</option>
                  {companyOptions.map((c) => <option key={`ev-${c.id}`} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={onSaveVehicleEdit} className="fc-btn rounded-lg bg-blue-600 px-4 py-2 text-sm">Salvar</button>
                <button type="button" onClick={() => setEditingVehicle(null)} className="fc-btn rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancelar</button>
              </div>
            </div>
          )}
        </article>
      </section>

    </div>
  );
}
