const TIPO_OPERACAO_TRANSPORTE = "transporte";
const TIPO_OPERACAO_APOIO = "apoio";

const normalizeTipoOperacao = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === TIPO_OPERACAO_TRANSPORTE || raw === TIPO_OPERACAO_APOIO) return raw;
  return null;
};

const resolveUsaRomaneio = (veiculo = {}) =>
  Boolean(veiculo.usa_romaneio ?? veiculo.usa_para_transporte);

function classificarVeiculos(veiculos) {
  if (!Array.isArray(veiculos)) return [];

  return veiculos.map((veiculo) => {
    const existente = normalizeTipoOperacao(veiculo?.tipo_operacao);
    const usaRomaneio = resolveUsaRomaneio(veiculo);
    const tipo_operacao = existente || (usaRomaneio ? TIPO_OPERACAO_TRANSPORTE : TIPO_OPERACAO_APOIO);

    return {
      ...veiculo,
      usa_romaneio: usaRomaneio,
      tipo_operacao,
    };
  });
}

const separarVeiculosPorTipo = (veiculos) => {
  const classificados = classificarVeiculos(veiculos);
  return {
    veiculos: classificados,
    transporte: classificados.filter((v) => v.tipo_operacao === TIPO_OPERACAO_TRANSPORTE),
    apoio: classificados.filter((v) => v.tipo_operacao === TIPO_OPERACAO_APOIO),
  };
};

const isVeiculoTransporte = (veiculo) =>
  normalizeTipoOperacao(veiculo?.tipo_operacao) === TIPO_OPERACAO_TRANSPORTE ||
  (veiculo?.tipo_operacao !== TIPO_OPERACAO_APOIO && resolveUsaRomaneio(veiculo));

module.exports = {
  TIPO_OPERACAO_TRANSPORTE,
  TIPO_OPERACAO_APOIO,
  classificarVeiculos,
  separarVeiculosPorTipo,
  resolveUsaRomaneio,
  isVeiculoTransporte,
};
