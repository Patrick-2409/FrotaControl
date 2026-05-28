const { toNumber } = require("./common");

const resolveLitros = (item) => toNumber(item?.litros ?? item?.consumo ?? item?.totalLitros);
const resolveNome = (item) => item?.nome || item?.veiculo || "Veículo";

const buildCandidatosDominancia = (combustivel = [], transporte = []) => {
  const transporteComConsumo = transporte
    .map((item) => ({
      ...item,
      litros: resolveLitros(item),
      nome: resolveNome(item),
    }))
    .filter((item) => item.litros > 0);

  if (transporteComConsumo.length) return transporteComConsumo;

  return combustivel
    .map((item) => ({
      ...item,
      litros: resolveLitros(item),
      nome: resolveNome(item),
    }))
    .filter((item) => item.litros > 0);
};

const gerarInsights = (dados = {}) => {
  const insights = [];
  const combustivel = Array.isArray(dados.combustivel) ? dados.combustivel : [];
  const transporte = Array.isArray(dados.transporte) ? dados.transporte : [];
  const indicadores = dados.indicadores || {};

  const consumoCombustivel = combustivel.reduce((acc, item) => acc + resolveLitros(item), 0);
  const consumoTotal = toNumber(indicadores.totalLitros) || consumoCombustivel;

  const candidatos = buildCandidatosDominancia(combustivel, transporte);
  const veiculoDominante = candidatos.length
    ? [...candidatos].sort((a, b) => b.litros - a.litros)[0]
    : null;

  if (veiculoDominante && consumoTotal > 0) {
    const percentual = Math.round((veiculoDominante.litros / consumoTotal) * 1000) / 10;
    insights.push({
      tipo: "CONCENTRACAO",
      mensagem:
        percentual >= 35
          ? `O veículo ${veiculoDominante.nome} concentra ${percentual}% do consumo (${veiculoDominante.litros.toFixed(1)} L).`
          : `O veículo ${veiculoDominante.nome} concentra grande parte do consumo (${veiculoDominante.litros.toFixed(1)} L).`,
      veiculo: veiculoDominante.nome,
      litros: veiculoDominante.litros,
      percentual,
    });
  }

  if (consumoTotal === 0) {
    insights.push({
      tipo: "ERRO_DADOS",
      mensagem: "Não há consumo registrado no período",
    });
  }

  return insights;
};

module.exports = {
  gerarInsights,
  buildCandidatosDominancia,
};
