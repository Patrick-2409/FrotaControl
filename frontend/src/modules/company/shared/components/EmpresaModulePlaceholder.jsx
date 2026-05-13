import { Link } from "react-router-dom";

/**
 * Conteúdo provisório para módulos da área /empresa em migração gradual.
 */
export default function EmpresaModulePlaceholder({ title, description }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{description}</p>
      </div>
      <div className="rounded-2xl border border-blue-500/25 bg-slate-900/60 p-6">
        <p className="text-sm leading-relaxed text-slate-400">
          O painel principal da empresa está em{" "}
          <Link to="/empresa/dashboard" className="font-semibold text-blue-300 underline-offset-2 hover:underline">
            Dashboard
          </Link>
          ; os widgets serão consolidados aqui por etapas, sem remover funcionalidade.
        </p>
      </div>
    </div>
  );
}
