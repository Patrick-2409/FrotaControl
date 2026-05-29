const { toNumber } = require("./inteligencia/common");

const SEVERIDADE = {
  CRITICA: "CRITICA",
  ALTA: "ALTA",
  MEDIA: "MEDIA",
  BAIXA: "BAIXA",
};

const MOTOR = {
  M01: "M01_CONCENTRACAO",
  M02: "M02_PRODUCAO_SEM_CONSUMO",
  M03: "M03_CONSUMO_SEM_PRODUCAO",
  M04: "M04_CRESCIMENTO_CUSTO",
  M05: "M05_SUBUTILIZACAO_FROTA",
  M06: "M06_QUALIDADE_DADOS",
  M07: "M07_SCORE_OPERACIONAL",
  M08: "M08_SCORE_FINANCEIRO",
  M09: "M09_SCORE_GERAL",
};

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const round1 = (value) => Math.round(toNumber(value, 0) * 10) / 10;

const classifyScore = (score) => {
  const valor = clamp(Math.round(score));
  if (valor >= 90) return { valor, faixa: "Excelente", classificacao: "EXCELENTE" };
  if (valor >= 70) return { valor, faixa: "Boa", classificacao: "BOA" };
  if (valor >= 50) return { valor, faixa: "Atenção", classificacao: "ATENCAO" };
  return { valor, faixa: "Crítica", classificacao: "CRITICA" };
};

const buildInsight = ({ motor, titulo, severidade, diagnostico, impacto, recomendacao, evidencias = {} }) => ({
  motor,
  titulo,
  severidade,
  diagnostico,
  impacto,
  recomendacao,
  evidencias,
});

const resolveLitros = (item) => toNumber(item?.litros ?? item?.consumo ?? item?.totalLitros);
const resolveViagens = (item) => toNumber(item?.viagens ?? item?.totalViagens);
const resolveNomeVeiculo = (item) => item?.nome || item?.veiculo || "Veículo";

const motor01ConcentracaoOperacional = ({ consumoPorVeiculo = [], totalLitros = 0 }) => {
  const insights = [];
  const total = totalLitros > 0 ? totalLitros : consumoPorVeiculo.reduce((acc, item) => acc + resolveLitros(item), 0);
  if (total <= 0 || !consumoPorVeiculo.length) return insights;

  const ranked = [...consumoPorVeiculo]
    .map((item) => ({
      nome: resolveNomeVeiculo(item),
      litros: resolveLitros(item),
      participacao: total > 0 ? (resolveLitros(item) / total) * 100 : 0,
    }))
    .sort((a, b) => b.litros - a.litros);

  const dominante = ranked[0];
  if (!dominante || dominante.participacao <= 50) return insights;

  insights.push(
    buildInsight({
      motor: MOTOR.M01,
      titulo: "Concentração operacional",
      severidade: dominante.participacao >= 70 ? SEVERIDADE.ALTA : SEVERIDADE.MEDIA,
      diagnostico: `Existe concentração operacional relevante em um único ativo: ${dominante.nome} responde por ${round1(dominante.participacao)}% do consumo (${round1(dominante.litros)} L).`,
      impacto: "A indisponibilidade deste veículo pode comprometer parte significativa da operação.",
      recomendacao: "Avaliar redistribuição de atividades para reduzir dependência operacional.",
      evidencias: {
        veiculo: dominante.nome,
        participacao_pct: round1(dominante.participacao),
        litros: round1(dominante.litros),
        total_litros: round1(total),
      },
    })
  );

  return insights;
};

