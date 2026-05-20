/** Motorista com veículo de transporte de material — entra no ranking de romaneios. */
export function isRankingTransporte(row) {
  if (!row || row.role !== "MOTORISTA") return false;
  if (row.veiculo_id == null || row.veiculo_id === "") return false;
  const tipo = String(row.tipo_operacao || "").trim().toLowerCase();
  return tipo === "transporte";
}

export function splitTransportRanking(items = []) {
  const rankingTransporte = [];
  const foraRanking = [];
  for (const row of items) {
    if (isRankingTransporte(row)) rankingTransporte.push(row);
    else foraRanking.push(row);
  }
  return { rankingTransporte, foraRanking };
}

/** Motivo de exclusão do ranking principal (exibição). */
export function foraRankingMotivo(row) {
  if (!row) return "—";
  if (row.role === "APONTADOR") return "Apontador";
  if (row.role !== "MOTORISTA") return row.role;
  if (row.veiculo_id == null || row.veiculo_id === "") return "Sem veículo vinculado";
  const tipo = String(row.tipo_operacao || "").trim().toLowerCase();
  if (tipo === "apoio") return "Veículo de apoio";
  return "Fora do transporte";
}
