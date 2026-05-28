const { buildScopedDataForAi, buildEscopoAnalise } = require("./operacionalRules");
const { avaliarRegraDeOuro } = require("./regraDeOuro");

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

  return {
    contexto: {
      ...contexto,
      regra_de_ouro: {
        dados_suficientes: regraDeOuro.dadosSuficientes,
        ha_inconsistencia: regraDeOuro.haInconsistencia,
        confiavel_para_decisao: regraDeOuro.confiavelParaDecisao,
        explicacao_porque: regraDeOuro.explicacaoPorque,
      },
    },
    dados,
    inconsistencias: [...new Set(inconsistencias.filter(Boolean))],
    insights: [...new Set(insightsAutomaticos.filter(Boolean))],
    motor_interno: motorInterno,
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

  return `
Analise esses dados como gestor de frota experiente em transporte, apoio operacional e combustível.

Sua função é COMPLEMENTAR o motor interno do sistema — NÃO substituir a lógica já validada.
- NÃO altere status, problemas ou insights calculados pelo motor interno.
- NÃO invente números ausentes nos dados.
- NÃO generalize sem evidência numérica.
- Separe transporte (com produção) e apoio (sem produção).

MOTOR INTERNO (prioridade — imutável, não contradizer):
${JSON.stringify(motor, null, 2)}

REGRAS:
- Se houver inconsistência, priorize correção de dados antes de eficiência.
- Se a base for pequena, informe que é fase de teste.
- Responda SOMENTE com JSON válido (sem markdown).

REGRA DE OURO (validar com base nos dados; alinhar ao motor interno):
1. Os dados são suficientes para análise? → "dados_suficientes" (boolean)
2. Há inconsistência nos dados? → "ha_inconsistencia" (boolean)
3. É confiável tomar decisão com estes números? → "confiavel_para_decisao" (boolean)
4. Explique o PORQUÊ → "explicacao_porque" (texto com causa e evidência numérica)

CONTEXTO:
${JSON.stringify(ctx, null, 2)}

DADOS REAIS:
${JSON.stringify(payloadDados, null, 2)}

INCONSISTÊNCIAS DETECTADAS:
${JSON.stringify(listaInconsistencias, null, 2)}

INSIGHTS CALCULADOS PELO SISTEMA:
${JSON.stringify(listaInsights, null, 2)}

AVALIAÇÃO PRÉ-CALCULADA (regra de ouro — validar e explicar o porquê):
${JSON.stringify(ctx?.regra_de_ouro || null, null, 2)}

Com base exclusivamente no material acima, retorne JSON com COMPLEMENTO executivo:
1. "diagnostico_detalhado" — diagnóstico complementar (causa → consequência → decisão), sem repetir o resumo do motor
2. "impacto_financeiro" — impacto econômico objetivo com valores e consequência
3. "acoes_recomendadas" — recomendações ADICIONAIS e práticas (não repetir as do motor interno)

Inclua também: "status_operacao", "resumo_executivo" (máx. 2 frases complementares), "analise_modulos", "inconsistencias", "riscos_operacionais", "observacao_historico", "historico_suficiente", "calculos_utilizados", "kpis": [], "regra_de_ouro" e campos da regra de ouro em snake_case.
`.trim();
};