const motor02ProducaoSemConsumo = ({ veiculosTransporte = [], totalViagens = 0, totalLitrosTransporte = 0 }) => {
  const insights = [];
  const casos = veiculosTransporte.filter((item) => resolveViagens(item) > 0 && resolveLitros(item) === 0);
  const viagensSemConsumo = casos.reduce((acc, item) => acc + resolveViagens(item), 0);
  const ativo = totalViagens > 0 && totalLitrosTransporte === 0;

  if (!ativo && !casos.length) return insights;

  const totalViagensAfetadas = viagensSemConsumo || totalViagens;
  const exemplo = casos[0];
  const detalheVeiculo = exemplo
    ? `${resolveNomeVeiculo(exemplo)} (${resolveViagens(exemplo)} viagem(ns) sem abastecimento)`
    : null;

  insights.push(
    buildInsight({
      motor: MOTOR.M02,
      titulo: "Produção sem consumo",
      severidade: SEVERIDADE.CRITICA,
      diagnostico: detalheVeiculo
        ? `Foram registradas ${totalViagensAfetadas} viagem(ns) sem abastecimento correspondente (${detalheVeiculo}).`
        : `Foram registradas ${totalViagensAfetadas} viagem(ns) de transporte sem abastecimento correspondente no período.`,
      impacto: "Indicadores de eficiência tornam-se inválidos.",
      recomendacao: detalheVeiculo
        ? `Auditar imediatamente os lançamentos de combustível do veículo ${resolveNomeVeiculo(exemplo)}.`
        : "Auditar lançamentos de combustível e integrações.",
      evidencias: {
        viagens_sem_consumo: totalViagensAfetadas,
        veiculos_afetados: casos.length || (ativo ? 1 : 0),
        veiculo_exemplo: exemplo ? resolveNomeVeiculo(exemplo) : null,
      },
    })
  );

  return insights;
};

const motor03ConsumoSemProducao = ({ veiculosTransporte = [], totalViagens = 0, totalLitrosTransporte = 0 }) => {
  const insights = [];
  const casos = veiculosTransporte.filter((item) => resolveLitros(item) > 0 && resolveViagens(item) === 0);
  const ativo = totalLitrosTransporte > 0 && totalViagens === 0;

  if (!ativo && !casos.length) return insights;

  const litrosSemProducao = casos.reduce((acc, item) => acc + resolveLitros(item), 0) || totalLitrosTransporte;
  const exemplo = casos[0];

  insights.push(
    buildInsight({
      motor: MOTOR.M03,
      titulo: "Consumo sem produção",
      severidade: SEVERIDADE.ALTA,
      diagnostico: exemplo
        ? `Foram registrados ${round1(litrosSemProducao)} L de abastecimento em ${resolveNomeVeiculo(exemplo)} sem viagens correspondentes.`
        : `Foram registrados ${round1(litrosSemProducao)} L de abastecimento de transporte sem viagens no período.`,
      impacto: "Possível ociosidade ou inconsistência de lançamento.",
      recomendacao: exemplo
        ? `Verificar utilização real do ativo ${resolveNomeVeiculo(exemplo)} e conferir classificação operacional.`
        : "Verificar utilização real dos ativos de transporte e conferir lançamentos.",
      evidencias: {
        litros_sem_producao: round1(litrosSemProducao),
        veiculos_afetados: casos.length || (ativo ? 1 : 0),
        veiculo_exemplo: exemplo ? resolveNomeVeiculo(exemplo) : null,
      },
    })
  );

  return insights;
};

const motor04CrescimentoCusto = ({ custoPorPeriodo = [] }) => {
  const insights = [];
  const serie = (Array.isArray(custoPorPeriodo) ? custoPorPeriodo : [])
    .map((item) => ({
      periodo: item?.periodo || null,
      custo: toNumber(item?.custo),
    }))
    .filter((item) => item.custo >= 0);

  if (serie.length < 3) return insights;

  const mediaPeriodo = serie.reduce((acc, item) => acc + item.custo, 0) / serie.length;
  if (mediaPeriodo <= 0) return insights;

  const ultimos = serie.slice(-Math.min(3, Math.max(1, Math.floor(serie.length / 3))));
  const mediaRecente = ultimos.reduce((acc, item) => acc + item.custo, 0) / ultimos.length;
  const crescimentoPct = ((mediaRecente - mediaPeriodo) / mediaPeriodo) * 100;

  if (crescimentoPct <= 15) return insights;

  insights.push(
    buildInsight({
      motor: MOTOR.M04,
      titulo: "Crescimento de custo",
      severidade: crescimentoPct >= 30 ? SEVERIDADE.ALTA : SEVERIDADE.MEDIA,
      diagnostico: `Foi observada elevação de ${round1(crescimentoPct)}% no custo operacional recente (média recente ${mediaRecente.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} vs média do período ${mediaPeriodo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`,
      impacto: "Possível redução de margem operacional.",
      recomendacao: "Investigar eventos extraordinários ou aumento de consumo nos últimos dias do período.",
      evidencias: {
        crescimento_pct: round1(crescimentoPct),
        media_recente: round1(mediaRecente),
        media_periodo: round1(mediaPeriodo),
        dias_analisados: ultimos.length,
      },
    })
  );

  return insights;
};

