import { inputClass } from "../../../../components/FormField";

const PERIOD_OPTIONS = [
  { value: "dia", label: "Dia" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
  { value: "ano", label: "Ano" },
];

const ANALYSIS_TYPE_OPTIONS = [
  { value: "geral", label: "Geral" },
  { value: "combustivel", label: "Combustível" },
  { value: "transporte", label: "Transporte" },
  { value: "frota", label: "Frota" },
];

export default function IntelligenceFiltersCard({
  filters,
  onChange,
  vehicleOptions = [],
  driverOptions = [],
}) {
  const onFieldChange = (field) => (event) => {
    onChange((prev) => ({ ...prev, [field]: event.target.value }));
  };

  return (
    <section className="fc-card border-zinc-800/80 p-4 sm:p-5">
      <p className="fc-erp-eyebrow">Filtros</p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-100">Configuração da análise</h2>
      <p className="mt-2 text-sm text-zinc-400">Defina o contexto da leitura operacional antes de gerar o relatório.</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Período</span>
          <select className={inputClass} value={filters.periodo} onChange={onFieldChange("periodo")}>
            {PERIOD_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Veículo</span>
          <select className={inputClass} value={filters.veiculoId} onChange={onFieldChange("veiculoId")}>
            {vehicleOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Motorista</span>
          <select className={inputClass} value={filters.motoristaId} onChange={onFieldChange("motoristaId")}>
            {driverOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Tipo de análise</span>
          <select className={inputClass} value={filters.tipoAnalise} onChange={onFieldChange("tipoAnalise")}>
            {ANALYSIS_TYPE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
