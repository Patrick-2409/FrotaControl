import { useCallback, useEffect, useState } from "react";
import api, { extractApiErrorMessage } from "../services/api";
import PaginationControls from "../components/PaginationControls";
import SkeletonRows from "../components/SkeletonRows";
import { emitToast } from "../services/uiEvents";
import EmptyState from "../components/EmptyState";

const formatAcao = (acao) => {
  if (acao === "criou") return "Criação";
  if (acao === "editou") return "Edição";
  if (acao === "excluiu") return "Exclusão";
  if (acao === "desativou") return "Desativação de conta";
  if (acao === "reativou") return "Reativação de conta";
  if (acao === "redefiniu_senha") return "Redefinição de senha";
  return acao;
};

const formatTabela = (tabela) => {
  if (tabela === "empresas") return "Empresa";
  if (tabela === "usuarios") return "Utilizador";
  if (tabela === "veiculos") return "Veículo";
  return tabela;
};

const acaoBadgeClass = (acao) => {
  if (acao === "criou") return "border-emerald-500/40 bg-emerald-500/15 text-emerald-200";
  if (acao === "excluiu") return "border-red-500/40 bg-red-500/15 text-red-200";
  if (acao === "desativou") return "border-slate-500/45 bg-slate-700/35 text-slate-200";
  if (acao === "reativou") return "border-emerald-500/50 bg-emerald-600/20 text-emerald-100";
  if (acao === "redefiniu_senha") return "border-amber-500/40 bg-amber-500/15 text-amber-200";
  return "border-blue-500/40 bg-blue-500/15 text-blue-200";
};

export default function AdminHistoricoPage() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/super-admin/audit-logs", {
        params: { page, limit: 20 },
      });
      setItems(data.items || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      emitToast(extractApiErrorMessage(err) || "Não foi possível carregar o histórico.", "error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="fc-superadmin-historico min-w-0 space-y-4">
      <header className="min-w-0">
        <h2 className="break-words text-xl font-semibold text-white">Histórico administrativo</h2>
        <p className="mt-1 text-sm text-slate-400">
          Registo de criações, edições e exclusões no painel (empresas, utilizadores e veículos). Cada linha indica quem fez a ação, quando e sobre que registo.
        </p>
      </header>

      <article className="fc-card min-w-0 overflow-hidden p-5">
        <div className="fc-superadmin-table-scroll -mx-1 px-1 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="pb-3 pr-3">Data e hora</th>
                <th className="pb-3 pr-3">Utilizador</th>
                <th className="pb-3 pr-3">Ação</th>
                <th className="pb-3 pr-3">Entidade</th>
                <th className="pb-3 text-right">ID registo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading && (
                <tr>
                  <td colSpan={5}>
                    <SkeletonRows rows={6} />
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((row) => (
                  <tr key={row.id} className="text-slate-300">
                    <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums text-slate-200">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="min-w-0 max-w-[12rem] break-words py-2.5 pr-3 sm:max-w-[16rem] lg:max-w-none">
                      <span className="font-medium text-slate-100">{row.usuario_nome || "—"}</span>
                      {row.usuario_email && (
                        <span className="mt-0.5 block break-words text-xs text-slate-500">{row.usuario_email}</span>
                      )}
                      {!row.usuario_id && <span className="text-xs text-slate-500"> (conta removida ou sistema)</span>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${acaoBadgeClass(row.acao)}`}
                      >
                        {formatAcao(row.acao)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-300">{formatTabela(row.tabela)}</td>
                    <td className="py-2.5 text-right font-mono text-xs text-slate-400">{row.registro_id}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!loading && items.length === 0 && (
          <EmptyState compact title="Sem registos" description="Ainda não há ações registadas neste âmbito." />
        )}

        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      </article>

      <p className="text-xs text-slate-500">
        Os dados vêm da tabela de auditoria do servidor; apenas ações sobre empresas, utilizadores e veículos aparecem aqui.
      </p>
    </div>
  );
}
