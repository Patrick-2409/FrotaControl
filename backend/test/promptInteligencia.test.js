const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  montarPromptIA,
  prepararPayloadPromptIA,
  buildPromptSistemaIA,
} = require("../src/services/inteligencia/promptInteligencia");

test("montarPromptIA inclui contexto, dados, inconsistências e insights", () => {
  const prompt = montarPromptIA(
    { baseEmTeste: true, totalVeiculos: 3 },
    { indicadores: { totalLitros: 100 } },
    ["consumo sem produção"],
    [{ tipo: "CONCENTRACAO", mensagem: "Veículo A concentra consumo" }]
  );

  assert.match(prompt, /gestor de frota/i);
  assert.match(prompt, /COMPLEMENTAR o motor interno/i);
  assert.match(prompt, /complemento_executivo/i);
  assert.match(prompt, /hipotese_provavel/i);
  assert.match(prompt, /PROIBIDO REPETIR/i);
  assert.match(prompt, /MOTOR INTERNO/i);
  assert.match(prompt, /NÃO invente números/i);
  assert.match(prompt, /"baseEmTeste": true/);
  assert.match(prompt, /"totalLitros": 100/);
  assert.match(prompt, /consumo sem produção/);
  assert.match(prompt, /CONCENTRACAO/);
  assert.match(prompt, /consequencia/);
  assert.match(prompt, /REGRA DE OURO/i);
  assert.match(prompt, /dados_suficientes/);
});

test("prepararPayloadPromptIA agrega inconsistências, insights e motor interno", () => {
  const payload = prepararPayloadPromptIA({
    tipoAnalise: "geral",
    periodo: { tipo: "mes", inicio: "2026-05-01", fim: "2026-05-31" },
    indicadores: { totalLitros: 250, totalViagensTransporte: 4 },
    inteligenciaMotor: {
      status: "ALERTA",
      resumo: "Resumo do motor",
      problemas: ["consumo sem produção"],
      insights: [{ mensagem: "Insight do motor" }],
      recomendacoes: ["Auditar lançamentos"],
    },
    insights: {
      contextoOperacional: { totalVeiculos: 4, veiculosAtivos: 3, baseEmTeste: true },
      inconsistenciasDetectadas: ["produção sem consumo"],
      inconsistenciasDetalhadas: [{ tipo: "ERRO_CRITICO", veiculo: "Caminhão A" }],
      insightsAutomaticos: [{ tipo: "CONCENTRACAO", mensagem: "Concentração em Caminhão A" }],
      contextoTeste: true,
    },
  });

  assert.equal(payload.contexto.baseEmTeste, true);
  assert.ok(payload.inconsistencias.length >= 2);
  assert.ok(payload.insights.length >= 2);
  assert.ok(payload.dados.indicadores);
  assert.ok(payload.motor_interno);
  assert.equal(payload.motor_interno.status, "ALERTA");
  assert.ok(payload.regra_de_ouro);
  assert.equal(typeof payload.regra_de_ouro.dados_suficientes, "boolean");
  assert.ok(payload.conteudo_proibido_repetir);
});

test("buildPromptSistemaIA inclui escopo e formato JSON", () => {
  const prompt = buildPromptSistemaIA({
    escopo: "transporte",
    instrucao: "Analisar somente transporte.",
  });

  assert.match(prompt, /ESCOPO OBRIGATÓRIO \(transporte\)/);
  assert.match(prompt, /complemento_executivo/);
  assert.match(prompt, /hipotese_provavel/);
});
