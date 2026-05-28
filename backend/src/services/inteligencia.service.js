const { toNumber } = require("./inteligencia/common");
const {
  normalizarDadosOperacionais,
  validarConsistenciaPorVeiculo,
  formatarInconsistenciaVeiculo,
  mergeInconsistencias,
} = require("./inteligencia/consistenciaOperacional");
const { gerarInsights: gerarInsightsAutomaticos } = require("./inteligencia/insightsOperacionais");
const {
  gerarContexto: gerarContextoOperacional,
  detectContextoTeste,
  detectInconsistenciasOperacionais,
  buildResumoExecutivoFallback,
  buildDiagnosticoFallback,
  buildAcoesFallback,
  MENSAGEM_CONTEXTO_TESTE,
} = require("./inteligencia/operacionalRules");
const { avaliarRegraDeOuro } = require("./inteligencia/regraDeOuro");
const { classificarVeiculos } = require("./inteligencia/classificarVeiculos");

const STATUS = {
  CRITICO: "CRITICO",
  ALERTA: "ALERTA",
  OK: "OK",
};

const resolveLitros = (item) => toNumber(item?.litros ?? item?.consumo ?? item?.totalLitros);
const resolveViagens = (item) => toNumber(item?.viagens ?? item?.totalViagens);

const mapVeiculoCombustivel = (row = {}) => ({
  veiculoId: row.veiculo_id ?? row.veiculoId ?? row.id ?? null,
  nome: row.veiculo || row.nome || "Sem veículo",
  placa: row.placa || "-",
  litros: resolveLitros(row),
  tipo_operacao: row.tipo_operacao || "apoio",
});

const normalizarDados = (entrada = {}) => {
  const modulos = entrada.modulos || {};
  const combustivelMod = modulos.combustivel || {};
  const transporteMod = modulos.transporte || {};
  const frotaMod = modulos.frota || {};
  const consistenciaRaw = entrada.consistenciaVeiculos || null;

  const veiculosTransporte = classificarVeiculos(
    consistenciaRaw?.veiculosTransporte ||
      (Array.isArray(consistenciaRaw) ? consistenciaRaw : [])
  );
  const veiculosApoio = classificarVeiculos(
    consistenciaRaw?.veiculosApoio ||
      (Array.isArray(consistenciaRaw) ? consistenciaRaw.filter((v) => v.tipo_operacao === "apoio") : [])
  );

  const consumoPorVeiculo = (combustivelMod.graficos?.consumoPorVeiculo || entrada.graficos?.consumoPorVeiculo || []).map(
    mapVeiculoCombustivel
  );

  const indicadores = entrada.indicadores || {};
  const periodo = entrada.periodo || null;
  const tipoAnalise = entrada.tipoAnalise || "geral";

  const transporte = {
    veiculos: veiculosTransporte,
    indicadores: {
      totalViagens: toNumber(transporteMod.indicadores?.totalViagens ?? indicadores.totalViagens),
      totalViagensTransporte: toNumber(
        transporteMod.indicadores?.totalViagensTransporte ?? indicadores.totalViagensTransporte
      ),
      dadosTransporteDisponiveis: Boolean(
        transporteMod.indicadores?.dadosTransporteDisponiveis ?? indicadores.dadosTransporteDisponiveis
      ),
    },
    graficos: {
      consumoVsProducao: transporteMod.graficos?.consumoVsProducao || entrada.graficos?.consumoVsProducao || [],
    },
  };

  const apoio = {
    veiculos: veiculosApoio,
    indicadores: {
      totalParteDiaria: toNumber(frotaMod.indicadores?.totalParteDiaria ?? indicadores.totalParteDiaria),
      veiculosAtivosApoio: toNumber(frotaMod.indicadores?.veiculosAtivosApoio ?? indicadores.veiculosAtivosApoio),
      veiculosOciososApoio: toNumber(frotaMod.indicadores?.veiculosOciososApoio ?? indicadores.veiculosOciososApoio),
      totalVeiculosApoio: toNumber(frotaMod.indicadores?.totalVeiculosApoio ?? indicadores.totalVeiculosApoio),
    },
    graficos: {
      atividadesPorVeiculo: frotaMod.graficos?.atividadesPorVeiculo || [],
      produtividadePorDia: frotaMod.graficos?.produtividadePorDia || [],
    },
  };

  const combustivel = {
    veiculos: consumoPorVeiculo,
    indicadores: {
      totalLitros: toNumber(combustivelMod.indicadores?.totalLitros ?? indicadores.totalLitros),
      totalValor: toNumber(combustivelMod.indicadores?.totalValor ?? indicadores.totalValor),
      precoMedio: toNumber(combustivelMod.indicadores?.precoMedio ?? indicadores.precoMedio),
      totalLitrosTransporte: toNumber(
        combustivelMod.indicadores?.totalLitrosTransporte ?? indicadores.totalLitrosTransporte
      ),
      totalLitrosApoio: toNumber(combustivelMod.indicadores?.totalLitrosApoio ?? indicadores.totalLitrosApoio),
      veiculosConsiderados: toNumber(
        combustivelMod.indicadores?.veiculosConsiderados ?? indicadores.veiculosConsiderados
      ),
    },
    graficos: {
      consumoPorVeiculo: combustivelMod.graficos?.consumoPorVeiculo || entrada.graficos?.consumoPorVeiculo || [],
      custoPorPeriodo: combustivelMod.graficos?.custoPorPeriodo || entrada.graficos?.custoPorPeriodo || [],
    },
  };

  const operacional = normalizarDadosOperacionais({
    veiculosTransporte,
    veiculosApoio,
    parteDiaria: apoio.graficos.atividadesPorVeiculo,
  });

  return {
    periodo,
    tipoAnalise,
    indicadores,
    transporte,
    apoio,
    combustivel,
    operacional,
    insightsBrutos: entrada.insights || {},
    inconsistenciasDetalhadas: entrada.inconsistenciasDetalhadas || entrada.inconsistencias_detalhadas || [],
    inconsistenciasGlobais: entrada.inconsistencias || [],
  };
};

