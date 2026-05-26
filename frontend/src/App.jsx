import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "./services/auth";
import MotoristaLayout from "./components/MotoristaLayout";
import EmpresaLayout from "./components/EmpresaLayout";
import SuperAdminLayout from "./components/SuperAdminLayout";
import RouteTransition from "./components/RouteTransition";
import ToastHost from "./components/ToastHost";
import { ScreenLoading } from "./components/LoadingState";
import { countPending, syncPending } from "./services/syncService";
import { generateId } from "./utils/id";

const HomePage = lazy(() => import("./pages/HomePage"));
const RomaneioPage = lazy(() => import("./pages/RomaneioPage"));
const CombustivelPage = lazy(() => import("./pages/CombustivelPage"));
const ParteDiariaPage = lazy(() => import("./pages/ParteDiariaPage"));
const HistoricoPage = lazy(() => import("./pages/HistoricoPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));

const LandingPage = lazy(() => import("./pages/LandingPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const CompanyManagementPage = lazy(() => import("./pages/CompanyManagementPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AdminHistoricoPage = lazy(() => import("./pages/AdminHistoricoPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const SuperAdminLoginPage = lazy(() => import("./pages/SuperAdminLoginPage"));
const ApontadorLoginPage = lazy(() => import("./pages/ApontadorLoginPage"));
const ApontadorHomePage = lazy(() => import("./pages/ApontadorHomePage"));
const EmpresaExecutiveDashboardPage = lazy(() => import("./modules/company/dashboard/pages/EmpresaExecutiveDashboardPage"));
const EmpresaTransportePage = lazy(() => import("./modules/company/transport/pages/EmpresaTransportePage"));
const EmpresaCombustivelPage = lazy(() => import("./modules/company/fuel/pages/EmpresaCombustivelPage"));
const EmpresaParteDiariaPage = lazy(() => import("./modules/company/daily/pages/EmpresaParteDiariaPage"));
const EmpresaFrotaPage = lazy(() => import("./modules/company/fleet/pages/EmpresaFrotaPage"));
const EmpresaPessoasPage = lazy(() => import("./modules/company/people/pages/EmpresaPessoasPage"));
const EmpresaRelatoriosPage = lazy(() => import("./modules/company/reports/pages/EmpresaRelatoriosPage"));
const EmpresaAlertasPage = lazy(() => import("./modules/company/alerts/pages/EmpresaAlertasPage"));
const InteligenciaPage = lazy(() =>
  import("./pages/inteligencia").then((module) => ({
    default: module.default,
  }))
);

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <ScreenLoading />;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function ProtectedApp({ children }) {
  const { isMotorista } = useAuth();
  if (!isMotorista) return <Navigate to="/" replace />;
  return children;
}

function ProtectedDashboard({ children }) {
  const { isAdminEmpresa } = useAuth();
  if (!isAdminEmpresa) return <Navigate to="/" replace />;
  return children;
}

function ProtectedSuperAdmin({ children }) {
  const { isSuperAdmin } = useAuth();
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return children;
}

function ProtectedApontador({ children }) {
  const { isApontador } = useAuth();
  if (!isApontador) return <Navigate to="/" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <ScreenLoading />;
  if (user) return <Navigate to="/portal" replace />;
  return children;
}

function App() {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [reloadKey, setReloadKey] = useState(0);
  const [syncStatus, setSyncStatus] = useState("synced");
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState("");
  const toastTimersRef = useRef(new Map());

  const refreshPending = async () => setPendingCount(await countPending());

  useEffect(() => {
    const runSync = async () => {
      if (!navigator.onLine || user?.role !== "MOTORISTA") return;
      const result = await syncPending();
      setSyncStatus(result.state);
      if (result?.state === "synced") {
        setLastSyncAt(new Date().toISOString());
      }
      await refreshPending();
      setReloadKey((x) => x + 1);
    };
    Promise.resolve().then(async () => {
      await refreshPending();
      if (navigator.onLine && user?.role === "MOTORISTA") {
        await runSync();
      }
    });
    const onOnline = async () => {
      setOnline(true);
      await runSync();
    };
    const onOffline = () => {
      setOnline(false);
      setSyncStatus("sem_internet");
    };
    const interval = setInterval(async () => {
      await runSync();
    }, 20000);
    const onFocus = async () => {
      await runSync();
    };
    const onVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        await runSync();
      }
    };
    const onSyncState = (ev) => {
      if (!ev?.detail) return;
      setSyncStatus(ev.detail);
      if (ev.detail === "synced") {
        setLastSyncAt(new Date().toISOString());
      }
    };
    const onApiError = (ev) => {
      const id = generateId();
      setToasts((prev) => [
        ...prev,
        { id, message: ev.detail, type: navigator.onLine ? "error" : "warning" },
      ]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, 3500);
    };
    const onToast = (ev) => {
      const id = generateId();
      const detail = ev.detail && typeof ev.detail === "object" ? ev.detail : {};
      const { message, type, durationMs, actionLabel, onAction, ...rest } = detail;
      const resolvedType = type || "success";
      const hasAction = typeof onAction === "function" && typeof actionLabel === "string" && actionLabel.trim();
      const ms =
        typeof durationMs === "number" && durationMs > 0
          ? durationMs
          : hasAction
            ? 5000
            : 4000;
      setToasts((prev) => [...prev, { id, message, type: resolvedType, durationMs: ms, actionLabel, onAction, ...rest }]);
      const tid = setTimeout(() => {
        toastTimersRef.current.delete(id);
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, ms);
      toastTimersRef.current.set(id, tid);
    };
    const onAuthExpired = () => {
      setSessionExpiredNotice("Sessão expirada. Faça login novamente.");
      const id = generateId();
      setToasts((prev) => [...prev, { id, message: "Sessão expirada. Faça login novamente.", type: "warning" }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, 5000);
      setTimeout(() => {
        setSessionExpiredNotice("");
      }, 6000);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("fc:sync-state", onSyncState);
    window.addEventListener("fc:api-error", onApiError);
    window.addEventListener("fc:toast", onToast);
    window.addEventListener("fc:auth-expired", onAuthExpired);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      for (const tid of toastTimersRef.current.values()) {
        clearTimeout(tid);
      }
      toastTimersRef.current.clear();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("fc:sync-state", onSyncState);
      window.removeEventListener("fc:api-error", onApiError);
      window.removeEventListener("fc:toast", onToast);
      window.removeEventListener("fc:auth-expired", onAuthExpired);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user?.role]);

  const dismissToast = (id) => {
    const tid = toastTimersRef.current.get(id);
    if (tid) clearTimeout(tid);
    toastTimersRef.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  };

  const manualSync = async () => {
    setSyncStatus("syncing");
    const result = await syncPending();
    setSyncStatus(result.state);
    if (result?.state === "synced") {
      setLastSyncAt(new Date().toISOString());
    }
    await refreshPending();
    setReloadKey((x) => x + 1);
  };

  const handleSaved = async () => {
    await refreshPending();
    setReloadKey((x) => x + 1);
  };

  return (
    <Suspense fallback={<ScreenLoading />}>
      <a href="#conteudo-principal" className="fc-skip-link">Pular para o conteudo principal</a>
      {sessionExpiredNotice && (
        <div className="fixed left-1/2 top-4 z-[70] w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100 shadow-2xl shadow-black/40">
          {sessionExpiredNotice}
        </div>
      )}
      <ToastHost toasts={toasts} onClose={dismissToast} />
      <Routes>
        <Route
          path="/"
          element={
            <PublicOnly>
              <LandingPage />
            </PublicOnly>
          }
        />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/admin-login"
          element={
            <PublicOnly>
              <AdminLoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/super-admin-login"
          element={
            <PublicOnly>
              <SuperAdminLoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/apontador-login"
          element={
            <PublicOnly>
              <ApontadorLoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/app/*"
          element={
            <Protected>
              <ProtectedApp>
                <MotoristaLayout
                  onSync={manualSync}
                  pendingCount={pendingCount}
                  online={online}
                  syncStatus={syncStatus}
                  lastSyncAt={lastSyncAt}
                >
                  <RouteTransition>
                    <Routes>
                      <Route path="/" element={<Navigate to="home" replace />} />
                      <Route path="home" element={<HomePage pendingCount={pendingCount} online={online} />} />
                      <Route
                        path="romaneio"
                        element={
                          user?.is_motorista_apoio ? (
                            <Navigate to="/app/home" replace />
                          ) : (
                            <RomaneioPage onSaved={handleSaved} />
                          )
                        }
                      />
                      <Route path="combustivel" element={<CombustivelPage onSaved={handleSaved} />} />
                      <Route path="parte-diaria" element={<ParteDiariaPage onSaved={handleSaved} />} />
                      <Route path="historico" element={<HistoricoPage reloadKey={reloadKey} />} />
                      <Route path="perfil" element={<ProfilePage />} />
                    </Routes>
                  </RouteTransition>
                </MotoristaLayout>
              </ProtectedApp>
            </Protected>
          }
        />

        <Route
          path="/dashboard/*"
          element={
            <Protected>
              <ProtectedDashboard>
                <EmpresaLayout>
                  <RouteTransition>
                    <Routes>
                      <Route path="/" element={<Navigate to="/empresa/dashboard" replace />} />
                      <Route path="relatorios" element={<Navigate to="/empresa/relatorios" replace />} />
                      <Route path="gestao" element={<CompanyManagementPage />} />
                      <Route path="perfil" element={<ProfilePage />} />
                    </Routes>
                  </RouteTransition>
                </EmpresaLayout>
              </ProtectedDashboard>
            </Protected>
          }
        />

        <Route
          path="/empresa/*"
          element={
            <Protected>
              <ProtectedDashboard>
                <EmpresaLayout>
                  <RouteTransition>
                    <Routes>
                      <Route path="/" element={<Navigate to="dashboard" replace />} />
                      <Route path="dashboard" element={<EmpresaExecutiveDashboardPage />} />
                      <Route path="transporte" element={<EmpresaTransportePage />} />
                      <Route path="combustivel" element={<EmpresaCombustivelPage />} />
                      <Route path="parte-diaria" element={<EmpresaParteDiariaPage />} />
                      <Route path="frota" element={<EmpresaFrotaPage />} />
                      <Route path="pessoas" element={<EmpresaPessoasPage />} />
                      <Route path="relatorios" element={<EmpresaRelatoriosPage />} />
                      <Route path="alertas" element={<EmpresaAlertasPage />} />
                      <Route path="*" element={<Navigate to="dashboard" replace />} />
                    </Routes>
                  </RouteTransition>
                </EmpresaLayout>
              </ProtectedDashboard>
            </Protected>
          }
        />

        <Route
          path="/inteligencia"
          element={
            <Protected>
              <ProtectedDashboard>
                <EmpresaLayout>
                  <RouteTransition>
                    <InteligenciaPage />
                  </RouteTransition>
                </EmpresaLayout>
              </ProtectedDashboard>
            </Protected>
          }
        />

        <Route
          path="/super-admin"
          element={
            <Protected>
              <ProtectedSuperAdmin>
                <SuperAdminLayout />
              </ProtectedSuperAdmin>
            </Protected>
          }
        >
          <Route index element={<AdminPage />} />
          <Route path="historico" element={<AdminHistoricoPage />} />
        </Route>

        <Route
          path="/apontador"
          element={
            <Protected>
              <ProtectedApontador>
                <div className="min-h-[100dvh] min-h-screen bg-slate-950" id="conteudo-principal">
                  <ApontadorHomePage />
                </div>
              </ProtectedApontador>
            </Protected>
          }
        />

        <Route
          path="/portal"
          element={
            <Protected>
              <Navigate
                to={
                  user?.role === "SUPER_ADMIN"
                    ? "/super-admin"
                    : user?.role === "ADMIN_EMPRESA"
                    ? "/empresa/dashboard"
                    : user?.role === "APONTADOR"
                    ? "/apontador"
                    : "/app/home"
                }
                replace
              />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to={user ? "/portal" : "/"} replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
