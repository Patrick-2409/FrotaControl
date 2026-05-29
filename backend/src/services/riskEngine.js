const { toNumber } = require("./inteligencia/common");

const PESOS = {
  impactoFinanceiro: 0.3,
  impactoOperacional: 0.3,
  recorrenciaHistorica: 0.2,
  quantidadeOcorrencias: 0.1,
  criticidadeDados: 0.1,
};

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const roundScore = (value) => clamp(Math.round(toNumber(value, 0)));

const classifyRisk = (score) => {
  const valor = roundScore(score);
  if (valor >= 80) return { valor, classificacao: "CRITICO", faixa: "Crítico" };
  if (valor >= 60) return { valor, classificacao: "ALTO", faixa: "Alto" };
  if (valor >= 30) return { valor, classificacao: "MEDIO", faixa: "Médio" };
  return { valor, classificacao: "BAIXO", faixa: "Baixo" };
};

const calcularScoreRisco = (dimensoes = {}) => {
  const score =
    toNumber(dimensoes.impactoFinanceiro) * PESOS.impactoFinanceiro +
    toNumber(dimensoes.impactoOperacional) * PESOS.impactoOperacional +
    toNumber(dimensoes.recorrenciaHistorica) * PESOS.recorrenciaHistorica +
    toNumber(dimensoes.quantidadeOcorrencias) * PESOS.quantidadeOcorrencias +
    toNumber(dimensoes.criticidadeDados) * PESOS.criticidadeDados;

  return classifyRisk(score);
};