const validarConsistencia = (dados = {}) => {
  const operacional = dados.operacional || normalizarDadosOperacionais();
  const indicadores = dados.indicadores || {};
  const insights = dados.insightsBrutos || {};

  const porVeiculo = validarConsistenciaPorVeiculo(operacional);
  const { inconsistencias: globais, producaoSemConsumo, consumoSemProducao } = detectInconsistenciasOperacionais({
    indicadores,
    insights,
  });

  const problemasDetalhados = [...porVeiculo];
  const problemasTexto = mergeInconsistencias(globais, porVeiculo);

  if (producaoSemConsumo && !problemasTexto.some((p) => /produção sem consumo/i.test(p))) {
    problemasTexto.unshift("ERRO DE DADO: produção de transporte sem consumo correspondente no período.");
  }
  if (consumoSemProducao && !problemasTexto.some((p) => /consumo sem produção/i.test(p))) {
    problemasTexto.unshift("ALERTA: consumo de transporte sem viagens registradas no período.");
  }

  return {
    problemas: [...new Set(problemasTexto.filter(Boolean))],
    inconsistenciasDetalhadas: problemasDetalhados,
    producaoSemConsumo,
    consumoSemProducao,
  };
};

const gerarInsights = (dados = {}) => {
  const indicadores = dados.indicadores || {};
  const insightsAutomaticos = gerarInsightsAutomaticos({
    combustivel: dados.combustivel?.veiculos || [],
    transporte: dados.transporte?.veiculos || [],
    indicadores,
  });

  const insights = [...insightsAutomaticos];

  if (detectContextoTeste({
    indicadores,
    periodo: dados.periodo || {},
    contexto: dados.contextoParcial,
  })) {
    insights.push({
      tipo: "BASE_TESTE",
      mensagem: MENSAGEM_CONTEXTO_TESTE,
    });
  }

  const dominante = insights.find((item) => item.tipo === "CONCENTRACAO");
  if (dominante && toNumber(dominante.percentual) >= 50) {
    insights.push({
      tipo: "VEICULO_DOMINANTE",
      mensagem: `Veículo dominante: ${dominante.veiculo} com ${dominante.percentual}% do consumo.`,
      veiculo: dominante.veiculo,
      percentual: dominante.percentual,
    });
  }

  if (dados.validacao?.producaoSemConsumo) {
    insights.push({
      tipo: "PRODUCAO_SEM_CONSUMO",
      mensagem: "Detectada produção (viagens) sem abastecimento correspondente em veículo de transporte.",
    });
  }

  if (dados.validacao?.consumoSemProducao) {
    insights.push({
      tipo: "CONSUMO_SEM_PRODUCAO",
      mensagem: "Detectado consumo em transporte sem viagens — verificar tipo_operacao ou lançamentos.",
    });
  }

  return insights;
};

