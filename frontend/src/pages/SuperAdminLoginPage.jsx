import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../services/auth";
import FormField, { inputClass, primaryButtonClass } from "../components/FormField";
import { CenteredSpinner } from "../components/LoadingState";
import SystemLogo from "../components/SystemLogo";

export default function SuperAdminLoginPage() {
  const { superAdminLogin, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", senha: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    setError("");
    const normalizedEmail = String(form.email || "").trim().toLowerCase();
    const normalizedSenha = String(form.senha || "");
    if (!normalizedEmail || !normalizedSenha) {
      setError("Preencha e-mail e senha.");
      return;
    }
    if (normalizedSenha.length < 6) {
      setError("A senha deve ter ao menos 6 caracteres.");
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const user = await superAdminLogin({ email: normalizedEmail, senha: normalizedSenha });
      if (user.role !== "SUPER_ADMIN") {
        logout();
        setError("Acesso restrito a super admin.");
        return;
      }
      navigate("/super-admin");
    } catch (err) {
      logout();
      const status = err?.response?.status;
      if (status === 401) {
        setError("Usuário inválido");
      } else if (!err?.response || status >= 500) {
        setError("Servidor indisponível");
      } else {
        setError(err.response?.data?.message || "Falha no login super admin");
      }
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="fc-page grid min-h-screen place-content-center bg-slate-950 p-6">
      {submitting && <CenteredSpinner label="Autenticando super admin..." />}
      <form onSubmit={onSubmit} className="fc-card w-full max-w-sm p-6">
        <div className="mb-4 flex justify-center">
          <SystemLogo variant="auth" />
        </div>
        <h1 className="mb-1 text-2xl font-bold text-white">Acesso Administrador do Sistema</h1>
        <p className="mb-5 text-sm text-slate-400">Controle central de empresas do FrotaControl</p>

        <FormField label="E-mail">
          <input
            className={inputClass}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            autoComplete="username"
            aria-invalid={Boolean(error)}
          />
        </FormField>
        <FormField label="Senha">
          <input
            type="password"
            className={inputClass}
            value={form.senha}
            onChange={(e) => setForm({ ...form, senha: e.target.value })}
            autoComplete="current-password"
            aria-invalid={Boolean(error)}
          />
        </FormField>

        {error && <p className="mb-3 text-sm text-red-400" role="alert">{error}</p>}
        <button className={primaryButtonClass} disabled={submitting}>Entrar como super admin</button>
        <Link to="/" className="mt-3 block text-center text-sm text-blue-300">Voltar para tela inicial</Link>
      </form>
    </div>
  );
}
