import { useCallback, useEffect, useMemo, useState } from "react";
import api, { resolveBackendAssetUrl } from "../services/api";
import { inputClass } from "../components/FormField";
import PaginationControls from "../components/PaginationControls";
import SkeletonRows from "../components/SkeletonRows";
import EmptyState from "../components/EmptyState";
import { emitToast } from "../services/uiEvents";
import { CenteredSpinner } from "../components/LoadingState";
import useDebouncedValue from "../hooks/useDebouncedValue";
import Avatar from "../components/Avatar";

const roleLabel = (role) => (role === "ADMIN_EMPRESA" ? "Administrador" : "Motorista");
const roleBadgeClass = (role) =>
  role === "ADMIN_EMPRESA"
    ? "border-violet-400/40 bg-violet-500/15 text-violet-100"
    : "border-blue-400/40 bg-blue-500/15 text-blue-100";
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

export default function CompanyManagementPage() {
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [users, setUsers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState({ users: "", vehicles: "" });
  const [usersPage, setUsersPage] = useState(1);
  const [vehiclesPage, setVehiclesPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [vehiclesTotalPages, setVehiclesTotalPages] = useState(1);
  const [activeSection, setActiveSection] = useState("users");
  const debouncedUsers = useDebouncedValue(search.users);
  const debouncedVehicles = useDebouncedValue(search.vehicles);

  const [userForm, setUserForm] = useState({
    id: null,
    nome: "",
    email: "",
    cpf_id: "",
    senha: "",
    role: "MOTORISTA",
    veiculo_id: "",
  });
  const [vehicleForm, setVehicleForm] = useState({ id: null, nome: "", placa: "", marca: "", modelo: "" });

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

  const loadVehicles = useCallback(async () => {
    setLoadingVehicles(true);
    try {
      const { data } = await api.get("/dashboard/manage/vehicles", {
        params: { page: vehiclesPage, limit: 6, search: debouncedVehicles },
      });
      setVehicles(dedupeById(data.items || []));
      setVehiclesTotalPages(data.totalPages || 1);
    } finally {
      setLoadingVehicles(false);
    }
  }, [vehiclesPage, debouncedVehicles]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const onSaveVehicle = async (e) => {
    e.preventDefault();
    if (!vehicleForm.nome.trim() || !vehicleForm.placa.trim()) {
      emitToast("Informe nome e placa do veículo.", "warning");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        nome: vehicleForm.nome.trim(),
        placa: vehicleForm.placa.trim(),
        marca: vehicleForm.marca.trim(),
        modelo: vehicleForm.modelo.trim(),
      };
      if (vehicleForm.id) {
        await api.put(`/dashboard/manage/vehicles/${vehicleForm.id}`, payload);
      } else {
        await api.post("/dashboard/manage/vehicles", payload);
      }
      emitToast(vehicleForm.id ? "Veículo atualizado com sucesso." : "Veículo criado com sucesso.");
      setVehicleForm({ id: null, nome: "", placa: "", marca: "", modelo: "" });
      await loadVehicles();
    } catch (err) {
      emitToast(err.response?.data?.message || "Erro ao salvar veículo.", "error");
    } finally {
      setLoading(false);
    }
  };

  const onSaveUser = async (e) => {
    e.preventDefault();
    if (!userForm.nome.trim() || !userForm.email.trim() || !userForm.cpf_id.trim()) {
      emitToast("Preencha nome, e-mail e CPF/ID.", "warning");
      return;
    }
    if (!hasFullName(userForm.nome)) {
      emitToast("Informe o nome completo do usuário (nome e sobrenome).", "warning");
      return;
    }
    const veiculoId = userForm.veiculo_id ? Number(userForm.veiculo_id) : null;
    if (userForm.role === "MOTORISTA" && !veiculoId) {
      emitToast("Motorista precisa ter veículo vinculado.", "warning");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        nome: userForm.nome.trim(),
        email: userForm.email.trim(),
        cpf_id: userForm.cpf_id.trim(),
        senha: userForm.senha,
        role: userForm.role,
        veiculo_id: veiculoId,
      };
      if (userForm.id) {
        await api.put(`/dashboard/manage/users/${userForm.id}`, payload);
      } else {
        await api.post("/dashboard/manage/users", payload);
      }
      emitToast(userForm.id ? "Usuário atualizado com sucesso." : "Usuário criado com sucesso.");
      setUserForm({ id: null, nome: "", email: "", cpf_id: "", senha: "", role: "MOTORISTA", veiculo_id: "" });
      await loadUsers();
    } catch (err) {
      emitToast(err.response?.data?.message || "Erro ao salvar usuário.", "error");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (kind, id) => {
    if (!window.confirm("Confirma exclusão?")) return;
    setLoading(true);
    try {
      await api.delete(`/dashboard/manage/${kind}/${id}`);
      emitToast("Registro excluído com sucesso.");
      if (kind === "users") await loadUsers();
      if (kind === "vehicles") await loadVehicles();
    } catch (err) {
      emitToast(err.response?.data?.message || "Erro ao excluir.", "error");
    } finally {
      setLoading(false);
    }
  };

  const vehicleOptions = useMemo(() => vehicles || [], [vehicles]);

  return (
    <div className="space-y-6">
      {loading && <CenteredSpinner label="Salvando alterações..." />}
      <section className="fc-card border-blue-500/20 p-5">
        <h2 className="mb-1 text-lg font-semibold text-white">Gestão operacional</h2>
        <p className="mb-4 text-sm text-slate-400">
          Separamos criação e consulta para manter o painel organizado e sem poluição visual.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <button
            type="button"
            onClick={() => setActiveSection("users")}
            className={`fc-btn rounded-lg border px-3 py-2 text-sm ${
              activeSection === "users"
                ? "border-blue-500 bg-blue-500/20 text-blue-100"
                : "border-slate-700 text-slate-300"
            }`}
          >
            Usuários
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("vehicles")}
            className={`fc-btn rounded-lg border px-3 py-2 text-sm ${
              activeSection === "vehicles"
                ? "border-blue-500 bg-blue-500/20 text-blue-100"
                : "border-slate-700 text-slate-300"
            }`}
          >
            Veículos
          </button>
        </div>
      </section>

      {activeSection === "users" && (
        <section className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
          <article className="fc-card border-blue-500/20 p-5">
            <h3 className="mb-1 text-base font-semibold text-white">
              {userForm.id ? "Editar usuário" : "Criar usuário"}
            </h3>
            <p className="mb-4 text-sm text-slate-400">Preencha os dados e confirme para salvar.</p>
            <form onSubmit={onSaveUser}>
              <div className="grid gap-2 md:grid-cols-2">
                <input className={inputClass} placeholder="Nome" value={userForm.nome} onChange={(e) => setUserForm((f) => ({ ...f, nome: e.target.value }))} />
                <input className={inputClass} placeholder="E-mail" value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))} />
                <input className={inputClass} placeholder="CPF/ID" value={userForm.cpf_id} onChange={(e) => setUserForm((f) => ({ ...f, cpf_id: e.target.value }))} />
                <input className={inputClass} type="password" placeholder={userForm.id ? "Nova senha (opcional)" : "Senha"} value={userForm.senha} onChange={(e) => setUserForm((f) => ({ ...f, senha: e.target.value }))} />
                <select className={inputClass} value={userForm.role} onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}>
                  <option value="MOTORISTA">Motorista</option>
                  <option value="ADMIN_EMPRESA">Admin da empresa</option>
                </select>
                <select className={inputClass} value={userForm.veiculo_id} onChange={(e) => setUserForm((f) => ({ ...f, veiculo_id: e.target.value }))}>
                  <option value="">Vínculo de veículo</option>
                  {vehicleOptions.map((v) => (
                    <option key={`v-opt-${v.id}`} value={v.id}>
                      {v.nome} - {v.placa}
                    </option>
                  ))}
                </select>
              </div>
              <button className="fc-btn mt-3 rounded-lg bg-blue-600 px-4 py-3">{userForm.id ? "Atualizar usuário" : "Criar usuário"}</button>
            </form>
          </article>

          <article className="fc-card border-blue-500/20 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-white">Usuários cadastrados</h3>
              <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-300">
                Página {usersPage} de {usersTotalPages}
              </span>
            </div>
            <input
              className={inputClass}
              placeholder="Buscar usuário"
              value={search.users}
              onChange={(e) => {
                setUsersPage(1);
                setSearch((s) => ({ ...s, users: e.target.value }));
              }}
            />
            <div className="mt-4 space-y-3">
              {loadingUsers && <SkeletonRows rows={4} />}
              {!loadingUsers && users.length === 0 && <EmptyState compact title="Sem usuários cadastrados" description="Crie motoristas e admins da empresa para iniciar a operação." />}
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
                          <span className="text-slate-400">
                            Veículo: <span className="text-slate-300">{u.veiculo_nome || "Sem vínculo"}</span>
                          </span>
                        </div>
                    </div>
                    </div>
                    <div className="flex items-center gap-2">
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
                          })
                        }
                        className="fc-btn rounded-lg border border-blue-400/35 bg-blue-500/15 px-3 py-1.5 text-xs text-blue-100"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete("users", u.id)}
                        className="fc-btn rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-1.5 text-xs text-red-200"
                      >
                        Excluir
                      </button>
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
      )}

      {activeSection === "vehicles" && (
        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.45fr]">
          <article className="fc-card border-blue-500/20 p-5">
            <h3 className="mb-1 text-base font-semibold text-white">
              {vehicleForm.id ? "Editar veículo" : "Criar veículo"}
            </h3>
            <p className="mb-4 text-sm text-slate-400">Cadastre modelo e placa para organizar a frota.</p>
            <form onSubmit={onSaveVehicle} className="grid gap-2">
              <input className={inputClass} placeholder="Nome do veículo" value={vehicleForm.nome} onChange={(e) => setVehicleForm((f) => ({ ...f, nome: e.target.value }))} />
              <input className={inputClass} placeholder="Placa" value={vehicleForm.placa} onChange={(e) => setVehicleForm((f) => ({ ...f, placa: e.target.value }))} />
              <input className={inputClass} placeholder="Marca (opcional)" value={vehicleForm.marca} onChange={(e) => setVehicleForm((f) => ({ ...f, marca: e.target.value }))} />
              <input className={inputClass} placeholder="Modelo (opcional)" value={vehicleForm.modelo} onChange={(e) => setVehicleForm((f) => ({ ...f, modelo: e.target.value }))} />
              <button className="fc-btn rounded-lg bg-blue-600 px-4 py-3">{vehicleForm.id ? "Atualizar" : "Criar"}</button>
            </form>
          </article>

          <article className="fc-card border-blue-500/20 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-white">Veículos cadastrados</h3>
              <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-300">
                Página {vehiclesPage} de {vehiclesTotalPages}
              </span>
            </div>
            <input
              className={inputClass}
              placeholder="Buscar veículo"
              value={search.vehicles}
              onChange={(e) => {
                setVehiclesPage(1);
                setSearch((s) => ({ ...s, vehicles: e.target.value }));
              }}
            />
            <div className="mt-4 space-y-3">
              {loadingVehicles && <SkeletonRows rows={4} />}
              {!loadingVehicles && vehicles.length === 0 && <EmptyState compact title="Sem veículos cadastrados" description="Cadastre o primeiro veículo para vincular aos motoristas." />}
              {vehicles.map((v) => (
                <article key={`veh-${v.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/90 bg-slate-950/65 p-4 shadow-md shadow-slate-950/30">
                  <div className="text-left">
                    <p className="font-medium text-slate-100">{v.nome}</p>
                    <p className="text-xs text-slate-400">{v.placa}</p>
                    <p className="text-xs text-slate-500">
                      {v.marca || "-"} {v.modelo || ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setVehicleForm({
                          id: v.id,
                          nome: v.nome,
                          placa: v.placa,
                          marca: v.marca || "",
                          modelo: v.modelo || "",
                        })
                      }
                      className="fc-btn rounded-lg border border-blue-400/35 bg-blue-500/15 px-3 py-1.5 text-xs text-blue-100"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete("vehicles", v.id)}
                      className="fc-btn rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-1.5 text-xs text-red-200"
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <PaginationControls
              page={vehiclesPage}
              totalPages={vehiclesTotalPages}
              onPrev={() => setVehiclesPage((p) => Math.max(1, p - 1))}
              onNext={() => setVehiclesPage((p) => Math.min(vehiclesTotalPages, p + 1))}
            />
          </article>
        </section>
      )}
    </div>
  );
}
