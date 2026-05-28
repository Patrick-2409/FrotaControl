const { toNumber } = require("./common");
const {
  detectContextoTeste,
  MENSAGEM_CONTEXTO_TESTE,
  detectInconsistenciasOperacionais,
  resolveStatusOperacao,
  computeMetricasExecutivas,
} = require("./operacionalRules");

const gerarResumoExecutivo = ({ combustivel, transporte, frota, periodo = "mes" }) => {
  const totalLitros = toNumber(combustivel?.indicadores?.totalLitros);
  const totalLitrosTransporte = toNumber(combustivel?.indicadores?.totalLitrosTransporte);
  const totalLitrosApoio = toNumber(combustivel?.indicadores?.totalLitrosApoio);
  const totalValor = toNumber(combustivel?.indicadores?.totalValor);
  const totalValorTransporte = toNumber(combustivel?.indicadores?.totalValorTransporte);
  const totalValorApoio = toNumber(combustivel?.indicadores?.totalValorApoio);
  const precoMedio = toNumber(combustivel?.indicadores?.precoMedio);
  const totalViagens = toNumber(transporte?.indicadores?.totalViagens);
  const totalViagensTransporte = toNumber(transporte?.indicadores?.totalViagensTransporte);
  const dadosTransporteDisponiveis = Boolean(transporte?.indicadores?.dadosTransporteDisponiveis);
  const totalParteDiaria = toNumber(frota?.indicadores?.totalParteDiaria);
  const veiculosAtivos = toNumber(frota?.indicadores?.veiculosAtivos);
  const veiculosOciosos = toNumber(frota?.indicadores?.veiculosOciosos);
  const veiculosAtivosTransporte = toNumber(frota?.indicadores?.veiculosAtivosTransporte);
  const veiculosOciososTransporte = toNumber(frota?.indicadores?.veiculosOciososTransporte);
  const veiculosAtivosApoio = toNumber(frota?.indicadores?.veiculosAtivosApoio);
  const veiculosOciososApoio = toNumber(frota?.indicadores?.veiculosOciososApoio);
  const totalVeiculosTransporte = toNumber(frota?.indicadores?.totalVeiculosTransporte);
  const totalVeiculosApoio = toNumber(frota?.indicadores?.totalVeiculosApoio);
  const totalVeiculosEscopo = toNumber(frota?.indicadores?.totalVeiculosEscopo);
  const veiculosConsiderados = toNumber(combustivel?.indicadores?.veiculosConsiderados);

  const operacaoParada = dadosTransporteDisponiveis && totalViagensTransporte === 0 && totalLitrosTransporte > 0;

  const indicadores = {
    totalLitros,
    totalLitrosTransporte,
    totalLitrosApoio,
    totalValor,
    totalValorTransporte,
    totalValorApoio,
    precoMedio,
    totalViagens,
    totalViagensTransporte,
    totalParteDiaria,
    veiculosAtivos,
    veiculosOciosos,
    veiculosAtivosTransporte,
    veiculosOciososTransporte,
    veiculosAtivosApoio,
    veiculosOciososApoio,
      totalVeiculosTransporte,
      totalVeiculosApoio,
      totalVeiculosEscopo,
      veiculosConsiderados,
    dadosTransporteDisponiveis,
  };

  const { inconsistencias, producaoSemConsumo, consumoSemProducao } = detectInconsistenciasOperacionais({
    indicadores,
    insights: { operacaoParada },
  });

  const contextoTeste = detectContextoTeste({ indicadores, periodo });

  const insights = {
    operacaoParada,
    consumoSemProducao,
    producaoSemConsumo,
    analiseProducaoIgnorada: !dadosTransporteDisponiveis,
    contextoTeste,
    mensagemContextoTeste: contextoTeste ? MENSAGEM_CONTEXTO_TESTE : null,
    inconsistenciasDetectadas: inconsistencias,
    veiculosOciosos: frota?.insights?.veiculosOciosos || [],
    veiculoDestaque: combustivel?.insights?.veiculoDestaque || null,
    regrasOperacao: {
      transporte: "tipo_operacao=transporte — possui produção (viagens)",
      apoio: "tipo_operacao=apoio — NÃO possui produção; não calcular eficiência operacional de produção",
    },
  };

  const metricasExecutivas = computeMetricasExecutivas(indicadores, insights);
  const statusOperacao = resolveStatusOperacao({ indicadores, insights, inconsistencias });

  return {
    indicadores,
    insights: {
      ...insights,
      metricasExecutivas,
    },
    statusOperacao,
    inconsistencias,
    metricasExecutivas,
  };
};

module.exports = {
  gerarResumoExecutivo,
};