const gerarContexto = (dados = {}) => {
  const indicadores = dados.indicadores || {};
  const veiculos = [
    ...(dados.transporte?.veiculos || []),
    ...(dados.apoio?.veiculos || []),
  ];

  const contextoOperacional = gerarContextoOperacional({
    veiculos,
    indicadores,
    periodo: dados.periodo || {},
  });

  const baseEmTeste = detectContextoTeste({
    indicadores,
    periodo: dados.periodo || {},
    contexto: contextoOperacional,
  });

  return {
    operacional: contextoOperacional,
    baseEmTeste,
    mensagemBaseTeste: baseEmTeste ? MENSAGEM_CONTEXTO_TESTE : null,
    separacao: {
      transporte: {
        veiculos: dados.transporte?.veiculos?.length || 0,
        viagens: dados.transporte?.indicadores?.totalViagensTransporte || 0,
        litros: dados.combustivel?.indicadores?.totalLitrosTransporte || 0,
      },
      apoio: {
        veiculos: dados.apoio?.veiculos?.length || 0,
        parteDiaria: dados.apoio?.indicadores?.totalParteDiaria || 0,
        litros: dados.combustivel?.indicadores?.totalLitrosApoio || 0,
      },
      combustivel: {
        totalLitros: dados.combustivel?.indicadores?.totalLitros || 0,
        totalValor: dados.combustivel?.indicadores?.totalValor || 0,
        veiculosComAbastecimento: dados.combustivel?.indicadores?.veiculosConsiderados || 0,
      },
    },
    periodo: dados.periodo || null,
    tipoAnalise: dados.tipoAnalise || "geral",
  };
};

const resolverStatus = ({ validacao = {}, contexto = {}, indicadores = {} }) => {
  const temCritico =
    validacao.producaoSemConsumo ||
    (validacao.inconsistenciasDetalhadas || []).some((item) => item.tipo === "ERRO_CRITICO") ||
    validacao.problemas?.some((p) => /ERRO_CRITICO|ERRO DE DADO/i.test(p));

  if (temCritico) return STATUS.CRITICO;

  const temAlerta =
    validacao.consumoSemProducao ||
    contexto.baseEmTeste ||
    toNumber(indicadores.veiculosOciosos) > 0 ||
    validacao.problemas?.length > 0;

  if (temAlerta) return STATUS.ALERTA;

  return STATUS.OK;
};

const gerarRecomendacoes = (dados = {}, validacao = {}) => {
  const indicadores = dados.indicadores || {};
  const insights = {
    ...(dados.insightsBrutos || {}),
    producaoSemConsumo: validacao.producaoSemConsumo,
    consumoSemProducao: validacao.consumoSemProducao,
    inconsistenciasDetectadas: validacao.problemas || [],
  };

  const acoes = buildAcoesFallback({
    indicadores,
    insights,
    inconsistencias: validacao.problemas || [],
  });

  if (dados.contexto?.baseEmTeste) {
    acoes.unshift("Aguardar mais lançamentos antes de conclusões definitivas — base em fase inicial.");
  }

  return [...new Set(acoes.filter(Boolean))].slice(0, 5);
};

const gerarResumo = (status, dados = {}, validacao = {}, contexto = {}) => {
  const indicadores = dados.indicadores || {};
  const metricas = dados.insightsBrutos?.metricasExecutivas || {};

  if (status === STATUS.CRITICO) {
    const principal = validacao.problemas?.[0] || "Inconsistência crítica nos dados operacionais.";
    return `Status CRÍTICO: ${principal} Corrija os lançamentos antes de decidir sobre eficiência ou custos.`;
  }

  if (status === STATUS.ALERTA) {
    if (contexto.baseEmTeste) {
      return "Status ALERTA: base em fase inicial de alimentação. Indicadores são preliminares e exigem mais histórico.";
    }
    return (
      buildResumoExecutivoFallback({
        indicadores,
        insights: dados.insightsBrutos || {},
        inconsistencias: validacao.problemas || [],
        metricas,
      }) || "Status ALERTA: operação com pontos que exigem acompanhamento no recorte analisado."
    );
  }

  return (
    buildResumoExecutivoFallback({
      indicadores,
      insights: dados.insightsBrutos || {},
      inconsistencias: [],
      metricas,
    }) || "Status OK: dados coerentes no período, sem inconsistência crítica detectada."
  );
};

