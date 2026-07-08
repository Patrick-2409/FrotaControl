const parseCapacidadeTon = (value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const mapVeiculoApi = (v) => {
  const capacidadeTon = parseCapacidadeTon(v.capacidade_ton);
  const rawCapacidadeEsterilTon = parseCapacidadeTon(v.capacidade_esteril_ton);
  const rawCapacidadeRochaTon = parseCapacidadeTon(v.capacidade_rocha_ton);
  const rawCapacidadeRochaPulmaoTon = parseCapacidadeTon(v.capacidade_rocha_pulmao_ton);
  const rawCapacidadeRochaArmacaoTon = parseCapacidadeTon(v.capacidade_rocha_armacao_ton);
  const hasSpecificCapacity =
    rawCapacidadeEsterilTon != null ||
    rawCapacidadeRochaTon != null ||
    rawCapacidadeRochaPulmaoTon != null ||
    rawCapacidadeRochaArmacaoTon != null;
  const transportaEsteril =
    v.transporta_esteril != null
      ? Boolean(v.transporta_esteril)
      : hasSpecificCapacity
        ? rawCapacidadeEsterilTon != null
        : capacidadeTon != null;
  const transportaRochaPulmao =
    v.transporta_rocha_pulmao != null
      ? Boolean(v.transporta_rocha_pulmao)
      : v.transporta_rocha != null
        ? Boolean(v.transporta_rocha)
        : hasSpecificCapacity
          ? rawCapacidadeRochaPulmaoTon != null || rawCapacidadeRochaTon != null
          : capacidadeTon != null;
  const transportaRochaArmacao =
    v.transporta_rocha_armacao != null
      ? Boolean(v.transporta_rocha_armacao)
      : v.transporta_rocha != null
        ? Boolean(v.transporta_rocha)
        : hasSpecificCapacity
          ? rawCapacidadeRochaArmacaoTon != null || rawCapacidadeRochaTon != null
          : capacidadeTon != null;
  const transportaRocha = transportaRochaPulmao || transportaRochaArmacao;
  const capacidadeEsterilTon = transportaEsteril ? (hasSpecificCapacity ? rawCapacidadeEsterilTon : capacidadeTon) : null;
  const capacidadeRochaPulmaoTon = transportaRochaPulmao
    ? hasSpecificCapacity
      ? rawCapacidadeRochaPulmaoTon ?? rawCapacidadeRochaTon
      : capacidadeTon
    : null;
  const capacidadeRochaArmacaoTon = transportaRochaArmacao
    ? hasSpecificCapacity
      ? rawCapacidadeRochaArmacaoTon ?? rawCapacidadeRochaTon
      : capacidadeTon
    : null;
  const capacidadeRochaTon = transportaRocha
    ? rawCapacidadeRochaTon ?? capacidadeRochaPulmaoTon ?? capacidadeRochaArmacaoTon
    : null;
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
    capacidadeRochaPulmaoTon,
    capacidadeRochaArmacaoTon,
    transportaEsteril,
    transportaRocha,
    transportaRochaPulmao,
    transportaRochaArmacao,
    capacidadePorMaterial: {
      esteril: capacidadeEsterilTon,
      rocha_pulmao: capacidadeRochaPulmaoTon,
      rocha_armacao: capacidadeRochaArmacaoTon,
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
