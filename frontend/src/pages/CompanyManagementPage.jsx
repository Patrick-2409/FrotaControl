import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { FROTA_PANEL_PATH } from "../components/empresaSidebarConstants";
import api, { extractApiErrorMessage, resolveBackendAssetUrl } from "../services/api";
import { useAuth } from "../services/auth";
import { inputClass } from "../components/FormField";
import PaginationControls from "../components/PaginationControls";
import SkeletonRows from "../components/SkeletonRows";
import EmptyState from "../components/EmptyState";
import ConfirmActionModal from "../components/ConfirmActionModal";
import { emitToast } from "../services/uiEvents";
import { CenteredSpinner } from "../components/LoadingState";
import useDebouncedValue from "../hooks/useDebouncedValue";
import Avatar from "../components/Avatar";
import { CNH_CATEGORIAS, cnhBadgeClass, cnhStatusLabel, getCnhStatus } from "../utils/cnhStatus";

const roleLabel = (role) => {
  if (role === "ADMIN_EMPRESA") return "Administrador";
  if (role === "APONTADOR") return "Apontador";
  return "Motorista";
};
const roleBadgeClass = (role) => {
  if (role === "ADMIN_EMPRESA") return "border-violet-400/40 bg-violet-500/15 text-violet-100";
  if (role === "APONTADOR") return "border-cyan-400/35 bg-cyan-500/15 text-cyan-100";
  return "border-blue-400/40 bg-blue-500/15 text-blue-100";
};
const contaBadgeClass = (conta_status) =>
  conta_status === "inativo"
    ? "border-slate-500/50 bg-slate-800/90 text-slate-300"
    : "border-emerald-500/45 bg-emerald-600/15 text-emerald-200";
