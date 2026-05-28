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
  embedded = false,
  variant = "dark",
}) {
  const isLight = variant === "light";
  const labelClass = isLight
    ? "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
    : "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400";
  const selectClass = isLight
    ? "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
    : inputClass;
  const onFieldChange = (field) => (event) => {
    onChange((prev) => ({ ...prev, [field]: event.target.value }));
  };

  return (
    <section className={embedded ? "" : "fc-card border-zinc-800/80 p-4 sm:p-5"}>
      {!embedded ? <p className="fc-erp-eyebrow">Filtros</p> : null}
      {!embedded ? <h2 className="mt-1 text-lg font-semibold text-zinc-100">Configuração da análise</h2> : null}
      {!embedded ? (
        <p className="mt-2 text-sm text-zinc-400">Defina o contexto da leitura operacional antes de gerar o relatório.</p>
      ) : null}

      <div className={`${embedded ? "" : "mt-4"} grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4`}>
        <label className="block">
          <span className={labelClass}>Período</span>
          <select className={selectClass} value={filters.periodo} onChange={onFieldChange("periodo")}>
            {PERIOD_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>Veículo</span>
          <select className={selectClass} value={filters.veiculoId} onChange={onFieldChange("veiculoId")}>
            {vehicleOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>Motorista</span>
          <select className={selectClass} value={filters.motoristaId} onChange={onFieldChange("motoristaId")}>
            {driverOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>Tipo de análise</span>
          <select className={selectClass} value={filters.tipoAnalise} onChange={onFieldChange("tipoAnalise")}>
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
