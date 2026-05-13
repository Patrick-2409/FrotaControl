import { useEffect, useRef, useState } from "react";
import Avatar from "../components/Avatar";
import FormField, { inputClass } from "../components/FormField";
import { useAuth } from "../services/auth";
import api from "../services/api";
import { emitToast } from "../services/uiEvents";
import { getSyncDiagnostics } from "../offline/offlineRepo";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ nome: "" });
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const isSupportProfile = user?.role === "ADMIN_EMPRESA" || user?.role === "SUPER_ADMIN";

  useEffect(() => {
    setProfileForm({ nome: user?.nome || "" });
  }, [user?.nome]);

  const loadDiagnostics = async () => {
    setDiagnosticsLoading(true);
    try {
      const data = await getSyncDiagnostics();
      setDiagnostics(data);
    } catch {
      emitToast("Falha ao carregar diagnóstico técnico de sync.", "error");
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  useEffect(() => {
    if (!isSupportProfile || !showDiagnostics) return;
    loadDiagnostics();
  }, [isSupportProfile, showDiagnostics]);

  const onUploadPhoto = async (file) => {
    if (!file) return;
    const validTypes = ["image/png", "image/jpg", "image/jpeg"];
    if (!validTypes.includes(file.type)) {
      emitToast("Formato inválido. Use PNG, JPG ou JPEG.", "warning");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      emitToast("Imagem muito grande. Limite máximo de 2MB.", "warning");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("profile_image", file);
      await api.post("/users/upload-profile-image", formData);
      await refreshUser();
      emitToast("Foto de perfil atualizada com sucesso.");
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao enviar foto de perfil.", "error");
    } finally {
      setUploading(false);
    }
  };

  const onChangePassword = async (e) => {
    e.preventDefault();
    if (!passwordForm.current_password || !passwordForm.new_password) {
      emitToast("Preencha senha atual e nova senha.", "warning");
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      emitToast("Confirmação de senha não confere.", "warning");
      return;
    }
    setSavingPassword(true);
    try {
      await api.post("/users/change-password", {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      emitToast("Senha alterada com sucesso.");
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao alterar senha.", "error");
    } finally {
      setSavingPassword(false);
    }
  };

  const onUpdateProfile = async (e) => {
    e.preventDefault();
    const nome = String(profileForm.nome || "").trim();
    if (nome.length < 3) {
      emitToast("Informe seu nome completo.", "warning");
      return;
    }
    setSavingProfile(true);
    try {
      await api.put("/users/me", { nome });
      await refreshUser();
      emitToast("Perfil atualizado com sucesso.");
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao atualizar perfil.", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="fc-card border-blue-500/20 p-5">
        <h2 className="mb-3 text-lg font-semibold text-white">Meu Perfil</h2>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar imageUrl={user?.profile_image_url} name={user?.nome} size="profile" />
          <div className="text-sm">
            <p className="font-semibold text-slate-100">{user?.nome}</p>
            <p className="text-slate-300">{user?.email || user?.cpf_id}</p>
            <p className="text-xs text-slate-400">{user?.empresa_nome || "Sem empresa vinculada"}</p>
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <input
            ref={fileInputRef}
            id="profile-image-upload"
            type="file"
            accept=".png,.jpg,.jpeg,image/png,image/jpeg,image/jpg"
            className="hidden"
            onChange={(e) => onUploadPhoto(e.target.files?.[0])}
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="fc-btn rounded-lg border border-blue-400/35 bg-blue-500/15 px-4 py-2 text-sm text-blue-100"
          >
            {uploading ? "Enviando foto..." : "Alterar foto"}
          </button>
          <p className="mt-1 text-xs text-slate-400">Formatos: PNG/JPG/JPEG. Tamanho máximo: 2MB.</p>
        </div>
      </section>

      <section className="fc-card border-blue-500/20 p-5">
        <h3 className="mb-3 text-base font-semibold text-white">Alterar senha</h3>
        <form onSubmit={onUpdateProfile} className="mb-5 rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
          <h4 className="mb-2 text-sm font-semibold text-slate-100">Dados do perfil</h4>
          <FormField label="Nome completo">
            <input
              className={inputClass}
              value={profileForm.nome}
              onChange={(e) => setProfileForm((p) => ({ ...p, nome: e.target.value }))}
            />
          </FormField>
          <button
            type="submit"
            disabled={savingProfile}
            className="fc-btn rounded-lg border border-blue-400/35 bg-blue-500/15 px-4 py-2 text-sm text-blue-100"
          >
            {savingProfile ? "Salvando perfil..." : "Salvar nome do perfil"}
          </button>
        </form>
        <form onSubmit={onChangePassword}>
          <FormField label="Senha atual">
            <input
              type="password"
              className={inputClass}
              value={passwordForm.current_password}
              onChange={(e) => setPasswordForm((p) => ({ ...p, current_password: e.target.value }))}
            />
          </FormField>
          <FormField label="Nova senha">
            <input
              type="password"
              className={inputClass}
              value={passwordForm.new_password}
              onChange={(e) => setPasswordForm((p) => ({ ...p, new_password: e.target.value }))}
            />
          </FormField>
          <FormField label="Confirmar nova senha">
            <input
              type="password"
              className={inputClass}
              value={passwordForm.confirm_password}
              onChange={(e) => setPasswordForm((p) => ({ ...p, confirm_password: e.target.value }))}
            />
          </FormField>
          <button
            type="submit"
            disabled={savingPassword}
            className="fc-btn rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {savingPassword ? "Salvando..." : "Alterar senha"}
          </button>
        </form>
      </section>

      {isSupportProfile && (
        <section className="fc-card border-indigo-500/25 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white">Painel técnico de sync</h3>
            <button
              type="button"
              onClick={() => setShowDiagnostics((prev) => !prev)}
              className="fc-btn rounded-lg border border-indigo-400/35 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-100"
            >
              {showDiagnostics ? "Ocultar painel" : "Mostrar painel"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Uso de suporte em produção (dados locais deste dispositivo/navegador).
          </p>

          {showDiagnostics && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={loadDiagnostics}
                  disabled={diagnosticsLoading}
                  className="fc-btn rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
                >
                  {diagnosticsLoading ? "Atualizando..." : "Atualizar diagnóstico"}
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-4">
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm">
                  <p className="text-xs text-slate-400">Pendentes</p>
                  <p className="mt-1 font-semibold text-amber-200">{diagnostics?.pendingCount ?? "-"}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm">
                  <p className="text-xs text-slate-400">Tempo médio envio</p>
                  <p className="mt-1 font-semibold text-blue-200">
                    {diagnostics?.avgSendMs != null ? `${diagnostics.avgSendMs} ms` : "-"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm">
                  <p className="text-xs text-slate-400">Falhas recentes</p>
                  <p className="mt-1 font-semibold text-red-200">{diagnostics?.failureCount ?? "-"}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm">
                  <p className="text-xs text-slate-400">Amostras</p>
                  <p className="mt-1 font-semibold text-slate-100">{diagnostics?.samples ?? "-"}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Últimos erros de sync</p>
                {diagnostics?.lastErrors?.length ? (
                  <div className="space-y-2 text-xs">
                    {diagnostics.lastErrors.map((item) => (
                      <div key={`sync-err-${item.id}`} className="rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1.5 text-red-100">
                        <p className="font-semibold">{item.context}</p>
                        <p className="text-red-200/90">{item.message}</p>
                        <p className="text-[11px] text-red-300/80">
                          {new Date(item.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Sem erros recentes registrados.</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
