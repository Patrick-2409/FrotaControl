export const mapVeiculoApi = (v) => ({
  id: v.id,
  placa: v.placa,
  nome: v.nome,
  capacidadeTon: v.capacidade_ton != null && v.capacidade_ton !== "" ? Number(v.capacidade_ton) : null,
  motorista:
    v.motorista_id != null
      ? { id: v.motorista_id, nome: String(v.motorista_nome || "").trim() || "Motorista" }
      : null,
});

export const storageKeyVeiculo = (empresaId) => `fc_apontador_veiculo_id:${empresaId ?? "default"}`;
