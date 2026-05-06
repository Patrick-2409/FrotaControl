import { Component } from "react";

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
    console.error("ErrorBoundary capturou um erro:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-screen place-content-center p-6 text-center">
          <div className="fc-card max-w-md p-5">
            <h1 className="text-lg font-semibold text-red-300">Erro ao carregar dados</h1>
            <p className="mt-2 text-sm text-slate-300">
              O aplicativo encontrou uma falha inesperada, mas continua ativo.
            </p>
            <p className="mt-2 text-xs text-slate-400">{this.state.errorMessage}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