const motor05SubutilizacaoFrota = ({ totalVeiculos = 0, veiculosAtivos = 0, veiculosOciosos = 0 }) => {
  const insights = [];
  if (totalVeiculos <= 0) return insights;

  const ociosos = veiculosOciosos > 0 ? veiculosOciosos : Math.max(totalVeiculos - veiculosAtivos, 0);
  if (ociosos <= 0) return insights;

  const taxaOciosidade = (ociosos / totalVeiculos) * 100;

  insights.push(
    buildInsight({
      motor: MOTOR.M05,
      titulo: "Subutilização de frota",
      severidade: taxaOciosidade >= 50 ? SEVERIDADE.ALTA : SEVERIDADE.MEDIA,
      diagnostico: `Parte da frota permanece sem utilização: ${ociosos} de ${totalVeiculos} veículo(s) no escopo (${round1(taxaOciosidade)}% ociosos).`,
      impacto: "Ativos imobilizados gerando custo sem retorno operacional.",
      recomendacao: "Reavaliar distribuição dos recursos entre transporte, apoio e manutenção.",
      evidencias: {
        total_veiculos: totalVeiculos,
        veiculos_ativos: veiculosAtivos,
        veiculos_ociosos: ociosos,
        taxa_ociosidade_pct: round1(taxaOciosidade),
      },
    })
  );

  return insights;
};

const calcularScoreQualidadeDados = ({
  inconsistencias = [],
  inconsistenciasDetalhadas = [],
  indicadores = {},
  validacao = {},
}) => {
  let score = 100;
  const criticos = inconsistenciasDetalhadas.filter((item) => item.tipo === "ERRO_CRITICO").length;
  const alertas = inconsistenciasDetalhadas.filter((item) => item.tipo === "ALERTA").length;

  score -= criticos * 25;
  score -= alertas * 12;
  score -= Math.min(inconsistencias.length * 8, 40);

  if (validacao.producaoSemConsumo) score -= 20;
  if (validacao.consumoSemProducao) score -= 12;

  const litros = toNumber(indicadores.totalLitros);
  const valor = toNumber(indicadores.totalValor);
  const viagens = toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens);
  const frota = toNumber(indicadores.totalVeiculosEscopo);

  if (frota > 0 && litros === 0 && viagens === 0) score -= 25;
  if (litros > 0 && valor === 0) score -= 15;
  if (litros === 0 && valor > 0) score -= 15;

  return clamp(score);
};

const motor06QualidadeDados = (ctx) => {
  const valor = calcularScoreQualidadeDados(ctx);
  const classificacao = classifyScore(valor);
  const problemas = ctx.inconsistencias?.length || 0;
  const criticos = (ctx.inconsistenciasDetalhadas || []).filter((item) => item.tipo === "ERRO_CRITICO").length;

  let severidade = SEVERIDADE.BAIXA;
  if (valor < 50) severidade = SEVERIDADE.CRITICA;
  else if (valor < 70) severidade = SEVERIDADE.ALTA;
  else if (valor < 90) severidade = SEVERIDADE.MEDIA;

  return {
    score: classificacao,
    insight: buildInsight({
      motor: MOTOR.M06,
      titulo: "Qualidade dos dados",
      severidade,
      diagnostico:
        problemas > 0
          ? `Foram identificadas ${problemas} inconsistência(s) nos lançamentos${criticos ? `, incluindo ${criticos} erro(s) crítico(s)` : ""}. Score de confiabilidade: ${valor}/100 (${classificacao.faixa}).`
          : `Lançamentos coerentes no recorte analisado. Score de confiabilidade: ${valor}/100 (${classificacao.faixa}).`,
      impacto:
        valor < 70
          ? "Decisões baseadas em indicadores podem estar comprometidas pela qualidade dos dados."
          : "Dados suficientemente confiáveis para leitura executiva do período.",
      recomendacao:
        valor < 70
          ? "Priorizar correção de inconsistências antes de comparativos de eficiência ou custo."
          : "Manter rotina de conferência de lançamentos para preservar a confiabilidade.",
      evidencias: {
        score: valor,
        inconsistencias: problemas,
        erros_criticos: criticos,
      },
    }),
  };
};

