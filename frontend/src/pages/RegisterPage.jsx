import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import FormField, { inputClass } from "../components/FormField";
import { emitToast } from "../services/uiEvents";

export default function RegisterPage() {
  const [form, setForm] = useState({
    nome: "",
    cpf_id: "",
    email: "",
    senha: "",
    empresa_id: "",
    veiculo_id: "",
  });
  const [companies, setCompanies] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/companies", { params: { page: 1, limit: 100 } }).then(({ data }) => setCompanies(data.items || []));
  }, []);

  useEffect(() => {
    if (!form.empresa_id) return;
    api
      .get(`/companies/${form.empresa_id}/vehicles`)
      .then(({ data }) => setVehicles(data))
      .catch(() => setVehicles([]));
  }, [form.empresa_id]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      await api.post("/auth/register-driver", form);
      setMessage("Cadastro concluído. Faça login.");
      emitToast("Cadastro realizado com sucesso.");
    } catch (err) {
      setMessage(err.response?.data?.message || "Erro ao cadastrar");
      emitToast(err.response?.data?.message || "Erro ao cadastrar", "error");
    }
    setLoading(false);
  };

  return (
    <div className="grid min-h-screen place-content-center bg-slate-950 p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h1 className="mb-5 text-xl font-bold text-white">Cadastro de Motorista</h1>
        <FormField label="Nome"><input className={inputClass} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></FormField>
        <FormField label="CPF ou ID"><input className={inputClass} value={form.cpf_id} onChange={(e) => setForm({ ...form, cpf_id: e.target.value })} /></FormField>
        <FormField label="Email"><input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
        <FormField label="Senha"><input type="password" className={inputClass} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} /></FormField>
        <FormField label="Empresa (obrigatório)">
          <select className={inputClass} value={form.empresa_id} onChange={(e) => setForm({ ...form, empresa_id: e.target.value, veiculo_id: "" })} required>
            <option value="">Selecione</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </FormField>
        <FormField label="Veículo (obrigatório)">
          <select className={inputClass} value={form.veiculo_id} onChange={(e) => setForm({ ...form, veiculo_id: e.target.value })} required>
            <option value="">Selecione</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nome} - {v.placa}</option>)}
          </select>
        </FormField>
        {message && <p className={`mb-3 text-sm ${message.includes("concluído") ? "text-emerald-300" : "text-red-300"}`}>{message}</p>}
        <button disabled={loading} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold disabled:opacity-60">{loading ? "Cadastrando..." : "Cadastrar"}</button>
        <Link to="/login" className="mt-3 block text-center text-sm text-blue-300">
          Voltar ao login
        </Link>
      </form>
    </div>
  );
}
