import EmpresaModulePlaceholder from "../../shared/components/EmpresaModulePlaceholder";
import { useFleetData } from "../../hooks/useFleetData";

export default function EmpresaFrotaPage() {
  const fleet = useFleetData();
  return (
    <div className="fc-erp-workspace">
      <EmpresaModulePlaceholder
        title="Gestão de Frota"
        description="Cadastro, status e indicadores de veículos. Hoje a gestão completa continua em Gestão (/dashboard/gestao); esta rota receberá os fluxos de frota progressivamente."
      />
      <p className="mt-4 max-w-prose text-xs leading-relaxed text-zinc-500">
        Estado do módulo frota: <span className="font-mono text-zinc-400">{fleet.phase}</span> (sem partilha de
        contexto com transporte, combustível ou parte diária).
      </p>
    </div>
  );
}
