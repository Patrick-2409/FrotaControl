const parseCapacidadeTon = (value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const mapVeiculoApi = (v) => {
  const capacidadeTon = parseCapacidadeTon(v.capacidade_ton);
  const rawCapacidadeEsterilTon = parseCapacidadeTon(v.capacidade_esteril_ton);
  const rawCapacidadeRochaTon = parseCapacidadeTon(v.capacidade_rocha_ton);
  const hasSpecificCapacity = rawCapacidadeEsterilTon != null || rawCapacidadeRochaTon != null;
  const capacidadeEsterilTon = hasSpecificCapacity ? rawCapacidadeEsterilTon : capacidadeTon;
  const capacidadeRochaTon = hasSpecificCapacity ? rawCapacidadeRochaTon : capacidadeTon;
  const codigoApontador = Number(v.codigo_apontador ?? v.codigo_operacional);
  const codigoLabel = Number.isFinite(codigoApontador) && codigoApontador > 0
    ? String(codigoApontador).padStart(2, "0")
    : "";

  return {
    id: v.id,
    opcaoId: v.motorista_id != null ? `${v.id}:${v.motorista_id}` : String(v.id),
    codigoApontador: Number.isFinite(codigoApontador) && codigoApontador > 0 ? codigoApontador : null,
    codigoLabel,
    placa: v.placa,
    nome: v.nome,
    capacidadeTon,
    capacidadeEsterilTon,
    capacidadeRochaTon,
    capacidadePorMaterial: {
      esteril: capacidadeEsterilTon,
      rocha: capacidadeRochaTon,
    },
    motorista:
      v.motorista_id != null
        ? { id: v.motorista_id, nome: String(v.motorista_nome || "").trim() || "Motorista" }
        : null,
  };
};

export const storageKeyVeiculo = (empresaId, userId) =>
  `fc_apontador_veiculo_id:${empresaId ?? "default"}:${userId ?? "default"}`;