const montarRespostaInteligente = (analysis = {}) => {
  const dados = normalizarDados(analysis);
  const validacao = validarConsistencia(dados);
  const contexto = gerarContexto({ ...dados, contextoParcial: null });
  const dadosComValidacao = { ...dados, validacao, contextoParcial: contexto.operacional };
  const insights = gerarInsights(dadosComValidacao);
  const status = resolverStatus({
    validacao,
    contexto,
    indicadores: dados.indicadores,
  });
  const resumo = gerarResumo(status, dados, validacao, contexto);
  const recomendacoes = gerarRecomendacoes(dadosComValidacao, validacao);

  const regraDeOuro = avaliarRegraDeOuro({
    indicadores: dados.indicadores,
    insights: {
      ...(dados.insightsBrutos || {}),
      producaoSemConsumo: validacao.producaoSemConsumo,
      consumoSemProducao: validacao.consumoSemProducao,
      contextoTeste: contexto.baseEmTeste,
      contextoOperacional: contexto.operacional,
    },
    inconsistencias: validacao.problemas,
    inconsistenciasDetalhadas: validacao.inconsistenciasDetalhadas,
    periodo: dados.periodo,
    tipoAnalise: dados.tipoAnalise,
    contextoOperacional: contexto.operacional,
  });

  return {
    status,
    resumo,
    problemas: validacao.problemas,
    insights,
    recomendacoes,
    contexto: {
      ...contexto,
      regraDeOuro,
    },
    origem: "motor_operacional",
    modulos: {
      transporte: dados.transporte,
      apoio: dados.apoio,
      combustivel: dados.combustivel,
    },
  };
};

const mapRelatorioCompativel = (inteligencia = {}, analysis = {}) => {
  const complemento = inteligencia.complemento_gpt || {};
  const diagnosticoMotor = buildDiagnosticoFallback({
    indicadores: analysis.indicadores || {},
    insights: analysis.insights || {},
    inconsistencias: inteligencia.problemas || [],
    metricas: analysis.insights?.metricasExecutivas || {},
  });
  const diagnosticoDetalhado = complemento.diagnostico
    ? `${diagnosticoMotor}\n\nComplemento IA: ${complemento.diagnostico}`.trim()
    : diagnosticoMotor;
  const impactoFinanceiro =
    complemento.impacto ||
    (toNumber(analysis.indicadores?.totalValor) > 0
      ? `Custo operacional de combustível no período: ${toNumber(analysis.indicadores?.totalValor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`
      : "");

  return {
    origem: inteligencia.origem || "motor_operacional",
    origemGpt: complemento.origem || null,
    statusOperacao: inteligencia.status,
    resumoExecutivo: inteligencia.resumo,
    diagnosticoDetalhado,
    problemaPrincipal: inteligencia.problemas?.[0] || inteligencia.resumo,
    impactoFinanceiro,
    inconsistencias: inteligencia.problemas || [],
    riscos: (inteligencia.problemas || []).filter((item) => /ERRO|CRITICO|inconsist/i.test(item)),
    acoes: inteligencia.recomendacoes || [],
    insightsAutomaticos: inteligencia.insights || [],
    regraDeOuro: inteligencia.contexto?.regraDeOuro || null,
    complementoGpt: complemento.diagnostico || complemento.impacto ? complemento : null,
    inteligencia,
  };
};

const mergeUniqueStrings = (...lists) => {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const raw of Array.isArray(list) ? list : []) {
      const text = String(raw || "").trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      merged.push(text);
    }
  }
  return merged;
};

const normalizeMotorParaGpt = (inteligenciaMotor = {}) => ({
  status: inteligenciaMotor.status,
  resumo: inteligenciaMotor.resumo,
  problemas: inteligenciaMotor.problemas || [],
  insights: (inteligenciaMotor.insights || []).map((item) =>
    typeof item === "string" ? item : item?.mensagem || item
  ),
  recomendacoes: inteligenciaMotor.recomendacoes || [],
  regra_de_ouro: inteligenciaMotor.contexto?.regraDeOuro || null,
});

