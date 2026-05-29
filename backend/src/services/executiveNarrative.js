const { toNumber } = require("./inteligencia/common");

const MOTOR_SCORE_MAP = {
  M01_CONCENTRACAO: "score_financeiro",
  M02_PRODUCAO_SEM_CONSUMO: "score_operacional",
  M03_CONSUMO_SEM_PRODUCAO: "score_operacional",
  M04_CRESCIMENTO_CUSTO: "score_financeiro",
  M05_SUBUTILIZACAO_FROTA: "score_operacional",
  M06_QUALIDADE_DADOS: "score_confiabilidade",
};

const fmtMoney = (value) =>
  toNumber(value, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtNum = (value, digits = 0) =>
  toNumber(value, 0).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const resolveLitros = (item) => toNumber(item?.litros ?? item?.consumo ?? item?.totalLitros);
const resolveViagens = (item) => toNumber(item?.viagens ?? item?.totalViagens);
const resolveNomeVeiculo = (item) => item?.nome || item?.veiculo || "Veículo";

const uniqueLines = (items = []) =>
  [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];

const bundle = (positivas, negativas) => ({
  positivas: uniqueLines(positivas).slice(0, 4),
  negativas: uniqueLines(negativas).slice(0, 4),
});

const appendInsightLines = (target, insights = [], tipo = "negativas") => {
  insights.forEach((insight) => {
    const line = insight?.diagnostico || insight?.mensagem;
    if (line) target[tipo].push(line);
  });
};

const buildOperacionalNarrative = ({
  indicadores = {},
  validacao = {},
  custoPorPeriodo = [],
  insightsCorrelacao = [],
} = {}) => {
  const positivas = [];
  const negativas = [];

  const viagens = toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens);
  const parteDiaria = toNumber(indicadores.totalParteDiaria);
  const produtividade = viagens + parteDiaria;
  const totalVeiculos = toNumber(indicadores.totalVeiculosEscopo) || toNumber(indicadores.veiculosConsiderados);
  const veiculosAtivos = toNumber(indicadores.veiculosAtivos);
  const veiculosOciosos = toNumber(indicadores.veiculosOciosos);

  if (produtividade > 2) {
    positivas.push(
      `${fmtNum(viagens)} viagem(ns) de transporte e ${fmtNum(parteDiaria)} registro(s) de parte diária no período.`
    );
  } else if (produtividade > 0) {
    positivas.push(`Movimentação operacional registrada (${fmtNum(produtividade)} evento(s) no recorte).`);
  } else if (totalVeiculos > 0) {
    negativas.push("Nenhuma viagem de transporte nem parte diária registrada no período analisado.");
  }

  if (totalVeiculos > 0) {
    const taxa = Math.round((veiculosAtivos / totalVeiculos) * 100);
    if (taxa >= 70) {
      positivas.push(`${fmtNum(veiculosAtivos)} de ${fmtNum(totalVeiculos)} veículo(s) ativos (${taxa}% da frota).`);
    } else if (veiculosAtivos > 0) {
      negativas.push(
        `Utilização da frota em ${taxa}% — ${fmtNum(veiculosAtivos)} ativo(s) e ${fmtNum(veiculosOciosos || totalVeiculos - veiculosAtivos)} ocioso(s).`
      );
    } else {
      negativas.push(`Nenhum veículo ativo entre ${fmtNum(totalVeiculos)} no escopo.`);
    }
  }

  const diasComDados = (custoPorPeriodo || []).filter((item) => toNumber(item?.custo) > 0).length;
  if (diasComDados > 3) {
    positivas.push(`${fmtNum(diasComDados)} dia(s) com custo de combustível lançado — cobertura temporal adequada.`);
  } else if (diasComDados > 0) {
    negativas.push(`Apenas ${fmtNum(diasComDados)} dia(s) com custo registrado — histórico curto para leitura operacional.`);
  }

  if (!validacao.producaoSemConsumo) {
    positivas.push("Produção de transporte com consumo coerente (sem viagens órfãs).");
  } else {
    negativas.push("Produção registrada sem abastecimento correspondente — inconsistência operacional crítica.");
  }

  if (!validacao.consumoSemProducao) {
    positivas.push("Consumo de transporte acompanhado de produção registrada.");
  } else {
    negativas.push("Abastecimentos de transporte sem viagens correspondentes no período.");
  }

  const criticos = (validacao.inconsistenciasDetalhadas || []).filter((item) => item.tipo === "ERRO_CRITICO").length;
  if (criticos === 0) {
    positivas.push("Sem erros críticos de consistência nos lançamentos operacionais.");
  } else {
    negativas.push(`${fmtNum(criticos)} erro(s) crítico(s) de consistência detectado(s) nos veículos.`);
  }

  appendInsightLines(
    { negativas },
    insightsCorrelacao.filter((item) =>
      ["M02_PRODUCAO_SEM_CONSUMO", "M03_CONSUMO_SEM_PRODUCAO", "M05_SUBUTILIZACAO_FROTA"].includes(item.motor)
    )
  );

  return bundle(positivas, negativas);
};

