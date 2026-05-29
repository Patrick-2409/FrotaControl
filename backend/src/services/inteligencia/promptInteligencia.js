const { buildScopedDataForAi, buildEscopoAnalise } = require("./operacionalRules");
const { avaliarRegraDeOuro } = require("./regraDeOuro");
const { buildConteudoProibidoRepetir } = require("../gptComplementProcessor");

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const prepararPayloadPromptIA = (data = {}) => {
  const insights = data?.insights || {};
  const motorInterno = data?.inteligenciaMotor || null;
  const contexto = {
    ...(insights.contextoOperacional || data?.contextoOperacional || {}),
    contextoTeste: Boolean(insights.contextoTeste),
    mensagemContextoTeste: insights.mensagemContextoTeste || null,
    tipoAnalise: data?.tipoAnalise || "geral",
    periodo: data?.periodo || null,
    escopo: buildEscopoAnalise(data?.tipoAnalise, data?.filtros),
    motor_interno: motorInterno,
  };

  const dados = buildScopedDataForAi(data);
  const inconsistencias = [
    ...ensureArray(motorInterno?.problemas),
    ...ensureArray(insights.inconsistenciasDetectadas),
    ...ensureArray(data?.inconsistencias),
    ...ensureArray(insights.inconsistenciasDetalhadas),
    ...ensureArray(data?.inconsistenciasDetalhadas),
  ];
  const insightsMotor = ensureArray(motorInterno?.insights).map((item) =>
    typeof item === "string" ? item : item?.mensagem || item
  );
  const insightsAutomaticos = [
    ...insightsMotor,
    ...ensureArray(insights.insightsAutomaticos || data?.insights_automaticos),
  ];
  const regraDeOuro = avaliarRegraDeOuro({
    indicadores: data?.indicadores || {},
    insights,
    inconsistencias: [
      ...ensureArray(insights.inconsistenciasDetectadas),
      ...ensureArray(data?.inconsistencias),
    ],
    inconsistenciasDetalhadas: [
      ...ensureArray(insights.inconsistenciasDetalhadas),
      ...ensureArray(data?.inconsistenciasDetalhadas),
      ...ensureArray(data?.inconsistencias_detalhadas),
    ],
    periodo: data?.periodo || null,
    tipoAnalise: data?.tipoAnalise || "geral",
    contextoOperacional: insights.contextoOperacional || data?.contextoOperacional || null,
  });

  const conteudoProibidoRepetir = motorInterno
    ? buildConteudoProibidoRepetir(motorInterno, data?.indicadores || {})
    : null;

  return {
    contexto: {
      ...contexto,
      regra_de_ouro: {
        dados_suficientes: regraDeOuro.dadosSuficientes,
        ha_inconsistencia: regraDeOuro.haInconsistencia,
        confiavel_para_decisao: regraDeOuro.confiavelParaDecisao,
        explicacao_porque: regraDeOuro.explicacaoPorque,
      },
      conteudo_proibido_repetir: conteudoProibidoRepetir,
    },
    dados,
    inconsistencias: [...new Set(inconsistencias.filter(Boolean))],
    insights: [...new Set(insightsAutomaticos.filter(Boolean))],
    motor_interno: motorInterno,
    conteudo_proibido_repetir: conteudoProibidoRepetir,
    regra_de_ouro: {
      dados_suficientes: regraDeOuro.dadosSuficientes,
      ha_inconsistencia: regraDeOuro.haInconsistencia,
      confiavel_para_decisao: regraDeOuro.confiavelParaDecisao,
      explicacao_porque: regraDeOuro.explicacaoPorque,
    },
  };
};

