import { useEffect } from "react";

const dash = (v) => {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s ? s : "—";
};

const formatRoleType = (role) => {
  if (role === "SUPER_ADMIN") return "Administrador geral";
  if (role === "ADMIN_EMPRESA") return "Administrador da empresa";
  if (role === "APONTADOR") return "Apontador";
  if (role === "MOTORISTA") return "Motorista";
  return dash(role);
};

const formatOperacional = (s) => {
  if (s === "afastado") return "Afastado";
  if (s === "suspenso") return "Suspenso";
  return "Ativo";
};

const formatConta = (conta_status) => (conta_status === "inativo" ? "Inativo (sem acesso)" : "Ativo");

/**
 * Modal de consulta de usuário (somente leitura).
 */
export default function UserDetailsModal({ open, onClose, user, loading }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const veiculo =
    user?.veiculo_nome && user?.placa
      ? `${user.veiculo_nome} (${user.placa})`
      : user?.veiculo_nome || user?.placa || null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fc-user-details-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/75 backdrop-blur-[2px]"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="relative z-[1] flex max-h-[min(90dvh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700/90 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl shadow-black/50">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/90">Usuário</p>
            <h2 id="fc-user-details-title" className="truncate text-lg font-semibold text-white">
              Detalhes
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="fc-btn shrink-0 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            Fechar
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {loading && (
            <p className="text-sm text-slate-400" role="status">
              A carregar…
            </p>
          )}
          {!loading && user && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Nome</dt>
                <dd className="mt-0.5 break-words font-medium text-slate-100">{dash(user.nome)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">E-mail</dt>
                <dd className="mt-0.5 break-words text-slate-200">{dash(user.email)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">CPF / ID</dt>
                <dd className="mt-0.5 break-words font-mono text-[13px] text-slate-200">{dash(user.cpf_id)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Tipo</dt>
                <dd className="mt-0.5 text-slate-200">{formatRoleType(user.role)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Empresa</dt>
                <dd className="mt-0.5 break-words text-slate-200">{dash(user.empresa_nome)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Veículo</dt>
                <dd className="mt-0.5 break-words text-slate-200">{dash(veiculo)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Estado</dt>
                <dd className="mt-0.5 space-y-1 text-slate-200">
                  <p>
                    <span className="text-slate-500">Conta: </span>
                    {formatConta(user.conta_status)}
                  </p>
                  <p>
                    <span className="text-slate-500">Operacional: </span>
                    {formatOperacional(user.status_operacional)}
                  </p>
                </dd>
              </div>
            </dl>
          )}
          {!loading && !user && (
            <p className="text-sm text-slate-400">Sem dados para mostrar.</p>
          )}
        </div>
      </div>
    </div>
  );
}
