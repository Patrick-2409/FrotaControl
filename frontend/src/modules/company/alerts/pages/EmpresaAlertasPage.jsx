import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../../services/api";
import { emitToast } from "../../../../services/uiEvents";
import { ScreenLoading } from "../../../../components/LoadingState";
import EmptyState from "../../../../components/EmptyState";

const sevBadge = (s) => {
  if (s === "critical") return "border-rose-500/50 bg-rose-950/40 text-rose-100";
  if (s === "warning") return "border-amber-500/50 bg-amber-950/35 text-amber-100";
  return "border-sky-600/40 bg-sky-950/30 text-sky-100";
};

const catLabel = (c) => {
  const m = { transporte: "Transporte", combustivel: "Combustível", frota: "Frota", pessoas: "Pessoas" };
  return m[c] || c;
};

const sevLabel = (s) => {
  if (s === "critical") return "Crítico";
  if (s === "warning") return "Atenção";
  if (s === "info") return "Informação";
  return s;
};

export default function EmpresaAlertasPage() {
  const [feed, setFeed] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [histLoading, setHistLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setHistLoading(true);
    const feedPromise = api
      .get("/dashboard/notifications/feed", { params: { refresh: 1 }, timeout: 15_000 })
      .then((r) => r.data)
      .catch(() => ({ items: [], unread_count: 0 }));
    const histPromise = api
      .get("/dashboard/notifications/history", { params: { limit: 40 }, timeout: 12_000 })
      .then((r) => r.data?.items || [])
      .catch(() => []);
    const [feedData, histItems] = await Promise.all([feedPromise, histPromise]);
    setFeed(feedData);
    setHistory(histItems);
    setLoading(false);
    setHistLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const markRead = async (keys) => {
    if (!keys?.length) return;
    await api.post("/dashboard/notifications/read", { keys });
    await loadAll();
  };

  if (loading && !feed) return <ScreenLoading message="Carregando alertas…" />;

  const items = feed?.items || [];
  const unread = items.filter((i) => !i.read).length;
  const channels = feed?.future_channels || {};

  return (
    <div className="space-y-8">
      <header className="fc-card border-zinc-800/90 p-5">
        <p className="fc-erp-eyebrow text-zinc-400">Monitorização</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">Central de alertas</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Alertas gerados automaticamente a partir da operação. A lista é atualizada de tempos a tempos para manter o
          sistema rápido e estável.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadAll()}
            className="fc-btn rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200"
          >
            Atualizar agora
          </button>
          {unread > 0 ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await markRead(items.filter((i) => !i.read).map((i) => i.alert_key));
                  emitToast("Todos os alertas visíveis foram marcados como lidos.");
                } catch (e) {
                  emitToast(e?.response?.data?.message || "Falha.", "error");
                }
              }}
              className="fc-btn fc-btn-empresa-accent rounded-lg px-3 py-2 text-xs font-semibold"
            >
              Marcar visíveis como lidos
            </button>
          ) : null}
        </div>
      </header>

      <section className="fc-card border-zinc-800/90 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Alertas ativos</h2>
          <span className="text-xs text-zinc-500">
            {feed?.cached ? "Resumo guardado no servidor" : "Leitura em tempo real"} ·{" "}
            {feed?.generated_at ? new Date(feed.generated_at).toLocaleString("pt-BR") : "—"}
          </span>
        </div>
        {!items.length ? (
          <div className="mt-4">
            <EmptyState title="Sem alertas" description="Nenhuma regra disparou para o estado atual da operação." compact />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((it) => (
              <li
                key={it.alert_key}
                className={`rounded-xl border border-zinc-800/90 bg-zinc-950/40 p-4 ${it.read ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${sevBadge(it.severity)}`}>
                      {sevLabel(it.severity)}
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{catLabel(it.category)}</span>
                  </div>
                  {!it.read ? (
                    <button
                      type="button"
                      onClick={() => markRead([it.alert_key])}
                      className="text-xs font-semibold text-sky-400 hover:text-sky-300"
                    >
                      Marcar lido
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-600">Lido</span>
                  )}
                </div>
                <h3 className="mt-2 text-base font-semibold text-zinc-100">{it.title}</h3>
                <p className="mt-1 text-sm text-zinc-400">{it.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fc-card border-zinc-800/90 p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Histórico guardado</h2>
        <p className="mt-1 text-xs text-zinc-500">Últimos eventos da empresa, inclusive alertas que já deixaram de estar ativos.</p>
        {histLoading ? (
          <div className="mt-6 flex justify-center py-8">
            <span className="fc-spinner" aria-hidden="true" />
          </div>
        ) : !history.length ? (
          <p className="mt-4 text-sm text-zinc-500">Ainda não há histórico guardado.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-800/80 rounded-xl border border-zinc-800/80">
            {history.map((row) => (
              <li key={row.id ?? `${row.alert_key}-${row.last_seen_at}`} className="flex flex-wrap items-start justify-between gap-2 px-3 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-200">{row.title}</p>
                  <p className="text-xs text-zinc-500">{row.body}</p>
                </div>
                <div className="text-right text-[11px] text-zinc-600">
                  <span className={`mr-2 inline-block rounded border px-1.5 py-0.5 ${sevBadge(row.severity)}`}>
                    {sevLabel(row.severity)}
                  </span>
                  <span>{row.is_active ? "ativo" : "inativo"}</span>
                  <br />
                  <time dateTime={row.last_seen_at}>{new Date(row.last_seen_at).toLocaleString("pt-BR")}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fc-card border border-dashed border-zinc-700/80 bg-zinc-950/30 p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Canais futuros</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Notificações por aplicativo, e-mail, WhatsApp ou SMS poderão ser ligadas no futuro; por agora mostramos só o
          estado de preparação de cada canal.
        </p>
        <ul className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
          {Object.entries(channels).map(([k, v]) => (
            <li key={k} className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
              <span className="font-semibold capitalize text-zinc-300">{k}</span>
              <span className="ml-2 text-zinc-500">{v?.status}</span>
              {v?.doc ? <span className="mt-1 block font-mono text-[10px] text-zinc-600">{v.doc}</span> : null}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-zinc-600">
          Voltar ao <Link className="text-sky-400 hover:underline" to="/empresa/dashboard">dashboard</Link>.
        </p>
      </section>
    </div>
  );
}
