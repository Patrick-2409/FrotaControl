import { Component } from "react";
import { createLogger } from "../services/logger";

const log = createLogger("react");

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "Erro inesperado ao renderizar a tela.",
    };
  }

  componentDidCatch(error, info) {
    log.error("react_error_boundary", {
      message: error?.message,
      stack: error?.stack?.slice?.(0, 4000),
      componentStack: info?.componentStack?.slice?.(0, 2000),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-screen place-content-center bg-slate-950 p-6 text-center">
          <div className="fc-card max-w-md border-slate-700/80 p-6">
            <h1 className="text-lg font-semibold text-slate-100">Algo correu mal nesta vista</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Ocorreu um erro inesperado na interface. Os seus dados não foram alterados por este painel. Pode tentar
              recarregar a página ou voltar ao menu anterior.
            </p>
            <p className="mt-4 rounded-md border border-slate-800 bg-slate-900/80 px-3 py-2 text-left text-xs text-slate-500">
              Referência técnica (útil para suporte): {this.state.errorMessage}
            </p>
            <button
              type="button"
              className="fc-btn mt-6 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-700"
              onClick={() => window.location.reload()}
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