const calcularScoreOperacional = ({
  indicadores = {},
  validacao = {},
  custoPorPeriodo = [],
  totalVeiculos = 0,
  veiculosAtivos = 0,
}) => {
  let score = 100;

  const viagens = toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens);
  const parteDiaria = toNumber(indicadores.totalParteDiaria);
  const produtividade = viagens + parteDiaria;
  if (produtividade === 0 && totalVeiculos > 0) score -= 35;
  else if (produtividade <= 2) score -= 15;

  if (totalVeiculos > 0) {
    const utilizacao = veiculosAtivos / totalVeiculos;
    score -= (1 - utilizacao) * 35;
  }

  const diasComDados = (custoPorPeriodo || []).filter((item) => toNumber(item?.custo) > 0).length;
  if (diasComDados <= 1) score -= 10;
  else if (diasComDados <= 3) score -= 5;

  if (validacao.producaoSemConsumo) score -= 25;
  if (validacao.consumoSemProducao) score -= 15;
  if ((validacao.inconsistenciasDetalhadas || []).some((item) => item.tipo === "ERRO_CRITICO")) score -= 20;

  return clamp(score);
};

const calcularScoreFinanceiro = ({
  indicadores = {},
  consumoPorVeiculo = [],
  custoPorPeriodo = [],
  validacao = {},
}) => {
  let score = 100;
  const totalLitros = toNumber(indicadores.totalLitros);
  const totalValor = toNumber(indicadores.totalValor);

  if (totalValor <= 0 && totalLitros > 0) score -= 20;

  const serie = (custoPorPeriodo || []).map((item) => toNumber(item?.custo)).filter((v) => v >= 0);
  if (serie.length >= 3) {
    const media = serie.reduce((a, b) => a + b, 0) / serie.length;
    const variacao =
      media > 0
        ? Math.sqrt(serie.reduce((acc, value) => acc + (value - media) ** 2, 0) / serie.length) / media
        : 0;
    score -= Math.min(variacao * 40, 25);
  }

  if (totalLitros > 0 && consumoPorVeiculo.length) {
    const maxLitros = Math.max(...consumoPorVeiculo.map((item) => resolveLitros(item)));
    const concentracao = (maxLitros / totalLitros) * 100;
    if (concentracao > 50) score -= Math.min((concentracao - 50) * 0.6, 20);
  }

  if (validacao.consumoSemProducao) score -= 12;
  if (toNumber(indicadores.veiculosOciosos) > 0 && totalValor > 0) {
    score -= Math.min(toNumber(indicadores.veiculosOciosos) * 5, 15);
  }

  return clamp(score);
};

const calcularScoreGeral = (operacional, financeiro, confiabilidade) =>
  clamp(Math.round(operacional * 0.4 + financeiro * 0.3 + confiabilidade * 0.3));

const rankSeveridade = (severidade) => {
  const map = { CRITICA: 4, ALTA: 3, MEDIA: 2, BAIXA: 1 };
  return map[severidade] || 0;
};

const gerarNarrativaExecutiva = (insightsCorrelacao = [], validacao = {}) => {
  const ordenados = [...insightsCorrelacao].sort((a, b) => rankSeveridade(b.severidade) - rankSeveridade(a.severidade));
  const principal = ordenados[0];

  if (!principal) {
    return {
      o_que_aconteceu: validacao.problemas?.length
        ? validacao.problemas[0]
        : "Nenhum desvio operacional relevante foi correlacionado no período analisado.",
      por_que_importa: "A operação apresenta indicadores coerentes para leitura executiva no recorte selecionado.",
      acao_prioritaria: "Manter monitoramento periódico e continuidade dos lançamentos operacionais.",
    };
  }

  return {
    o_que_aconteceu: principal.diagnostico,
    por_que_importa: principal.impacto,
    acao_prioritaria: principal.recomendacao,
  };
};