const buildFinanceiroNarrative = ({
  indicadores = {},
  validacao = {},
  consumoPorVeiculo = [],
  custoPorPeriodo = [],
  insightsCorrelacao = [],
} = {}) => {
  const positivas = [];
  const negativas = [];

  const totalLitros = toNumber(indicadores.totalLitros);
  const totalValor = toNumber(indicadores.totalValor);
  const veiculosOciosos = toNumber(indicadores.veiculosOciosos);

  if (totalValor > 0) {
    positivas.push(`Custo total registrado: ${fmtMoney(totalValor)} no período (${fmtNum(totalLitros, 1)} L abastecidos).`);
  } else if (totalLitros > 0) {
    negativas.push(`${fmtNum(totalLitros, 1)} L abastecidos sem valor financeiro associado nos lançamentos.`);
  } else {
    negativas.push("Sem custo de combustível registrado no recorte analisado.");
  }

  const serie = (custoPorPeriodo || []).map((item) => toNumber(item?.custo)).filter((value) => value >= 0);
  if (serie.length >= 3) {
    const media = serie.reduce((acc, value) => acc + value, 0) / serie.length;
    const variacao =
      media > 0
        ? Math.sqrt(serie.reduce((acc, value) => acc + (value - media) ** 2, 0) / serie.length) / media
        : 0;
    const variacaoPct = Math.round(variacao * 100);
    if (variacaoPct <= 25) {
      positivas.push(`Custo diário estável — variação de ${variacaoPct}% em relação à média (${fmtMoney(media)}/dia).`);
    } else {
      negativas.push(
        `Alta volatilidade de custo (${variacaoPct}% sobre a média de ${fmtMoney(media)} por dia no período).`
      );
    }
  }

  if (totalLitros > 0 && consumoPorVeiculo.length) {
    const ranked = [...consumoPorVeiculo]
      .map((item) => ({ nome: resolveNomeVeiculo(item), litros: resolveLitros(item) }))
      .sort((a, b) => b.litros - a.litros);
    const dominante = ranked[0];
    const participacao = totalLitros > 0 ? (dominante.litros / totalLitros) * 100 : 0;
    if (participacao <= 50) {
      positivas.push(
        `Consumo distribuído entre ${fmtNum(consumoPorVeiculo.length)} veículo(s) — maior participação: ${resolveNomeVeiculo(dominante)} (${fmtNum(participacao, 1)}%).`
      );
    } else {
      negativas.push(
        `${resolveNomeVeiculo(dominante)} concentra ${fmtNum(participacao, 1)}% do consumo (${fmtNum(dominante.litros, 1)} L de ${fmtNum(totalLitros, 1)} L).`
      );
    }
  }

  if (!validacao.consumoSemProducao) {
    positivas.push("Sem consumo de transporte desvinculado de produção — leitura financeira mais confiável.");
  } else {
    negativas.push("Consumo sem produção distorce a relação custo × utilização dos ativos.");
  }

  if (veiculosOciosos > 0 && totalValor > 0) {
    negativas.push(`${fmtNum(veiculosOciosos)} veículo(s) ocioso(s) com custo de ${fmtMoney(totalValor)} no período.`);
  } else if (veiculosOciosos === 0 && totalVeiculosEscopo(indicadores) > 0) {
    positivas.push("Frota sem veículos ociosos identificados — custo alinhado à movimentação.");
  }

  appendInsightLines(
    { negativas },
    insightsCorrelacao.filter((item) =>
      ["M01_CONCENTRACAO", "M04_CRESCIMENTO_CUSTO"].includes(item.motor)
    )
  );

  return bundle(positivas, negativas);
};

const totalVeiculosEscopo = (indicadores = {}) =>
  toNumber(indicadores.totalVeiculosEscopo) || toNumber(indicadores.veiculosConsiderados);

const buildConfiabilidadeNarrative = ({
  indicadores = {},
  validacao = {},
  qualidadeInsight = null,
  insightsCorrelacao = [],
} = {}) => {
  const positivas = [];
  const negativas = [];

  const problemas = (validacao.problemas || []).length;
  const criticos = (validacao.inconsistenciasDetalhadas || []).filter((item) => item.tipo === "ERRO_CRITICO").length;
  const alertas = (validacao.inconsistenciasDetalhadas || []).filter((item) => item.tipo === "ALERTA").length;

  if (problemas === 0) {
    positivas.push("Nenhuma inconsistência textual registrada pelo motor de validação.");
  } else {
    negativas.push(`${fmtNum(problemas)} inconsistência(s) identificada(s) nos lançamentos do período.`);
  }

  if (criticos === 0) {
    positivas.push("Sem erros críticos de integridade entre produção e consumo.");
  } else {
    negativas.push(`${fmtNum(criticos)} erro(s) crítico(s) exigem correção antes de decisões baseadas em KPIs.`);
  }

  if (alertas > 0) {
    negativas.push(`${fmtNum(alertas)} alerta(s) de consistência reforçam cautela na interpretação dos dados.`);
  } else if (problemas === 0) {
    positivas.push("Nenhum alerta de consistência pendente no recorte.");
  }

  const litros = toNumber(indicadores.totalLitros);
  const valor = toNumber(indicadores.totalValor);
  const viagens = toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens);
  const frota = totalVeiculosEscopo(indicadores);

  if (litros > 0 && valor > 0) {
    positivas.push(`Base financeira coerente: ${fmtNum(litros, 1)} L com ${fmtMoney(valor)} registrados.`);
  }
  if (litros > 0 && valor === 0) {
    negativas.push(`${fmtNum(litros, 1)} L abastecidos sem valor financeiro — lacuna nos lançamentos.`);
  }
  if (valor > 0 && litros === 0) {
    negativas.push(`${fmtMoney(valor)} registrados sem litros associados — inconsistência de abastecimento.`);
  }
  if (frota > 0 && litros === 0 && viagens === 0) {
    negativas.push(`Frota de ${fmtNum(frota)} veículo(s) sem litros nem viagens no período — base insuficiente.`);
  }

  if (qualidadeInsight?.diagnostico) {
    const target = qualidadeInsight.severidade === "BAIXA" ? positivas : negativas;
    target.push(qualidadeInsight.diagnostico);
  }

  appendInsightLines(
    { negativas },
    insightsCorrelacao.filter((item) => item.motor === "M06_QUALIDADE_DADOS")
  );

  return bundle(positivas, negativas);
};

