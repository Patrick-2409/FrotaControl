import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "./services/auth";
import MotoristaLayout from "./components/MotoristaLayout";
import EmpresaLayout from "./components/EmpresaLayout";
import SuperAdminLayout from "./components/SuperAdminLayout";
import RouteTransition from "./components/RouteTransition";
import ToastHost from "./components/ToastHost";
import { countPending, syncPending } from "./services/syncService";
import { generateId } from "./utils/id";
import HomePage from "./pages/HomePage";
import RomaneioPage from "./pages/RomaneioPage";
import CombustivelPage from "./pages/CombustivelPage";
import ParteDiariaPage from "./pages/ParteDiariaPage";
import HistoricoPage from "./pages/HistoricoPage";
import ProfilePage from "./pages/ProfilePage";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ManagerDashboardPage = lazy(() => import("./pages/ManagerDashboardPage"));
const ManagerRecordsPage = lazy(() => import("./pages/ManagerRecordsPage"));
const CompanyManagementPage = lazy(() => import("./pages/CompanyManagementPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const SuperAdminLoginPage = lazy(() => import("./pages/SuperAdminLoginPage"));

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-content-center">Carregando...</div>;
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

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-content-center">Carregando...</div>;
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
      setToasts((prev) => [...prev, { id, ...ev.detail }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, 4000);
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

  const manualSync = async () => {
    setSyncStatus("enviando");
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
    <Suspense fallback={<div className="grid min-h-screen place-content-center text-slate-300">Carregando...</div>}>
      <a href="#conteudo-principal" className="fc-skip-link">Pular para o conteudo principal</a>
      {sessionExpiredNotice && (
        <div className="fixed left-1/2 top-4 z-[70] w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100 shadow-2xl shadow-black/40">
          {sessionExpiredNotice}
        </div>
      )}
      <ToastHost toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((x) => x.id !== id))} />
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
                      <Route path="romaneio" element={<RomaneioPage onSaved={handleSaved} />} />
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
                      <Route path="/" element={<ManagerDashboardPage />} />
                      <Route path="relatorios" element={<ManagerRecordsPage />} />
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
          path="/super-admin/*"
          element={
            <Protected>
              <ProtectedSuperAdmin>
                <SuperAdminLayout>
                  <RouteTransition>
                    <Routes>
                      <Route path="/" element={<AdminPage />} />
                    </Routes>
                  </RouteTransition>
                </SuperAdminLayout>
              </ProtectedSuperAdmin>
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
                    ? "/dashboard"
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