const fmtMoney = (value) =>
  toNumber(value, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const resolveLitros = (item) => toNumber(item?.litros ?? item?.consumo ?? item?.totalLitros);
const resolveViagens = (item) => toNumber(item?.viagens ?? item?.totalViagens);
const resolveNomeVeiculo = (item) => item?.nome || item?.veiculo || "Veículo";

const ratioScore = (parte, total, multiplier = 100) => {
  const base = toNumber(total);
  if (base <= 0) return clamp(toNumber(parte) > 0 ? 70 : 0);
  return clamp((toNumber(parte) / base) * multiplier);
};

const buildRiskItem = ({
  id,
  problema,
  dimensoes,
  recomendacao,
  impactoFinanceiroEstimado = 0,
  evidencias = {},
}) => {
  const score = calcularScoreRisco(dimensoes);
  return {
    id,
    problema,
    score: score.valor,
    classificacao: score.classificacao,
    faixa: score.faixa,
    dimensoes: {
      impactoFinanceiro: roundScore(dimensoes.impactoFinanceiro),
      impactoOperacional: roundScore(dimensoes.impactoOperacional),
      recorrenciaHistorica: roundScore(dimensoes.recorrenciaHistorica),
      quantidadeOcorrencias: roundScore(dimensoes.quantidadeOcorrencias),
      criticidadeDados: roundScore(dimensoes.criticidadeDados),
    },
    recomendacao,
    impacto_financeiro_estimado: Math.max(0, toNumber(impactoFinanceiroEstimado)),
    evidencias,
  };
};

const calcularRecorrenciaPorVeiculos = (casos = [], totalVeiculos = 1) => {
  const afetados = casos.length;
  if (afetados <= 0) return 0;
  if (afetados >= 2) return clamp(50 + (afetados / Math.max(totalVeiculos, 1)) * 50);
  return 40;
};

const calcularRecorrenciaPorDias = (custoPorPeriodo = [], limiar = 1.15) => {
  const serie = (custoPorPeriodo || []).map((item) => toNumber(item?.custo)).filter((v) => v >= 0);
  if (serie.length < 3) return 0;
  const media = serie.reduce((a, b) => a + b, 0) / serie.length;
  if (media <= 0) return 0;
  const diasElevados = serie.filter((v) => v > media * limiar).length;
  return clamp((diasElevados / serie.length) * 100);
};

const estimarImpactoFinanceiroPeriodo = (indicadores = {}, fracao = 1) => {
  const totalValor = toNumber(indicadores.totalValor);
  if (totalValor <= 0) return 0;
  return totalValor * clamp(fracao, 0, 1);
};

const estimarImpactoPorLitros = (litros = 0, precoMedio = 0, totalValor = 0, totalLitros = 0) => {
  const pm = toNumber(precoMedio);
  if (litros > 0 && pm > 0) return litros * pm;
  if (totalValor > 0 && litros > 0 && totalLitros > 0) return (litros / totalLitros) * totalValor;
  return 0;
};

const buildRiscosFromInsights = ({
  insights = [],
  indicadores = {},
  veiculosTransporte = [],
  custoPorPeriodo = [],
  scoreConfiabilidade = 100,
}) => {
  const riscos = [];
  const totalValor = toNumber(indicadores.totalValor);
  const totalLitros = toNumber(indicadores.totalLitros);
  const precoMedio = toNumber(indicadores.precoMedio);
  const totalViagens = toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens);
  const totalVeiculos = toNumber(indicadores.totalVeiculosEscopo) || veiculosTransporte.length;

  insights.forEach((insight, index) => {
    const motor = insight.motor || insight.tipo || `INSIGHT_${index}`;
    const evidencias = insight.evidencias || {};

    if (motor.includes("M02") || motor === "PRODUCAO_SEM_CONSUMO") {
      const viagensAfetadas = toNumber(evidencias.viagens_sem_consumo) || totalViagens;
      const veiculosAfetados = toNumber(evidencias.veiculos_afetados) || 1;
      const fracaoFinanceira = totalViagens > 0 ? viagensAfetadas / totalViagens : veiculosAfetados / Math.max(totalVeiculos, 1);
      const impactoFinanceiroValor = estimarImpactoFinanceiroPeriodo(indicadores, Math.max(fracaoFinanceira, 0.35));

      riscos.push(
        buildRiskItem({
          id: motor,
          problema: insight.titulo || "Produção sem consumo",
          dimensoes: {
            impactoFinanceiro: ratioScore(viagensAfetadas, Math.max(totalViagens, viagensAfetadas), 100),
            impactoOperacional: clamp(70 + ratioScore(viagensAfetadas, Math.max(totalViagens, 1), 30)),
            recorrenciaHistorica: Math.max(
              calcularRecorrenciaPorVeiculos(
                veiculosTransporte.filter((v) => resolveViagens(v) > 0 && resolveLitros(v) === 0),
                Math.max(veiculosTransporte.length, 1)
              ),
              ratioScore(viagensAfetadas, Math.max(custoPorPeriodo.length, 7), 85)
            ),
            quantidadeOcorrencias: clamp(viagensAfetadas * 3.7),
            criticidadeDados: clamp(100 - scoreConfiabilidade + 20),
          },
          recomendacao: insight.recomendacao,
          impactoFinanceiroEstimado: impactoFinanceiroValor,
          evidencias: { ...evidencias, viagens_sem_consumo: viagensAfetadas, impacto_financeiro: impactoFinanceiroValor },
        })
      );
      return;
    }

    if (motor.includes("M03") || motor === "CONSUMO_SEM_PRODUCAO") {
      const litrosAfetados = toNumber(evidencias.litros_sem_producao) || toNumber(indicadores.totalLitrosTransporte);
      const impactoFinanceiroValor =
        precoMedio > 0 ? litrosAfetados * precoMedio : estimarImpactoFinanceiroPeriodo(indicadores, litrosAfetados / Math.max(totalLitros, 1));

      riscos.push(
        buildRiskItem({
          id: motor,
          problema: insight.titulo || "Consumo sem produção",
          dimensoes: {
            impactoFinanceiro: ratioScore(litrosAfetados, Math.max(totalLitros, litrosAfetados), 100),
            impactoOperacional: clamp(55 + ratioScore(litrosAfetados, Math.max(totalLitros, 1), 45)),
            recorrenciaHistorica: calcularRecorrenciaPorVeiculos(
              veiculosTransporte.filter((v) => resolveLitros(v) > 0 && resolveViagens(v) === 0),
              Math.max(veiculosTransporte.length, 1)
            ),
            quantidadeOcorrencias: clamp(litrosAfetados / Math.max(totalLitros / 100, 1)),
            criticidadeDados: clamp(85 - scoreConfiabilidade * 0.3),
          },
          recomendacao: insight.recomendacao,
          impactoFinanceiroEstimado: impactoFinanceiroValor,
          evidencias: { ...evidencias, litros_sem_producao: litrosAfetados, impacto_financeiro: impactoFinanceiroValor },
        })
      );
      return;
    }

    if (motor.includes("M01") || motor === "CONCENTRACAO") {
      const participacao = toNumber(evidencias.participacao_pct);
      const litrosDominante = toNumber(evidencias.litros);
      const impactoFinanceiroValor = estimarImpactoFinanceiroPeriodo(indicadores, participacao / 100);

      riscos.push(
        buildRiskItem({
          id: motor,
          problema: `${insight.titulo || "Concentração operacional"} — ${evidencias.veiculo || "veículo dominante"}`,
          dimensoes: {
            impactoFinanceiro: clamp(participacao),
            impactoOperacional: clamp(participacao * 0.85),
            recorrenciaHistorica: participacao >= 55 ? 55 : 35,
            quantidadeOcorrencias: clamp(litrosDominante / Math.max(totalLitros / 100, 1)),
            criticidadeDados: clamp(100 - scoreConfiabilidade),
          },
          recomendacao: insight.recomendacao,
          impactoFinanceiroEstimado: impactoFinanceiroValor,
          evidencias: { ...evidencias, impacto_financeiro: impactoFinanceiroValor },
        })
      );
      return;
    }

    if (motor.includes("M04")) {
      const crescimento = toNumber(evidencias.crescimento_pct);
      const impactoFinanceiroValor = toNumber(evidencias.media_recente) - toNumber(evidencias.media_periodo);

      riscos.push(
        buildRiskItem({
          id: motor,
          problema: insight.titulo || "Crescimento de custo",
          dimensoes: {
            impactoFinanceiro: clamp(crescimento * 2),
            impactoOperacional: clamp(crescimento * 1.5),
            recorrenciaHistorica: calcularRecorrenciaPorDias(custoPorPeriodo),
            quantidadeOcorrencias: clamp(toNumber(evidencias.dias_analisados) * 25),
            criticidadeDados: clamp(70 - scoreConfiabilidade * 0.2),
          },
          recomendacao: insight.recomendacao,
          impactoFinanceiroEstimado: Math.max(impactoFinanceiroValor, 0),
          evidencias: { ...evidencias, impacto_financeiro: Math.max(impactoFinanceiroValor, 0) },
        })
      );
      return;
    }

    if (motor.includes("M05")) {
      const ociosos = toNumber(evidencias.veiculos_ociosos);
      const taxa = toNumber(evidencias.taxa_ociosidade_pct);
      const impactoFinanceiroValor = estimarImpactoFinanceiroPeriodo(indicadores, taxa / 100);

      riscos.push(
        buildRiskItem({
          id: motor,
          problema: insight.titulo || "Subutilização de frota",
          dimensoes: {
            impactoFinanceiro: clamp(taxa * 0.7),
            impactoOperacional: clamp(taxa),
            recorrenciaHistorica: ociosos >= 2 ? 50 : 30,
            quantidadeOcorrencias: clamp(ociosos * 20),
            criticidadeDados: clamp(60 - scoreConfiabilidade * 0.15),
          },
          recomendacao: insight.recomendacao,
          impactoFinanceiroEstimado: impactoFinanceiroValor,
          evidencias: { ...evidencias, impacto_financeiro: impactoFinanceiroValor },
        })
      );
      return;
    }

    riscos.push(
      buildRiskItem({
        id: motor,
        problema: insight.titulo || insight.diagnostico || "Risco operacional",
        dimensoes: {
          impactoFinanceiro: 40,
          impactoOperacional: 50,
          recorrenciaHistorica: 30,
          quantidadeOcorrencias: 30,
          criticidadeDados: clamp(100 - scoreConfiabilidade),
        },
        recomendacao: insight.recomendacao,
        impactoFinanceiroEstimado: estimarImpactoFinanceiroPeriodo(indicadores, 0.2),
        evidencias,
      })
    );
  });

  return riscos;
};