const buildGeralNarrative = ({ painelExecutivo = {} } = {}) => {
  const positivas = [];
  const negativas = [];

  const operacional = painelExecutivo.score_operacional?.valor;
  const financeiro = painelExecutivo.score_financeiro?.valor;
  const confiabilidade = painelExecutivo.score_confiabilidade?.valor;
  const geral = painelExecutivo.score_geral;

  if (operacional >= 70) {
    positivas.push(`Operacional ${operacional}/100 (${painelExecutivo.score_operacional?.faixa}) — peso de 40% na composição.`);
  } else if (Number.isFinite(operacional)) {
    negativas.push(`Operacional ${operacional}/100 (${painelExecutivo.score_operacional?.faixa}) — principal frente de pressão (40%).`);
  }

  if (financeiro >= 70) {
    positivas.push(`Financeiro ${financeiro}/100 (${painelExecutivo.score_financeiro?.faixa}) — contribui com 30% do score.`);
  } else if (Number.isFinite(financeiro)) {
    negativas.push(`Financeiro ${financeiro}/100 (${painelExecutivo.score_financeiro?.faixa}) — limita o resultado composto (30%).`);
  }

  if (confiabilidade >= 70) {
    positivas.push(
      `Confiabilidade ${confiabilidade}/100 (${painelExecutivo.score_confiabilidade?.faixa}) — sustenta a leitura executiva (30%).`
    );
  } else if (Number.isFinite(confiabilidade)) {
    negativas.push(
      `Confiabilidade ${confiabilidade}/100 (${painelExecutivo.score_confiabilidade?.faixa}) — restringe confiança nos indicadores (30%).`
    );
  }

  if (geral?.valor >= 90) {
    positivas.push(`Composição final ${geral.valor}/100 (${geral.faixa}) — equilíbrio entre operação, custo e dados.`);
  } else if (geral?.valor != null && geral.valor < 50) {
    negativas.push(`Composição final ${geral.valor}/100 (${geral.faixa}) — múltiplas frentes exigem intervenção.`);
  }

  return bundle(positivas, negativas);
};

const buildExecutiveScoreNarratives = ({
  painelExecutivo = {},
  indicadores = {},
  validacao = {},
  insightsCorrelacao = [],
  qualidadeInsight = null,
  consumoPorVeiculo = [],
  custoPorPeriodo = [],
} = {}) => {
  const insights = Array.isArray(insightsCorrelacao) ? insightsCorrelacao : [];

  const narrativas = {
    score_geral: buildGeralNarrative({ painelExecutivo }),
    score_operacional: buildOperacionalNarrative({
      indicadores,
      validacao,
      custoPorPeriodo,
      insightsCorrelacao: insights.filter((item) =>
        ["M02_PRODUCAO_SEM_CONSUMO", "M03_CONSUMO_SEM_PRODUCAO", "M05_SUBUTILIZACAO_FROTA"].includes(item.motor)
      ),
    }),
    score_financeiro: buildFinanceiroNarrative({
      indicadores,
      validacao,
      consumoPorVeiculo,
      custoPorPeriodo,
      insightsCorrelacao: insights.filter((item) =>
        ["M01_CONCENTRACAO", "M04_CRESCIMENTO_CUSTO"].includes(item.motor)
      ),
    }),
    score_confiabilidade: buildConfiabilidadeNarrative({
      indicadores,
      validacao,
      qualidadeInsight,
      insightsCorrelacao: insights,
    }),
  };

  return {
    ...narrativas,
    origem: "executive_narrative",
    motores_mapeados: MOTOR_SCORE_MAP,
  };
};

module.exports = {
  MOTOR_SCORE_MAP,
  buildExecutiveScoreNarratives,
  buildGeralNarrative,
  buildOperacionalNarrative,
  buildFinanceiroNarrative,
  buildConfiabilidadeNarrative,
};