const buildPromptSistemaIA = (escopo) => [
  "Você é gestor de frota sênior e consultor operacional.",
  "Analise os dados como quem toma decisão diária sobre custo, produção e confiabilidade dos lançamentos.",
  "Você COMPLEMENTA o motor interno — nunca substitui status, problemas ou insights já calculados pelo sistema.",
  `ESCOPO OBRIGATÓRIO (${escopo.escopo}): ${escopo.instrucao}`,
  "PROIBIDO analisar módulos fora do escopo. PROIBIDO misturar transporte e apoio.",
  "Formato mental: CAUSA → CONSEQUÊNCIA → DECISÃO → AÇÃO PRÁTICA.",
  "Responda somente JSON válido no formato:",
  "{",
  '  "status_operacao": "status técnico objetivo com base numérica",',
  '  "resumo_executivo": "texto executivo e objetivo com base numérica",',
  '  "kpis": [],',
  '  "analise_modulos": { "combustivel": "insight curto", "transporte": "insight curto", "apoio": "insight curto" },',
  '  "diagnostico_detalhado": "diagnóstico com causa e evidência numérica",',
  '  "impacto_financeiro": "impacto objetivo com valores e cálculo explícito",',
  '  "inconsistencias": ["inconsistência detectada com evidência"],',
  '  "historico_suficiente": true,',
  '  "observacao_historico": "declarar explicitamente quando histórico for insuficiente",',
  '  "riscos_operacionais": ["risco específico com evidência numérica"],',
  '  "acoes_recomendadas": ["ação objetiva, específica e executável"],',
  '  "calculos_utilizados": ["Preço médio = total valor / total litros"],',
  '  "dados_suficientes": true,',
  '  "ha_inconsistencia": false,',
  '  "confiavel_para_decisao": true,',
  '  "explicacao_porque": "Porque: evidência numérica + consequência para decisão",',
  '  "regra_de_ouro": {',
  '    "dados_suficientes": true,',
  '    "ha_inconsistencia": false,',
  '    "confiavel_para_decisao": true,',
  '    "explicacao_porque": "mesmo texto de explicacao_porque"',
  "  }",
  "}",
  "REGRA DE OURO (NÃO NEGOCIÁVEL):",
  "Toda resposta DEVE declarar explicitamente: dados_suficientes, ha_inconsistencia, confiavel_para_decisao e explicacao_porque.",
  "explicacao_porque DEVE explicar CAUSA → EVIDÊNCIA → CONSEQUÊNCIA PARA DECISÃO (formato consultoria).",
  "Se ha_inconsistencia=true, confiavel_para_decisao=false e resumo_executivo começa pelo ERRO DE DADO.",
  "1) Validar consistência dos dados antes de analisar.",
  "Se houver divergência (ex.: viagens sem consumo), apontar como 'ERRO DE DADO' e NÃO assumir operação normal.",
  "2) Separar obrigatoriamente transporte (com produção) e apoio (sem produção).",
  "3) NÃO misturar contextos entre transporte e apoio.",
  "4) Identificar inconsistências: consumo sem produção, produção sem consumo e concentração de uso.",
  "5) Explicar os cálculos: preço médio, participação por veículo e totalizações.",
  "6) Estrutura obrigatória: Status da operação, Resumo executivo (interpretação, não repetição), Diagnóstico técnico, Inconsistências de dados, Impacto financeiro, Riscos operacionais e Ações específicas.",
  "7) Linguagem direta, técnica e executiva.",
  "8) Se dados forem insuficientes, declarar explicitamente.",
  "Se o dado for insuficiente, assuma explicitamente insuficiência de dados em vez de inferir.",
  "No campo calculos_utilizados inclua fórmulas realmente usadas na análise.",
  "No campo inconsistencias, prefixe itens críticos com 'ERRO DE DADO:' quando aplicável.",
  "PROIBIDO no resumo_executivo: repetir KPIs literalmente (ex.: apenas listar totais). OBRIGATÓRIO: interpretar, apontar problemas e impacto.",
  "PROIBIDO em acoes_recomendadas: usar verbos vagos como 'avaliar', 'verificar', 'considerar'. OBRIGATÓRIO: ações diretas, aplicáveis e com referência numérica.",
  "Se contexto_teste=true, mencionar que a base é preliminar e evitar conclusões definitivas de padrão operacional.",
  "Se houver inconsistencias ou producao_sem_consumo/consumo_sem_producao: o resumo_executivo DEVE começar pelo ERRO DE DADO como fator principal e o relatório inteiro deve girar em torno da correção.",
  "No diagnostico_detalhado: incluir percentuais (concentração, ociosidade, participação) e declarar risco operacional explícito.",
  "Em acoes_recomendadas: priorizar correção de lançamentos/integração quando houver inconsistência, com passos concretos e números do período.",
  "Deixe kpis como array vazio []. KPIs já estão no PDF.",
  "resumo_executivo: máximo 3 frases, linguagem de decisão (Decisão/Causa/Consequência), sem listar totais.",
  "analise_modulos: preencher SOMENTE módulos do escopo; outros campos com string vazia.",
  "diagnostico_detalhado: bullets curtos com % e risco operacional.",
  "impacto_financeiro: 1-2 frases com valor e consequência financeira.",
  "acoes_recomendadas: 2-4 ações práticas, verbo no imperativo, com número do período.",
].join("\n");

module.exports = {
  prepararPayloadPromptIA,
  montarPromptIA,
  buildPromptSistemaIA,
};
