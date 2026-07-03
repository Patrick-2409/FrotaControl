/** Motorista com veículo de transporte de material — entra no ranking de romaneios. */
export function isRankingTransporte(row) {
  if (!row || row.role !== "MOTORISTA") return false;
  if (row.tem_veiculo_transporte) return true;
  const linked = Array.isArray(row.veiculos_vinculados) ? row.veiculos_vinculados : [];
  if (linked.some((v) => String(v?.tipo_operacao || "").trim().toLowerCase() === "transporte")) return true;
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
  const linked = Array.isArray(row.veiculos_vinculados) ? row.veiculos_vinculados : [];
  if (row.tem_veiculo_transporte || linked.some((v) => String(v?.tipo_operacao || "").trim().toLowerCase() === "transporte")) {
    return "Fora do transporte";
  }
  if ((row.veiculo_id == null || row.veiculo_id === "") && linked.length === 0) return "Sem veículo vinculado";
  if (row.tem_veiculo_apoio || linked.some((v) => String(v?.tipo_operacao || "").trim().toLowerCase() === "apoio")) return "Veículo de apoio";
  const tipo = String(row.tipo_operacao || "").trim().toLowerCase();
  if (tipo === "apoio") return "Veículo de apoio";
  return "Fora do transporte";
}
