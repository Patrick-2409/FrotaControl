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
    navigator.serviceWorker.register("/sw.js");
  });
}

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