const buildRiscosFromInconsistencias = ({
  inconsistenciasDetalhadas = [],
  indicadores = {},
  scoreConfiabilidade = 100,
}) => {
  const totalValor = toNumber(indicadores.totalValor);
  const precoMedio = toNumber(indicadores.precoMedio);

  return inconsistenciasDetalhadas.map((item, index) => {
    const viagens = resolveViagens(item);
    const litros = resolveLitros(item);
    const isCritico = item.tipo === "ERRO_CRITICO";
    const nome = resolveNomeVeiculo(item);

    let problema = item.descricao || formatarInconsistencia(item);
    if (!item.descricao) {
      if (viagens > 0 && litros === 0) {
        problema = `Produção sem consumo — ${nome}: ${viagens} viagem(ns) sem abastecimento`;
      } else if (litros > 0 && viagens === 0) {
        problema = `Consumo sem produção — ${nome}: ${litros.toFixed(1)} L sem viagens`;
      }
    }

    const impactoFinanceiroValor =
      viagens > 0 && litros === 0
        ? estimarImpactoFinanceiroPeriodo(indicadores, viagens / Math.max(toNumber(indicadores.totalViagensTransporte), viagens))
        : litros > 0
          ? litros * (precoMedio || (totalValor / Math.max(toNumber(indicadores.totalLitros), 1)))
          : estimarImpactoFinanceiroPeriodo(indicadores, 0.15);

    return buildRiskItem({
      id: `INC_${item.veiculoId || index}`,
      problema,
      dimensoes: {
        impactoFinanceiro: isCritico ? clamp(ratioScore(viagens || litros, Math.max(viagens, litros, 1), 100)) : 45,
        impactoOperacional: isCritico ? clamp(75 + viagens * 2) : 50,
        recorrenciaHistorica: 35,
        quantidadeOcorrencias: clamp((viagens || litros) * (isCritico ? 3.5 : 2)),
        criticidadeDados: isCritico ? clamp(95 - scoreConfiabilidade * 0.05) : 65,
      },
      recomendacao:
        viagens > 0 && litros === 0
          ? `Auditar imediatamente os lançamentos de combustível do veículo ${nome}.`
          : litros > 0 && viagens === 0
            ? `Verificar utilização real e lançamentos de viagem do veículo ${nome}.`
            : `Revisar lançamentos operacionais do veículo ${nome}.`,
      impactoFinanceiroEstimado: impactoFinanceiroValor,
      evidencias: {
        veiculo: nome,
        placa: item.placa,
        viagens,
        litros,
        tipo: item.tipo,
        impacto_financeiro: impactoFinanceiroValor,
      },
    });
  });
};

