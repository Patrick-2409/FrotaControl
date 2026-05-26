import { useState } from "react";
import BIDashboardShell from "../modules/company/bi/components/BIDashboardShell";
import IntelligenceFiltersCard from "../modules/company/intelligence/components/IntelligenceFiltersCard";

const DEFAULT_FILTERS = {
  periodo: "mes",
  veiculoId: "todos",
  motoristaId: "todos",
  tipoAnalise: "geral",
};

const DEFAULT_VEHICLE_OPTIONS = [{ value: "todos", label: "Todos os veículos" }];
const DEFAULT_DRIVER_OPTIONS = [{ value: "todos", label: "Todos os motoristas" }];

const RESULT_ITEMS = [
  { title: "Status", value: "Aguardando geração da análise." },
  { title: "Problema principal", value: "Sem diagnóstico no momento." },
  { title: "Indicadores", value: "Os indicadores serão exibidos após a execução." },
  { title: "Gargalos", value: "Os gargalos aparecerão com base nos dados filtrados." },
  { title: "Ações", value: "As ações recomendadas serão listadas aqui." },
];

export default function InteligenciaPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  return (
    <BIDashboardShell
      eyebrow="Inteligência"
      title="Central de Inteligência Operacional"
      lead="Análise automatizada da operação com base em dados reais"
      showRoadmap={false}
    >
      <div className="space-y-5 sm:space-y-6">
        <IntelligenceFiltersCard
          filters={filters}
          onChange={setFilters}
          vehicleOptions={DEFAULT_VEHICLE_OPTIONS}
          driverOptions={DEFAULT_DRIVER_OPTIONS}
        />

        <section className="fc-card border-zinc-800/80 p-4 sm:p-5">
          <button
            type="button"
            className="fc-btn fc-btn-empresa-primary w-full rounded-md px-4 py-3 text-sm font-semibold sm:w-auto"
          >
            Gerar Análise Inteligente
          </button>
        </section>

        <section className="fc-card border-zinc-800/80 p-4 sm:p-5">
          <p className="fc-erp-eyebrow">Resultado</p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-100">Resumo da análise</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            {RESULT_ITEMS.map((item) => (
              <article key={item.title} className="rounded-xl border border-zinc-800/90 bg-zinc-950/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{item.title}</p>
                <p className="mt-2 text-sm text-zinc-300">{item.value}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </BIDashboardShell>
  );
}