const dedupeById = (items = []) => {
  const map = new Map();
  for (const item of items) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
};
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
export default function CompanyManagementPage() {
  const { user: authUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingVehiclePicklist, setLoadingVehiclePicklist] = useState(false);
  const [users, setUsers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState({ users: "" });
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [pendingContaStatusAction, setPendingContaStatusAction] = useState(null);
  const debouncedUsers = useDebouncedValue(search.users);

  const emptyUserForm = () => ({
    id: null,
    nome: "",
    email: "",
    cpf_id: "",
    senha: "",
    role: "MOTORISTA",
    veiculo_id: "",
    cnh_numero: "",
    cnh_categoria: "",
    cnh_validade: "",
  });
  const [userForm, setUserForm] = useState(emptyUserForm);

  const ymdFromUser = (d) => {
    if (!d) return "";
    if (typeof d === "string") return d.slice(0, 10);
    try {
      return new Date(d).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  };
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data } = await api.get("/dashboard/manage/users", {
        params: { page: usersPage, limit: 6, search: debouncedUsers },
      });
      setUsers(dedupeById(data.items || []));
      setUsersTotalPages(data.totalPages || 1);
    } finally {
      setLoadingUsers(false);
    }
  }, [usersPage, debouncedUsers]);

  const loadVehiclePicklist = useCallback(async () => {
    setLoadingVehiclePicklist(true);
    try {
      const { data } = await api.get("/dashboard/manage/vehicles", {
        params: { page: 1, limit: 500, search: "" },
      });
      setVehicles(dedupeById(data.items || []));
    } catch {
      setVehicles([]);
    } finally {
      setLoadingVehiclePicklist(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadVehiclePicklist();
  }, [loadVehiclePicklist]);

  const onSaveUser = async (e) => {
    e.preventDefault();
    const isMotorista = userForm.role === "MOTORISTA";
    if (!userForm.nome.trim() || !userForm.cpf_id.trim() || (!isMotorista && !userForm.email.trim())) {
      emitToast(isMotorista ? "Preencha nome e CPF/ID." : "Preencha nome, e-mail e CPF/ID.", "warning");
      return;
    }
    if (userForm.role !== "MOTORISTA" && !userForm.email.trim()) {
      emitToast("Administrador e apontador precisam de e-mail (o apontador entra com e-mail e senha).", "warning");
      return;
    }
    const senha = String(userForm.senha || "");
    if (!userForm.id && !isMotorista && !senha.trim()) {
      emitToast("Informe uma senha inicial para administrador ou apontador.", "warning");
      return;
    }
    if (senha && !PASSWORD_REGEX.test(senha)) {
      emitToast("Senha deve ter ao menos 8 caracteres, maiúscula, minúscula e número.", "warning");
      return;
    }
    const veiculoId =
      userForm.role === "MOTORISTA" && userForm.veiculo_id ? Number(userForm.veiculo_id) : null;
    setLoading(true);
    try {
      const payload = {
        nome: userForm.nome.trim(),
        email: userForm.email.trim() || undefined,
        cpf_id: userForm.cpf_id.trim(),
        senha: userForm.senha,
        role: userForm.role,
        veiculo_id: veiculoId,
        cnh_numero: isMotorista ? String(userForm.cnh_numero).trim() || null : null,
        cnh_categoria: isMotorista ? String(userForm.cnh_categoria).trim() || null : null,
        cnh_validade: isMotorista ? userForm.cnh_validade || null : null,
      };
      let response;
      if (userForm.id) {
        response = await api.put(`/dashboard/manage/users/${userForm.id}`, payload);
      } else {
        response = await api.post("/dashboard/manage/users", payload);
      }
      const temporaryPassword = response?.data?.temporary_password;
      if (temporaryPassword) {
        emitToast(`Usuário criado. Senha temporária: ${temporaryPassword}`, "success", { durationMs: 12000 });
      } else {
        emitToast(userForm.id ? "Usuário atualizado com sucesso." : "Usuário criado com sucesso.");
      }
      setUserForm(emptyUserForm());
      await loadUsers();
    } catch (err) {
      emitToast(err.response?.data?.message || "Erro ao salvar usuário.", "error");
    } finally {
      setLoading(false);
    }
  };

  const applyUserContaStatus = useCallback(async (id, conta_status) => {
    setLoading(true);
    try {
      await api.patch(`/dashboard/manage/users/${id}/conta-status`, { conta_status });
      emitToast(conta_status === "inativo" ? "Usuário desativado." : "Usuário reativado.");
      await loadUsers();
      return true;
    } catch (err) {
      emitToast(extractApiErrorMessage(err) || "Erro ao atualizar conta.", "error");
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadUsers]);

  const onPatchUserContaStatus = useCallback((id, conta_status) => {
    if (conta_status === "inativo") {
      setPendingContaStatusAction({ id, conta_status });
      return;
    }
    void applyUserContaStatus(id, conta_status);
  }, [applyUserContaStatus]);

  const closeContaStatusModal = useCallback(() => {
    if (loading) return;
    setPendingContaStatusAction(null);
  }, [loading]);

  const confirmContaStatusModal = useCallback(async () => {
    if (!pendingContaStatusAction) return;
    const { id, conta_status } = pendingContaStatusAction;
    await applyUserContaStatus(id, conta_status);
    setPendingContaStatusAction(null);
  }, [pendingContaStatusAction, applyUserContaStatus]);

  if (searchParams.get("secao") === "veiculos") {
    return <Navigate to={FROTA_PANEL_PATH} replace />;
  }
  if (searchParams.get("secao") === "motoristas") {
    return <Navigate to="/empresa/pessoas" replace />;
  }

  const vehicleOptions = vehicles || [];

  return (
    <div className="space-y-6">
      {loading && <CenteredSpinner label="Salvando alterações..." />}
      <section className="fc-card border-blue-500/20 p-5">
        <h2 className="mb-1 text-lg font-semibold text-white">Contas de acesso</h2>
        <p className="text-sm text-slate-400">
          Crie e mantenha credenciais de motoristas, apontadores e administradores. Dados operacionais, CNH e vínculos ficam em{" "}
          <Link to="/empresa/pessoas" className="font-medium text-blue-300 hover:text-blue-200">
            Pessoas
          </Link>
          ; cadastro e documentação da frota ficam em{" "}
          <Link to={FROTA_PANEL_PATH} className="font-medium text-blue-300 hover:text-blue-200">
            Frota
          </Link>
          .
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Fluxo recomendado: criar conta, definir papel, vincular veículo quando houver definição operacional e completar o cadastro no módulo correto.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
          <article className="fc-card border-blue-500/20 p-5">
            <h3 className="mb-1 text-base font-semibold text-white">
              {userForm.id ? "Editar conta" : "Criar conta"}
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              Administradores e apontadores usam e-mail e senha. Motoristas podem ser criados com CPF/ID; se a senha ficar vazia, o sistema gera uma senha temporária.
            </p>
            <form onSubmit={onSaveUser}>
              <div className="grid gap-2 md:grid-cols-2">
                <input className={inputClass} placeholder="Nome" value={userForm.nome} onChange={(e) => setUserForm((f) => ({ ...f, nome: e.target.value }))} />
                <input className={inputClass} placeholder="E-mail" value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))} />
                <input className={inputClass} placeholder="CPF/ID" value={userForm.cpf_id} onChange={(e) => setUserForm((f) => ({ ...f, cpf_id: e.target.value }))} />
                <input className={inputClass} type="password" placeholder={userForm.id || userForm.role === "MOTORISTA" ? "Senha (opcional)" : "Senha"} value={userForm.senha} onChange={(e) => setUserForm((f) => ({ ...f, senha: e.target.value }))} />
                <select
                  className={inputClass}
                  value={userForm.role}
                  onChange={(e) => {
                    const role = e.target.value;
                    setUserForm((f) => ({
                      ...f,
                      role,
                      veiculo_id: role === "MOTORISTA" ? f.veiculo_id : "",
                      cnh_numero: role === "MOTORISTA" ? f.cnh_numero : "",
                      cnh_categoria: role === "MOTORISTA" ? f.cnh_categoria : "",
                      cnh_validade: role === "MOTORISTA" ? f.cnh_validade : "",
                    }));
                  }}
                >
                  <option value="MOTORISTA">Motorista</option>
                  <option value="ADMIN_EMPRESA">Admin da empresa</option>
                  <option value="APONTADOR">Apontador</option>
                </select>
                {userForm.role === "MOTORISTA" ? (
                  <div className="md:col-span-2">
                    <select
                      className={inputClass}
                      value={userForm.veiculo_id}
                      disabled={loadingVehiclePicklist}
                      onChange={(e) => setUserForm((f) => ({ ...f, veiculo_id: e.target.value }))}
                    >
                      <option value="">
                        {loadingVehiclePicklist ? "Carregando veículos..." : "Vínculo de veículo (opcional)"}
                      </option>
                      {vehicleOptions.map((v) => (
                        <option key={`v-opt-${v.id}`} value={v.id}>
                          {v.nome} - {v.placa}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Opcional neste momento. Cadastre ou edite veículos em{" "}
                      <Link to={FROTA_PANEL_PATH} className="text-blue-300 hover:text-blue-200">
                        Painel frota
                      </Link>
                      .
                    </p>
                  </div>
                ) : (
                  <p className="flex items-center rounded-lg border border-slate-800/80 bg-slate-900/50 px-3 py-2.5 text-xs text-slate-500 md:col-span-2">
                    Veículo só se aplica a motoristas.
                  </p>
                )}
                {userForm.role === "MOTORISTA" ? (
                  <>
                    <input
                      className={inputClass}
                      placeholder="Número CNH (opcional)"
                      value={userForm.cnh_numero}
                      onChange={(e) => setUserForm((f) => ({ ...f, cnh_numero: e.target.value }))}
                    />
                    <select
                      className={inputClass}
                      value={userForm.cnh_categoria}
                      onChange={(e) => setUserForm((f) => ({ ...f, cnh_categoria: e.target.value }))}
                    >
                      <option value="">Categoria CNH (opcional)</option>
                      {CNH_CATEGORIAS.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <div>
                      <span className="mb-1 block text-sm text-slate-300">Validade da CNH (opcional)</span>
                      <input
                        className={inputClass}
                        type="date"
                        placeholder="Ex: 12/08/2026"
                        title="Ex: 12/08/2026"
                        value={userForm.cnh_validade}
                        onChange={(e) => setUserForm((f) => ({ ...f, cnh_validade: e.target.value }))}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Data de vencimento da carteira de habilitação
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
              <button className="fc-btn mt-3 w-full justify-center rounded-lg bg-blue-600 px-4 py-3 sm:w-auto">
                {userForm.id ? "Atualizar conta" : "Criar conta"}
              </button>
            </form>
          </article>

          <article className="fc-card border-blue-500/20 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-white">Contas cadastradas</h3>
              <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-300">
                Página {usersPage} de {usersTotalPages}
              </span>
            </div>
            <input
              className={inputClass}
              placeholder="Buscar por nome, e-mail ou CPF/ID"
              value={search.users}
              onChange={(e) => {
                setUsersPage(1);
                setSearch((s) => ({ ...s, users: e.target.value }));
              }}
            />
            <div className="mt-4 space-y-3">
              {loadingUsers && <SkeletonRows rows={4} />}
              {!loadingUsers && users.length === 0 && (
                <EmptyState
                  compact
                  title="Sem pessoas cadastradas"
                  description="Crie motoristas, apontadores ou outro administrador da empresa para iniciar a operação."
                />
              )}
              {users.map((u) => (
                <article key={`u-${u.id}`} className="rounded-xl border border-slate-700/90 bg-slate-950/65 p-4 shadow-md shadow-slate-950/30">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3 text-left">
                    <Avatar imageUrl={resolveBackendAssetUrl(u.profile_image_url)} name={u.nome} size="list" />
                    <div>
                      <p className="font-medium text-slate-100">{u.nome}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-full border px-2 py-0.5 font-semibold ${roleBadgeClass(u.role)}`}>
                            {roleLabel(u.role)}
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 font-semibold ${contaBadgeClass(u.conta_status)}`}>
                            Conta: {u.conta_status === "inativo" ? "inativa" : "ativa"}
                          </span>
                          {u.role === "MOTORISTA" ? (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${cnhBadgeClass(
                                getCnhStatus(u.cnh_validade)
                              )}`}
                            >
                              {cnhStatusLabel(getCnhStatus(u.cnh_validade))}
                            </span>
                          ) : null}
                          <span className="text-slate-400">
                            Veículo: <span className="text-slate-300">{u.veiculo_nome || "Sem vínculo"}</span>
                          </span>
                        </div>
                    </div>
                    </div>
                    <div className="fc-empresa-action-row flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setUserForm({
                            id: u.id,
                            nome: u.nome,
                            email: u.email || "",
                            cpf_id: u.cpf_id,
                            senha: "",
                            role: u.role,
                            veiculo_id: u.veiculo_id || "",
                            cnh_numero: u.cnh_numero || "",
                            cnh_categoria: u.cnh_categoria || "",
                            cnh_validade: ymdFromUser(u.cnh_validade),
                          })
                        }
                        className="fc-btn rounded-lg border border-blue-400/35 bg-blue-500/15 px-3 py-1.5 text-xs text-blue-100"
                      >
                        Editar
                      </button>
                      {u.conta_status !== "inativo" ? (
                        <button
                          type="button"
                          disabled={authUser?.id != null && Number(authUser.id) === Number(u.id)}
                          title={authUser?.id != null && Number(authUser.id) === Number(u.id) ? "Não pode desativar a sua própria conta" : undefined}
                          onClick={() => onPatchUserContaStatus(u.id, "inativo")}
                          className="fc-btn rounded-lg border border-amber-500/40 bg-amber-900/25 px-3 py-1.5 text-xs text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Desativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onPatchUserContaStatus(u.id, "ativo")}
                          className="fc-btn rounded-lg border border-emerald-500/40 bg-emerald-800/25 px-3 py-1.5 text-xs text-emerald-100"
                        >
                          Reativar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <PaginationControls
              page={usersPage}
              totalPages={usersTotalPages}
              onPrev={() => setUsersPage((p) => Math.max(1, p - 1))}
              onNext={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))}
            />
          </article>
        </section>
      <ConfirmActionModal
        open={Boolean(pendingContaStatusAction)}
        title="Desativar conta de usuário"
        description="Este usuário ficará sem acesso ao sistema até que a conta seja reativada."
        consequence="A operação interrompe novos logins imediatamente."
        confirmLabel="Desativar conta"
        confirmLoadingLabel="Desativando..."
        tone="warning"
        loading={loading}
        onClose={closeContaStatusModal}
        onConfirm={() => void confirmContaStatusModal()}
      />
    </div>
  );
}
