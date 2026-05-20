import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { emitToast } from "../services/uiEvents";
import { InlineSpinner } from "./LoadingState";

const REFRESH_MS = 90_000;

function useOperationalNotifications() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFeed = useCallback(async (refresh = false) => {
    if (refresh) setError(null);
    try {
      const { data: payload } = await api.get("/dashboard/notifications/feed", {
        params: refresh ? { refresh: 1 } : {},
        timeout: 8_000,
        skipErrorLog: true,
        skipGlobalErrorToast: true,
      });
      setData({
        items: payload?.items ?? [],
        unread_count: payload?.unread_count ?? 0,
        etag: payload?.etag,
        cached: payload?.cached,
      });
    } catch {
      setData({ items: [], unread_count: 0 });
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed(false);
    const id = setInterval(() => fetchFeed(false), REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") fetchFeed(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchFeed]);

  const markRead = useCallback(
    async (keys) => {
      if (!keys?.length) return;
      await api.post("/dashboard/notifications/read", { keys });
      await fetchFeed(false);
    },
    [fetchFeed]
  );

  return { data, loading, error, fetchFeed, markRead };
}

const sevClass = (s) => {
  if (s === "critical") return "border-l-rose-500/90 bg-rose-950/35";
  if (s === "warning") return "border-l-amber-500/90 bg-amber-950/30";
  return "border-l-sky-600/80 bg-sky-950/25";
};

export default function EmpresaNotificationsBell() {
  const { data, loading, fetchFeed, markRead } = useOperationalNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev) => {
      if (rootRef.current && !rootRef.current.contains(ev.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const unread = data?.unread_count ?? 0;
  const preview = useMemo(() => (data?.items || []).slice(0, 8), [data?.items]);

  const badge =
    unread > 0 ? (
      <span className="absolute -right-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-sm">
        {unread > 9 ? "9+" : unread}
      </span>
    ) : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Notificações operacionais"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) fetchFeed(false);
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700/90 bg-zinc-900/80 text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-[1.15rem] w-[1.15rem]" aria-hidden="true">
          <path
            d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7"
            stroke="currentColor"
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 21h4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
        </svg>
        {badge}
      </button>

      {open ? (
        <div
          className="fc-notif-dropdown absolute right-0 z-[60] mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-xl border border-zinc-700/90 bg-zinc-950/98 shadow-2xl shadow-black/50 backdrop-blur-md"
          role="menu"
        >
          <div className="flex items-center justify-between border-b border-zinc-800/90 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Alertas</p>
            {loading ? <InlineSpinner label="" /> : null}
          </div>
          <div className="max-h-[min(70vh,22rem)] overflow-y-auto">
            {!preview.length ? (
              <p className="px-3 py-6 text-center text-sm text-zinc-500">Nenhum alerta ativo no momento.</p>
            ) : (
              <ul className="divide-y divide-zinc-800/80">
                {preview.map((it) => (
                  <li key={it.alert_key}>
                    <button
                      type="button"
                      className={`flex w-full flex-col gap-0.5 border-l-[3px] px-3 py-2.5 text-left text-sm ${sevClass(it.severity)} ${
                        it.read ? "opacity-60" : ""
                      }`}
                      onClick={async () => {
                        try {
                          if (!it.read) await markRead([it.alert_key]);
                        } catch (e) {
                          emitToast(e?.response?.data?.message || "Não foi possível marcar como lido.", "error");
                        }
                      }}
                    >
                      <span className="font-medium text-zinc-100">{it.title}</span>
                      <span className="text-xs leading-snug text-zinc-400">{it.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex gap-2 border-t border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5">
            <Link
              to="/empresa/alertas"
              className="flex-1 rounded-lg bg-zinc-800 py-2 text-center text-xs font-semibold text-zinc-100 hover:bg-zinc-700"
              onClick={() => setOpen(false)}
            >
              Central de alertas
            </Link>
            {unread > 0 ? (
              <button
                type="button"
                className="rounded-lg border border-zinc-600 px-2 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                onClick={async () => {
                  try {
                    const keys = (data?.items || []).filter((i) => !i.read).map((i) => i.alert_key);
                    await markRead(keys);
                    emitToast("Alertas marcados como lidos.");
                  } catch (e) {
                    emitToast(e?.response?.data?.message || "Falha ao marcar todos.", "error");
                  }
                }}
              >
                Ler tudo
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
