import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../../services/api";
import { emitToast } from "../../../../services/uiEvents";
import { ScreenLoading } from "../../../../components/LoadingState";
import EmptyState from "../../../../components/EmptyState";
import AccordionSection from "../../shared/components/AccordionSection";
import TooltipInfo from "../../shared/components/TooltipInfo";

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

const sevOrder = { critical: 0, warning: 1, info: 2 };

const sevPanel = (s) => {
  if (s === "critical") return "border-rose-500/50 bg-rose-950/25";
  if (s === "warning") return "border-amber-500/50 bg-amber-950/20";
  return "border-sky-500/40 bg-sky-950/15";
};

const sevCardVariant = (s) => {
  if (s === "critical") return "card-danger";
  if (s === "warning") return "card-warning";
  return "card-info";
};

const sevIcon = (s) => {
  if (s === "critical") return "🚨";
  if (s === "warning") return "⚠️";
  return "ℹ️";
};

const routeByCategory = {
  transporte: "/empresa/transporte",
  combustivel: "/empresa/combustivel",
  frota: "/empresa/frota",
  pessoas: "/empresa/pessoas",
};

const actionLabel = (item) => {
  if (item.severity === "critical") return "Resolver agora";
  if (item.category === "transporte") return "Ver transporte";
  if (item.category === "combustivel") return "Ver combustível";
  if (item.category === "frota") return "Ver frota";
  if (item.category === "pessoas") return "Ver equipe";
  return "Ver detalhes";
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
      .get("/dashboard/notifications/feed", {
        params: { refresh: 1 },
        timeout: 10_000,
        skipErrorLog: true,
        skipGlobalErrorToast: true,
      })
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

  const items = useMemo(() => feed?.items || [], [feed?.items]);
  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const severityRank = (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9);
        if (severityRank !== 0) return severityRank;
        return new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime();
      }),
    [items]
  );
  const unread = items.filter((i) => !i.read).length;
  const groupedHistory = useMemo(() => {
    const bucket = new Map();
    history.forEach((row) => {
      const dt = row?.last_seen_at ? new Date(row.last_seen_at) : null;
      const key = dt && !Number.isNaN(dt.getTime())
        ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`
        : "sem-data";
      const label = key === "sem-data"
        ? "Sem data"
        : dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      if (!bucket.has(key)) bucket.set(key, { key, label, items: [] });
      bucket.get(key).items.push(row);
    });
    return [...bucket.values()];
  }, [history]);

  if (loading && !feed) return <ScreenLoading message="Carregando alertas…" />;

  return (
    <div className="space-y-8">
      <header className="fc-card border-zinc-800/90 p-5">
        <p className="fc-erp-eyebrow text-zinc-400">Monitoramento</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">Central de alertas</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">Alertas da operação com prioridade e ação direta por módulo.</p>
        <div className="fc-empresa-action-row mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadAll()}
            className="fc-btn fc-btn-empresa-secondary rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200"
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
              className="fc-btn fc-btn-empresa-primary rounded-lg px-3 py-2 text-xs font-semibold"
            >
              Marcar visíveis como lidos
            </button>
          ) : null}
        </div>
      </header>

      <AccordionSection
        id="alertas-ativos"
        title="Alertas ativos"
        description="Críticos aparecem primeiro para priorizar ação."
        defaultOpenDesktop
        defaultOpenMobile
      >
        <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            <span>Alertas ativos</span>
            <TooltipInfo text="Indica o nível de criticidade do alerta com base nos dados operacionais." />
          </h2>
          <span className="text-xs text-zinc-500">
            {feed?.cached ? "Resumo salvo no servidor" : "Leitura em tempo real"} ·{" "}
            {feed?.generated_at ? new Date(feed.generated_at).toLocaleString("pt-BR") : "—"}
          </span>
        </div>
        {!items.length ? (
          <div className="mt-4">
            <EmptyState title="Sem alertas" description="Nenhuma regra foi disparada para o estado atual." compact />
          </div>
        ) : (
          <ul className="mt-4 space-y-3.5">
            {sortedItems.map((it) => (
              <li
                key={it.alert_key}
                className={`card rounded-xl p-4 ${
                  it.read ? "opacity-75" : ""
                } ${sevPanel(it.severity)} ${sevCardVariant(it.severity)}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/70 text-sm">
                      {sevIcon(it.severity)}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${sevBadge(it.severity)}`}>
                      {sevLabel(it.severity)}
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{catLabel(it.category)}</span>
                  </div>
                  {!it.read ? (
                    <button
                      type="button"
                      onClick={() => markRead([it.alert_key])}
                      className="fc-btn fc-btn-empresa-secondary rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-sky-300 hover:text-sky-200"
                    >
                      Marcar lido
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-600">Lido</span>
                  )}
                </div>
                <h3 className="mt-2 text-base font-semibold text-zinc-100">{it.title}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                  <span>Motivo do alerta</span>
                  <TooltipInfo text="Explica a lógica que disparou o alerta, como ausência de registros ou consumo alto." />
                </p>
                <p className="mt-1 text-sm text-zinc-400">{it.body}</p>
                <div className="fc-empresa-action-row mt-3 flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to={routeByCategory[it.category] || "/empresa/dashboard"}
                    className={`fc-btn rounded-lg px-3 py-2 text-xs font-semibold ${
                      it.severity === "critical"
                        ? "fc-btn-empresa-alert border border-rose-400/55 bg-rose-500/20 text-rose-100"
                        : "fc-btn-empresa-primary border border-sky-400/45 bg-sky-500/20 text-sky-100"
                    }`}
                  >
                    {actionLabel(it)}
                  </Link>
                  <span className="text-[11px] text-zinc-500">
                    {it.last_seen_at ? new Date(it.last_seen_at).toLocaleString("pt-BR") : "Atualizado agora"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        </section>
      </AccordionSection>

      <AccordionSection
        id="alertas-historico"
        title="Histórico salvo"
        description="Eventos recentes, inclusive alertas já resolvidos."
        defaultOpenDesktop={false}
        defaultOpenMobile={false}
      >
        <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Histórico salvo</h2>
        <p className="mt-1 text-xs text-zinc-500">Últimos eventos da empresa, inclusive alertas que já não estão ativos.</p>
        {histLoading ? (
          <div className="mt-6 flex justify-center py-8">
            <span className="fc-spinner" aria-hidden="true" />
          </div>
        ) : !history.length ? (
          <p className="mt-4 text-sm text-zinc-500">Ainda não há histórico salvo.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {groupedHistory.map((group, index) => (
              <details key={group.key} open={index === 0} className="rounded-xl border border-zinc-800/80 bg-zinc-950/35">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold capitalize text-zinc-300 marker:content-none [&::-webkit-details-marker]:hidden">
                  {group.label} <span className="text-xs font-normal text-zinc-500">({group.items.length})</span>
                </summary>
                <ul className="divide-y divide-zinc-800/80 border-t border-zinc-800/70">
                  {group.items.map((row) => (
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
              </details>
            ))}
          </div>
        )}
        </section>
      </AccordionSection>

    </div>
  );
}
