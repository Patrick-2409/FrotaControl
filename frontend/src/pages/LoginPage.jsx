import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../services/auth";
import FormField, { inputClass, primaryButtonClass } from "../components/FormField";
import { CenteredSpinner } from "../components/LoadingState";
import SystemLogo from "../components/SystemLogo";

export default function LoginPage() {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ login: "", senha: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    setError("");
    const normalizedLogin = String(form.login || "").trim();
    const normalizedSenha = String(form.senha || "");
    if (!normalizedLogin || !normalizedSenha) {
      setError("Preencha login e senha.");
      return;
    }
    if (normalizedSenha.length < 6) {
      setError("A senha deve ter ao menos 6 caracteres.");
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const user = await login({ login: normalizedLogin, senha: normalizedSenha });
      if (user.role !== "MOTORISTA") {
        logout();
        setError("Acesso restrito a motorista.");
        return;
      }
      navigate("/app/home");
    } catch (err) {
      logout();
      const status = err?.response?.status;
      if (status === 401) {
        setError("Usuário inválido");
      } else if (!err?.response || status >= 500) {
        setError("Servidor indisponível");
      } else {
        setError(err.response?.data?.message || "Falha no login");
      }
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="fc-page grid min-h-screen place-content-center bg-slate-950 p-6">
      {submitting && <CenteredSpinner label="Validando acesso..." />}
      <form onSubmit={onSubmit} className="fc-card w-full max-w-sm p-6">
        <div className="mb-4 flex justify-center">
          <SystemLogo variant="auth" />
        </div>
        <h1 className="mb-1 text-2xl font-bold text-white">Acesso Motorista</h1>
        <p className="mb-5 text-sm text-slate-400">Entre para iniciar a operação rapidamente</p>

        <FormField label="Login (CPF, e-mail ou ID)">
          <input
            className={inputClass}
            value={form.login}
            onChange={(e) => setForm({ ...form, login: e.target.value })}
            autoComplete="username"
            placeholder="Ex.: 123.456.789-00, motorista@empresa.com ou USR-000123"
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
        <button className={primaryButtonClass} disabled={submitting}>Entrar no app</button>
        <Link to="/" className="mt-3 block text-center text-sm text-blue-300">Voltar para tela inicial</Link>
      </form>
    </div>
  );
}
