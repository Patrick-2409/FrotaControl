import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../services/auth";
import useHaptics from "../hooks/useHaptics";
import SystemLogo from "./SystemLogo";
import CompanyLogo from "./CompanyLogo";
import Avatar from "./Avatar";

const tabsBase = [
  { to: "/app/home", label: "Início" },
  { to: "/app/romaneio", label: "Transporte" },
  { to: "/app/combustivel", label: "Combustível" },
  { to: "/app/parte-diaria", label: "Parte diária" },
  { to: "/app/historico", label: "Histórico" },
  { to: "/app/perfil", label: "Perfil" },
];

export default function MotoristaLayout({ children, onSync, pendingCount, online, syncStatus, lastSyncAt }) {
  const { user, logout, refreshUser } = useAuth();
  const { pathname } = useLocation();
  const { tap } = useHaptics();
  const syncing = syncStatus === "syncing";
  const hasSyncIssue = !online || pendingCount > 0 || (syncStatus !== "synced" && syncStatus !== "syncing");
  const syncIndicatorLabel = pendingCount > 0 || !online || syncStatus === "pending" || syncStatus === "syncing" ? "pendente" : "sincronizado";
  const [fieldExtremeMode, setFieldExtremeMode] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("fc_field_extreme_mode");
    setFieldExtremeMode(saved === "1");
  }, []);

  useEffect(() => {
    refreshUser?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onWindowClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };
    if (profileMenuOpen) {
      window.addEventListener("mousedown", onWindowClick);
    }
    return () => {
      window.removeEventListener("mousedown", onWindowClick);
    };
  }, [profileMenuOpen]);

  const toggleFieldMode = () => {
    setFieldExtremeMode((prev) => {
      const next = !prev;
      localStorage.setItem("fc_field_extreme_mode", next ? "1" : "0");
      tap(12);
      return next;
    });
  };

  const isApoio = Boolean(user?.is_motorista_apoio);
  const tabs = isApoio ? tabsBase.filter((tab) => tab.to !== "/app/romaneio") : tabsBase;

  const lastSyncLabel = (() => {
    if (!lastSyncAt) return "—";
    const parsed = new Date(lastSyncAt);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  })();

  return (
    <div
      className={`fc-theme-driver fc-field-mode ${
        fieldExtremeMode ? "fc-field-extreme" : ""
      } mx-auto min-h-[100dvh] min-h-screen w-full max-w-xl bg-slate-950 px-4 py-4 text-slate-100 sm:px-6`}
      style={{ paddingTop: "max(0.85rem, env(safe-area-inset-top, 0px))" }}
    >
      {!online && (
        <div className="fc-page mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm font-medium text-amber-100" role="status" aria-live="assertive">
          Sem internet. O app está em modo offline e vai sincronizar automaticamente quando voltar.
        </div>
      )}

      <header
        className="fc-card sticky z-40 mb-4 p-4"
        style={{ top: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-3">
            <CompanyLogo
              logoUrl={user?.logo_url}
              companyName={user?.empresa_nome}
              className="h-12 w-12 rounded-lg p-1"
            />
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <SystemLogo variant="minimal" className="rounded-md opacity-90" alt="FrotaControl" />
                <p className="text-xs uppercase tracking-wide text-blue-300">App Motorista</p>
              </div>
              <h1 className="truncate text-base font-semibold text-white sm:text-lg">{user?.nome}</h1>
              <p className="truncate text-xs text-slate-400">{user?.empresa_nome || "Operação de campo"}</p>
            </div>
          </div>
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => {
                tap(8);
                setProfileMenuOpen((prev) => !prev);
              }}
              className="fc-btn btn-secondary rounded-full p-1"
              aria-expanded={profileMenuOpen}
              aria-label="Abrir menu do perfil"
            >
              <Avatar imageUrl={user?.profile_image_url} name={user?.nome} size="header" />
            </button>
            {profileMenuOpen && (
              <div className="absolute right-0 top-14 z-50 w-52 rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl shadow-black/40">
                <p className="truncate text-sm font-semibold text-slate-100">{user?.nome}</p>
                <p className="mt-0.5 truncate text-xs text-slate-400">{user?.empresa_nome || "Operação de campo"}</p>
                <button
                  type="button"
                  onClick={logout}
                  className="fc-btn btn-secondary mt-3 w-full rounded-lg px-3 py-2 text-sm"
                >
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium" role="status" aria-live="polite">
          <span className={`rounded-full px-3 py-1 ${syncIndicatorLabel === "pendente" ? "bg-amber-500/30 text-amber-100" : "bg-emerald-500/20 text-emerald-100"}`}>
            Status: {syncIndicatorLabel}
          </span>
          <span className={`rounded-full px-3 py-1 ${pendingCount > 0 ? "bg-amber-500/20 text-amber-100" : "bg-slate-800 text-slate-300"}`}>
            Pendências: {pendingCount}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1">
            <span className={`fc-sync-dot ${syncing ? "syncing" : ""}`} />
            {syncStatus === "syncing"
              ? "sincronizando"
              : syncStatus === "sem_internet"
              ? "sem internet"
              : syncStatus === "pending"
              ? "pendente"
              : "sincronizado"}
          </span>
          <button
            type="button"
            onClick={toggleFieldMode}
            className={`fc-btn btn-secondary rounded-full px-3 py-1 ${
              fieldExtremeMode
                ? "border-cyan-300/70 bg-cyan-400/20 text-cyan-100"
                : ""
            }`}
            aria-pressed={fieldExtremeMode}
          >
            {fieldExtremeMode ? "Modo Campo Extremo: ON" : "Modo Campo Extremo: OFF"}
          </button>
          <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-slate-300">
            Última sincronização: {lastSyncLabel}
          </span>
          {hasSyncIssue ? (
            <button
              type="button"
              onClick={() => {
                tap(10);
                onSync();
              }}
              className="fc-btn btn-success rounded-full px-3 py-1 text-xs font-semibold"
            >
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </button>
          ) : null}
        </div>
      </header>

      <main
        className="fc-page pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]"
        id="conteudo-principal"
      >
        {children}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 mx-auto flex max-w-xl gap-2 overflow-x-auto border-t border-slate-800 bg-slate-900/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] [-webkit-overflow-scrolling:touch]"
        aria-label="Navegacao do app motorista"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            onClick={() => tap(8)}
            className={`fc-tab-link flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-2 text-xs ${
              pathname === tab.to ? "active" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
