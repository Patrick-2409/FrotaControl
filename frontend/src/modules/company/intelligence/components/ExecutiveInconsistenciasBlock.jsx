const fmtNumber = (value, digits = 0) => {
  const parsed = Number(value);
  const n = Number.isFinite(parsed) ? parsed : 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export default function ExecutiveInconsistenciasBlock({ inconsistenciasDetalhadas = [], inconsistencias = [] }) {
  const detalhadas = Array.isArray(inconsistenciasDetalhadas) ? inconsistenciasDetalhadas : [];
  const fallback = Array.isArray(inconsistencias) ? inconsistencias : [];
  const total = detalhadas.length || fallback.length;

  if (!total) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
        Nenhuma inconsistência crítica detectada entre produção (viagens) e consumo no período analisado.
      </div>
    );
  }

  if (detalhadas.length > 0) {
    return (
      <ul className="space-y-3">
        {detalhadas.slice(0, 10).map((item) => {
          const critico = item.tipo === "ERRO_CRITICO";
          const key = `${item.veiculoId ?? item.veiculo}-${item.tipo}-${item.viagens}-${item.litros}`;
          return (
            <li
              key={key}
              className={`rounded-xl border px-4 py-3 text-sm ${
                critico ? "border-red-300 bg-white text-red-900" : "border-amber-300 bg-white text-amber-950"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                    critico ? "bg-red-600 text-white" : "bg-amber-500 text-white"
                  }`}
                >
                  {critico ? "Crítico" : "Alerta"}
                </span>
                <span className="font-semibold">
                  {item.veiculo}
                  {item.placa && item.placa !== "-" ? ` (${item.placa})` : ""}
                </span>
              </div>
              <p className="mt-1">{item.descricao}</p>
              <p className="mt-1 text-xs text-slate-600">
                {fmtNumber(item.viagens)} viagem(ns) · {fmtNumber(item.litros, 1)} L
              </p>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="list-disc space-y-2 pl-5 text-sm text-red-900">
      {fallback.slice(0, 8).map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