const buildPayloadGeracaoIA = (analysis = {}, inteligenciaMotor = {}, empresaId = null) => ({
  empresaId,
  ...analysis,
  inteligenciaMotor: normalizeMotorParaGpt(inteligenciaMotor),
});

const mesclarComplementoGpt = (inteligenciaMotor = {}, gptReport = {}) => {
  const origemGpt = gptReport?.origem || "fallback";
  const gptAtivo = origemGpt === "openai" || origemGpt === "cache";

  const diagnosticoGpt = String(gptReport?.diagnosticoDetalhado || gptReport?.problemaPrincipal || "").trim();
  const impactoGpt = String(gptReport?.impactoFinanceiro || gptReport?.impacto_financeiro || "").trim();
  const recomendacoesGpt = mergeUniqueStrings(
    gptReport?.acoes,
    gptReport?.acoes_recomendadas,
    gptReport?.recomendacoes_complementares
  );

  const temComplemento = Boolean(diagnosticoGpt || impactoGpt || recomendacoesGpt.length);
  const recomendacoes = mergeUniqueStrings(inteligenciaMotor.recomendacoes || [], recomendacoesGpt).slice(0, 8);

  const origem =
    gptAtivo && temComplemento
      ? "motor_operacional+gpt"
      : origemGpt === "limit"
        ? "motor_operacional+limite_gpt"
        : inteligenciaMotor.origem || "motor_operacional";

  return {
    ...inteligenciaMotor,
    status: inteligenciaMotor.status,
    resumo: inteligenciaMotor.resumo,
    problemas: inteligenciaMotor.problemas || [],
    insights: inteligenciaMotor.insights || [],
    recomendacoes,
    origem,
    complemento_gpt: temComplemento
      ? {
          diagnostico: diagnosticoGpt,
          impacto: impactoGpt,
          recomendacoes: recomendacoesGpt,
          origem: origemGpt,
          disponivel: gptAtivo,
        }
      : null,
    contexto: {
      ...(inteligenciaMotor.contexto || {}),
      complemento_gpt:
        temComplemento
          ? {
              diagnostico: diagnosticoGpt,
              impacto: impactoGpt,
              origem: origemGpt,
            }
          : null,
    },
  };
};

const mapStatusLabel = (status) => {
  if (status === STATUS.CRITICO) return "CRÍTICO";
  if (status === STATUS.ALERTA) return "ALERTA";
  return "OK";
};

const gerarLeiturasModulo = (inteligencia = {}, indicadores = {}) => {
  const sep = inteligencia.contexto?.separacao || {};
  const insightMsgs = (inteligencia.insights || [])
    .map((item) => (typeof item === "string" ? item : item?.mensagem))
    .filter(Boolean);

  const combustivelLeitura =
    insightMsgs.find((msg) => /consumo|litros|concentra/i.test(msg)) ||
    (toNumber(indicadores.totalLitros) > 0
      ? `${toNumber(indicadores.totalLitros).toLocaleString("pt-BR")} L registrados no período (${toNumber(sep.combustivel?.totalValor || indicadores.totalValor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`
      : "Sem consumo registrado no período.");

  const transporteLeitura =
    insightMsgs.find((msg) => /viagem|produção|producao|transporte/i.test(msg)) ||
    (toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens) > 0
      ? `${toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens)} viagem(ns) de transporte no recorte.`
      : "Nenhuma viagem de transporte registrada no período.");

  const frotaLeitura =
    insightMsgs.find((msg) => /ocios|apoio|parte diária|parte diaria/i.test(msg)) ||
    (toNumber(indicadores.veiculosOciosos) > 0
      ? `${toNumber(indicadores.veiculosOciosos)} veículo(s) ocioso(s) — ${toNumber(indicadores.veiculosAtivos)} ativo(s).`
      : `${toNumber(indicadores.veiculosAtivos)} veículo(s) ativo(s) no escopo.`);

  return {
    combustivel: {
      consumoTotal: toNumber(indicadores.totalLitros),
      custoTotal: toNumber(indicadores.totalValor),
      precoMedio: Number.isFinite(Number(indicadores.precoMedio)) ? Number(indicadores.precoMedio) : null,
      leitura: combustivelLeitura,
    },
    transporte: {
      viagens: toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens),
      leitura: transporteLeitura,
    },
    frota: {
      veiculosAtivos: toNumber(indicadores.veiculosAtivos),
      veiculosOciosos: toNumber(indicadores.veiculosOciosos),
      leitura: frotaLeitura,
    },
  };
};

