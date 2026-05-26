const { toNumber } = require("./common");

const gerarResumoExecutivo = ({ combustivel, transporte, frota }) => {
  const totalLitros = toNumber(combustivel?.indicadores?.totalLitros);
  const totalLitrosTransporte = toNumber(combustivel?.indicadores?.totalLitrosTransporte);
  const totalValor = toNumber(combustivel?.indicadores?.totalValor);
  const totalValorTransporte = toNumber(combustivel?.indicadores?.totalValorTransporte);
  const precoMedio = toNumber(combustivel?.indicadores?.precoMedio);
  const totalViagens = toNumber(transporte?.indicadores?.totalViagens);
  const totalViagensTransporte = toNumber(transporte?.indicadores?.totalViagensTransporte);
  const dadosTransporteDisponiveis = Boolean(transporte?.indicadores?.dadosTransporteDisponiveis);
  const totalParteDiaria = toNumber(frota?.indicadores?.totalParteDiaria);
  const veiculosAtivos = toNumber(frota?.indicadores?.veiculosAtivos);
  const veiculosOciosos = toNumber(frota?.indicadores?.veiculosOciosos);
  const veiculosConsiderados = toNumber(combustivel?.indicadores?.veiculosConsiderados);

  const operacaoParada = dadosTransporteDisponiveis && totalViagensTransporte === 0 && totalLitrosTransporte > 0;
  const consumoSemProducao = dadosTransporteDisponiveis && totalLitrosTransporte > 0 && totalViagensTransporte === 0;

  return {
    indicadores: {
      totalLitros,
      totalLitrosTransporte,
      totalValor,
      totalValorTransporte,
      precoMedio,
      totalViagens,
      totalViagensTransporte,
      totalParteDiaria,
      veiculosAtivos,
      veiculosOciosos,
      veiculosConsiderados,
      dadosTransporteDisponiveis,
    },
    insights: {
      operacaoParada,
      consumoSemProducao,
      analiseProducaoIgnorada: !dadosTransporteDisponiveis,
      veiculosOciosos: frota?.insights?.veiculosOciosos || [],
      veiculoDestaque: combustivel?.insights?.veiculoDestaque || null,
    },
  };
};

module.exports = {
  gerarResumoExecutivo,
};