const runIntelligenceEngine = (analysis = {}, normalized = {}, validacao = {}) => {
  const indicadores = normalized.indicadores || analysis.indicadores || {};
  const consumoPorVeiculo =
    normalized.combustivel?.graficos?.consumoPorVeiculo ||
    normalized.combustivel?.veiculos ||
    analysis.graficos?.consumoPorVeiculo ||
    [];
  const custoPorPeriodo =
    normalized.combustivel?.graficos?.custoPorPeriodo || analysis.graficos?.custoPorPeriodo || [];
  const veiculosTransporte = normalized.transporte?.veiculos || [];
  const totalViagens = toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens);
  const totalLitrosTransporte = toNumber(indicadores.totalLitrosTransporte);
  const totalVeiculos = toNumber(indicadores.totalVeiculosEscopo) || toNumber(indicadores.veiculosConsiderados);
  const veiculosAtivos = toNumber(indicadores.veiculosAtivos);
  const veiculosOciosos = toNumber(indicadores.veiculosOciosos);
  const totalLitros = toNumber(indicadores.totalLitros);

  const ctxQualidade = {
    inconsistencias: validacao.problemas || normalized.inconsistenciasGlobais || [],
    inconsistenciasDetalhadas: validacao.inconsistenciasDetalhadas || normalized.inconsistenciasDetalhadas || [],
    indicadores,
    validacao,
  };

  const correlacao = [
    ...motor01ConcentracaoOperacional({ consumoPorVeiculo, totalLitros }),
    ...motor02ProducaoSemConsumo({ veiculosTransporte, totalViagens, totalLitrosTransporte }),
    ...motor03ConsumoSemProducao({ veiculosTransporte, totalViagens, totalLitrosTransporte }),
    ...motor04CrescimentoCusto({ custoPorPeriodo }),
    ...motor05SubutilizacaoFrota({ totalVeiculos, veiculosAtivos, veiculosOciosos }),
  ];

  const m06 = motor06QualidadeDados(ctxQualidade);
  const scoreOperacionalValor = calcularScoreOperacional({
    indicadores,
    validacao,
    custoPorPeriodo,
    totalVeiculos,
    veiculosAtivos,
  });
  const scoreFinanceiroValor = calcularScoreFinanceiro({
    indicadores,
    consumoPorVeiculo,
    custoPorPeriodo,
    validacao,
  });
  const scoreConfiabilidadeValor = m06.score.valor;
  const scoreGeralValor = calcularScoreGeral(scoreOperacionalValor, scoreFinanceiroValor, scoreConfiabilidadeValor);

  const painel_executivo = {
    score_geral: classifyScore(scoreGeralValor),
    score_operacional: classifyScore(scoreOperacionalValor),
    score_financeiro: classifyScore(scoreFinanceiroValor),
    score_confiabilidade: m06.score,
  };

  const motores = {
    correlacao,
    qualidade_dados: m06.insight,
    scores: {
      operacional: painel_executivo.score_operacional,
      financeiro: painel_executivo.score_financeiro,
      confiabilidade: painel_executivo.score_confiabilidade,
      geral: painel_executivo.score_geral,
    },
  };

  const narrativa_executiva = gerarNarrativaExecutiva(correlacao, validacao);

  const recomendacoes = [...correlacao, m06.insight]
    .sort((a, b) => rankSeveridade(b.severidade) - rankSeveridade(a.severidade))
    .map((item) => item.recomendacao)
    .filter(Boolean);

  const insightsCompat = [...correlacao, m06.insight].map((item) => ({
    tipo: item.motor,
    titulo: item.titulo,
    severidade: item.severidade,
    mensagem: item.diagnostico,
    diagnostico: item.diagnostico,
    impacto: item.impacto,
    recomendacao: item.recomendacao,
    evidencias: item.evidencias,
  }));

  return {
    origem: "motor_mio",
    motores,
    painel_executivo,
    narrativa_executiva,
    insights_correlacao: correlacao,
    recomendacoes_mio: [...new Set(recomendacoes)],
    insights_compat: insightsCompat,
  };
};

module.exports = {
  SEVERIDADE,
  MOTOR,
  classifyScore,
  runIntelligenceEngine,
  motor01ConcentracaoOperacional,
  motor02ProducaoSemConsumo,
  motor03ConsumoSemProducao,
  motor04CrescimentoCusto,
  motor05SubutilizacaoFrota,
  calcularScoreQualidadeDados,
  calcularScoreOperacional,
  calcularScoreFinanceiro,
  calcularScoreGeral,
};