const buildOverviewResponse = (analysis = {}, inteligencia = {}) => {
  const modulos = analysis.modulos || {};
  const frota = modulos.frota || {};
  const indicadores = analysis.indicadores || {};

  const dados_graficos = {
    consumo_por_veiculo: analysis.graficos?.consumoPorVeiculo || [],
    custo_por_periodo: analysis.graficos?.custoPorPeriodo || [],
    consumo_vs_producao: analysis.graficos?.consumoVsProducao || [],
    parte_diaria: {
      atividades_por_veiculo: frota.graficos?.atividadesPorVeiculo || [],
      produtividade_por_dia: frota.graficos?.produtividadePorDia || [],
      indicadores: {
        totalParteDiaria: toNumber(frota.indicadores?.totalParteDiaria),
        totalHorasParteDiaria: toNumber(frota.indicadores?.totalHorasParteDiaria),
        mediaHorasPorRegistro: toNumber(frota.indicadores?.mediaHorasPorRegistro),
        veiculosComParteDiaria: toNumber(frota.indicadores?.veiculosComParteDiaria),
      },
    },
  };

  const veiculosConsiderados = toNumber(indicadores.veiculosConsiderados);
  const vazio =
    !dados_graficos.consumo_por_veiculo.length &&
    !dados_graficos.custo_por_periodo.length &&
    !dados_graficos.consumo_vs_producao.length &&
    veiculosConsiderados === 0;

  const status = inteligencia.status || STATUS.OK;
  const modulos_leitura = gerarLeiturasModulo(inteligencia, indicadores);

  return {
    status,
    resumo: inteligencia.resumo || (vazio ? "Nenhum dado encontrado para o período selecionado." : ""),
    problemas: inteligencia.problemas || [],
    insights: inteligencia.insights || [],
    recomendacoes: inteligencia.recomendacoes || [],
    contexto: inteligencia.contexto || {},
    dados_graficos,
    modulos_leitura,
    periodo: analysis.periodo || null,
    tipoAnalise: analysis.tipoAnalise || "geral",
    filtros: analysis.filtros || {},
    indicadores,
    vazio,
    mensagem: vazio ? "Nenhum dado encontrado para o período" : "",
    origem: inteligencia.origem || "motor_operacional",
    complemento_gpt: inteligencia.complemento_gpt || null,
    consumo_por_veiculo: dados_graficos.consumo_por_veiculo,
    custo_por_periodo: dados_graficos.custo_por_periodo,
    consumo_vs_producao: dados_graficos.consumo_vs_producao,
    parte_diaria: dados_graficos.parte_diaria,
    inconsistencias: inteligencia.problemas || [],
    inconsistencias_detalhadas: analysis.inconsistenciasDetalhadas || [],
    insights_automaticos: inteligencia.insights || [],
    status_operacao: {
      nivel: status,
      label: mapStatusLabel(status),
      descricao: inteligencia.resumo || "",
    },
    contexto_operacional: inteligencia.contexto?.operacional || null,
    regra_de_ouro: inteligencia.contexto?.regraDeOuro || null,
  };
};

const buildOverviewVazio = (filtros = {}) =>
  buildOverviewResponse(
    {
      periodo: null,
      tipoAnalise: "geral",
      filtros,
      indicadores: {},
      graficos: { consumoPorVeiculo: [], custoPorPeriodo: [], consumoVsProducao: [] },
      modulos: { frota: { graficos: {}, indicadores: {} } },
    },
    montarRespostaInteligente({
      indicadores: {},
      periodo: null,
      tipoAnalise: "geral",
    })
  );

module.exports = {
  STATUS,
  normalizarDados,
  validarConsistencia,
  gerarInsights,
  gerarContexto,
  montarRespostaInteligente,
  mapRelatorioCompativel,
  buildOverviewResponse,
  buildOverviewVazio,
  buildPayloadGeracaoIA,
  mesclarComplementoGpt,
};
