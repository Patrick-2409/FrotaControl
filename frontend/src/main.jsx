import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./services/auth";
import ErrorBoundary from "./components/ErrorBoundary";
import { getBaseURL } from "./services/api";
import { fcLogger } from "./services/logger";

if (import.meta.env.DEV) {
  fcLogger.info("bootstrap", { baseURL: getBaseURL() || "(não definida — use VITE_API_URL em produção)" });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated" && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });
      })
      .catch(() => {});
  });
}

const PRELOAD_RELOAD_KEY = "fc_vite_preload_reload_once";
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  try {
    const alreadyReloaded = sessionStorage.getItem(PRELOAD_RELOAD_KEY) === "1";
    if (alreadyReloaded) return;
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, "1");
  } catch {
    // Se sessionStorage falhar, ainda tentamos recuperar com reload simples.
  }
  window.location.reload();
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