const formatarInconsistencia = (item) => {
  const nome = resolveNomeVeiculo(item);
  const viagens = resolveViagens(item);
  const litros = resolveLitros(item);
  if (viagens > 0 && litros === 0) {
    return `${nome}: ${viagens} viagem(ns) sem abastecimento`;
  }
  if (litros > 0 && viagens === 0) {
    return `${nome}: ${litros.toFixed(1)} L sem viagens`;
  }
  return `${nome}: inconsistência operacional`;
};

const deduplicateRiscos = (riscos = []) => {
  const seen = new Set();
  return riscos.filter((item) => {
    const key = `${item.problema}`.toLowerCase().slice(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildMensagemRiscoFinanceiro = (riscoPrincipal, indicadores = {}) => {
  const totalValor = toNumber(indicadores.totalValor);
  const impacto = toNumber(riscoPrincipal?.impacto_financeiro_estimado);

  if (impacto > 0) {
    return `Indicadores comprometidos podem gerar decisões equivocadas sobre ${fmtMoney(impacto)} do período.`;
  }

  if (totalValor > 0) {
    return `Inconsistências detectadas podem distorcer a leitura financeira de ${fmtMoney(totalValor)} registrados no período.`;
  }

  return "Sem base financeira suficiente no período para estimar exposição — priorize regularização dos lançamentos.";
};

const runRiskEngine = ({ analysis = {}, normalized = {}, validacao = {}, mio = {} } = {}) => {
  const indicadores = normalized.indicadores || analysis.indicadores || {};
  const insights = mio.insights_correlacao || [];
  const veiculosTransporte = normalized.transporte?.veiculos || [];
  const custoPorPeriodo =
    normalized.combustivel?.graficos?.custoPorPeriodo || analysis.graficos?.custoPorPeriodo || [];
  const inconsistenciasDetalhadas =
    validacao.inconsistenciasDetalhadas || normalized.inconsistenciasDetalhadas || analysis.inconsistenciasDetalhadas || [];
  const scoreConfiabilidade = toNumber(mio.painel_executivo?.score_confiabilidade?.valor, 100);

  const riscosBrutos = deduplicateRiscos([
    ...buildRiscosFromInsights({
      insights,
      indicadores,
      veiculosTransporte,
      custoPorPeriodo,
      scoreConfiabilidade,
    }),
    ...buildRiscosFromInconsistencias({
      inconsistenciasDetalhadas,
      indicadores,
      scoreConfiabilidade,
    }),
  ]);

  const top_riscos = riscosBrutos
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item, index) => ({
      posicao: index + 1,
      problema: item.problema,
      score: item.score,
      classificacao: item.classificacao,
      faixa: item.faixa,
      dimensoes: item.dimensoes,
      recomendacao: item.recomendacao,
      impacto_financeiro_estimado: item.impacto_financeiro_estimado,
      evidencias: item.evidencias,
    }));

  const riscoPrincipal = top_riscos[0] || null;

  return {
    origem: "risk_engine",
    formula: {
      pesos: PESOS,
      classificacao: {
        baixo: "0-29",
        medio: "30-59",
        alto: "60-79",
        critico: "80-100",
      },
    },
    top_riscos,
    acao_imediata: riscoPrincipal?.recomendacao || null,
    risco_financeiro_estimado: {
      valor: riscoPrincipal?.impacto_financeiro_estimado || 0,
      mensagem: buildMensagemRiscoFinanceiro(riscoPrincipal, indicadores),
      risco_referencia: riscoPrincipal?.problema || null,
    },
    total_riscos_identificados: riscosBrutos.length,
  };
};

module.exports = {
  PESOS,
  classifyRisk,
  calcularScoreRisco,
  runRiskEngine,
};
