export const EXECUTIVO_PERIODOS = ["dia", "semana", "mes", "ano"];
export const EXECUTIVO_PERIODO_DEFAULT = "semana";
const STORAGE_KEY = "fc:executivo:periodo";

export const PERIODO_OPCOES = [
  { id: "dia", label: "Dia" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "ano", label: "Ano" },
];

export function readExecutivePeriodo() {
  if (typeof localStorage === "undefined") return EXECUTIVO_PERIODO_DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (EXECUTIVO_PERIODOS.includes(raw)) return raw;
  } catch {
    /* quota ou modo privado */
  }
  return EXECUTIVO_PERIODO_DEFAULT;
}

export function writeExecutivePeriodo(periodo) {
  if (typeof localStorage === "undefined") return;
  if (!EXECUTIVO_PERIODOS.includes(periodo)) return;
  try {
    localStorage.setItem(STORAGE_KEY, periodo);
  } catch {
    /* quota ou modo privado */
  }
}

export function periodoResumoLabel(periodo) {
  if (periodo === "dia") return "Hoje";
  if (periodo === "semana") return "Últimos 7 dias";
  if (periodo === "mes") return "Mês atual";
  if (periodo === "ano") return "Ano atual";
  return "Período selecionado";
}