const montarPromptIA = (contexto, dados, inconsistencias, insights, motorInterno = null) => {
  const ctx = contexto && typeof contexto === "object" ? contexto : {};
  const payloadDados = dados && typeof dados === "object" ? dados : {};
  const listaInconsistencias = ensureArray(inconsistencias);
  const listaInsights = ensureArray(insights);
  const motor = motorInterno || ctx?.motor_interno || null;

  const proibido = ctx?.conteudo_proibido_repetir || motor?.conteudo_proibido_repetir || null;

  return `
Analise esses dados como gestor de frota experiente em transporte, apoio operacional e combustível.

Sua função é COMPLEMENTAR o motor interno — agregar valor interpretativo, NÃO repetir o relatório.
- NÃO altere status, problemas ou insights calculados pelo motor interno.
- NÃO invente números ausentes nos dados.
- Separe transporte (com produção) e apoio (sem produção).

MOTOR INTERNO (prioridade — imutável, não contradizer):
${JSON.stringify(motor, null, 2)}

CONTEÚDO JÁ EXIBIDO PELO MOTOR (PROIBIDO REPETIR — números, riscos e diagnósticos):
${JSON.stringify(proibido, null, 2)}

PROIBIDO no complemento:
- Repetir números, totais, percentuais ou valores financeiros já listados acima.
- Repetir riscos, problemas ou diagnósticos já descritos pelo motor.
- Parafrasear o resumo executivo ou a ação imediata do motor.
- Listar KPIs ou totais do período.

OBRIGATÓRIO — retorne "complemento_executivo" com EXATAMENTE esta estrutura (texto novo, agregador):
1. "hipotese_provavel" — causa provável NÃO declarada pelo motor (processo, integração, classificação, operação)
2. "consequencia" — efeito operacional/financeiro se a hipótese se confirmar (sem recitar números já exibidos)
3. "risco_futuro" — o que pode piorar nos próximos ciclos se nada for feito
4. "acao_recomendada" — ação adicional, prática e diferente das recomendações do motor

REGRAS:
- Se houver inconsistência, priorize correção de dados antes de eficiência.
- Se a base for pequena, informe que é fase de teste.
- Responda SOMENTE com JSON válido (sem markdown).

REGRA DE OURO (validar com base nos dados; alinhar ao motor interno):
1. "dados_suficientes" (boolean)
2. "ha_inconsistencia" (boolean)
3. "confiavel_para_decisao" (boolean)
4. "explicacao_porque" (texto curto — não repetir blocos do motor)

CONTEXTO:
${JSON.stringify(ctx, null, 2)}

DADOS REAIS:
${JSON.stringify(payloadDados, null, 2)}

INCONSISTÊNCIAS DETECTADAS:
${JSON.stringify(listaInconsistencias, null, 2)}

INSIGHTS CALCULADOS PELO SISTEMA:
${JSON.stringify(listaInsights, null, 2)}

AVALIAÇÃO PRÉ-CALCULADA (regra de ouro):
${JSON.stringify(ctx?.regra_de_ouro || null, null, 2)}

Retorne JSON com:
- "complemento_executivo": { "hipotese_provavel", "consequencia", "risco_futuro", "acao_recomendada" }
- "regra_de_ouro" e campos snake_case da regra de ouro
- "kpis": []
- Demais campos legacy podem ser strings vazias ou arrays vazios (não são exibidos se complemento_executivo estiver preenchido)
`.trim();
};

const buildPromptSistemaIA = (escopo) => [
  "Você é gestor de frota sênior e consultor operacional.",
  "Você COMPLEMENTA o motor interno — nunca substitui status, problemas, riscos ou diagnósticos já calculados.",
  `ESCOPO OBRIGATÓRIO (${escopo.escopo}): ${escopo.instrucao}`,
  "PROIBIDO analisar módulos fora do escopo. PROIBIDO misturar transporte e apoio.",
  "Seu único produto de valor é o bloco complemento_executivo — texto NOVO que o motor não disse.",
  "Responda somente JSON válido no formato:",
  "{",
  '  "complemento_executivo": {',
  '    "hipotese_provavel": "causa provável não repetida do motor",',
  '    "consequencia": "efeito se a hipótese se confirmar",',
  '    "risco_futuro": "o que pode piorar nos próximos ciclos",',
  '    "acao_recomendada": "ação adicional e diferente do motor"',
  "  },",
  '  "kpis": [],',
  '  "dados_suficientes": true,',
  '  "ha_inconsistencia": false,',
  '  "confiavel_para_decisao": true,',
  '  "explicacao_porque": "texto curto alinhado ao motor",',
  '  "regra_de_ouro": {',
  '    "dados_suficientes": true,',
  '    "ha_inconsistencia": false,',
  '    "confiavel_para_decisao": true,',
  '    "explicacao_porque": "mesmo texto de explicacao_porque"',
  "  }",
  "}",
  "ESTRUTURA OBRIGATÓRIA DO COMPLEMENTO:",
  "- hipotese_provavel: inferência de processo/causa raiz (integração, classificação, operação, governança).",
  "- consequencia: impacto operacional ou financeiro qualitativo (sem recitar totais do período).",
  "- risco_futuro: cenário de deterioração se nada for feito.",
  "- acao_recomendada: passo executável DIFERENTE das recomendações do motor.",
  "PROIBIDO no complemento_executivo:",
  "- Repetir números, totais, litros, viagens, R$ ou percentuais já exibidos pelo motor.",
  "- Repetir riscos, problemas ou diagnósticos já descritos.",
  "- Parafrasear resumo executivo, top riscos ou ação imediata do motor.",
  "- Verbos vagos: avaliar, verificar, considerar, monitorar genericamente.",
  "Se contexto_teste=true, mencionar base preliminar na hipótese ou consequência.",
  "Se ha_inconsistencia=true, confiavel_para_decisao=false.",
  "Deixe kpis como array vazio []. KPIs já estão no relatório.",
  "Campos legacy (diagnostico_detalhado, resumo_executivo, acoes_recomendadas) devem ficar vazios.",
].join("\n");

module.exports = {
  prepararPayloadPromptIA,
  montarPromptIA,
  buildPromptSistemaIA,
};
