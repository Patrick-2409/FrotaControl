const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  STATUS,
  normalizarDados,
  validarConsistencia,
  gerarInsights,
  gerarContexto,
  montarRespostaInteligente,
  buildOverviewResponse,
  buildPayloadGeracaoIA,
  mesclarComplementoGpt,
} = require("../src/services/inteligencia.service");

const analysisMock = {
  periodo: { tipo: "mes", inicio: "2026-05-01", fim: "2026-05-31" },
  tipoAnalise: "geral",
  indicadores: {
    totalLitros: 500,
    totalValor: 3500,
    precoMedio: 7,
    totalViagensTransporte: 0,
    totalLitrosTransporte: 400,
    totalLitrosApoio: 100,
    veiculosConsiderados: 3,
    totalVeiculosEscopo: 3,
    dadosTransporteDisponiveis: true,
  },
  insights: {
    consumoSemProducao: true,
    metricasExecutivas: { concentracaoConsumoPct: 55 },
  },
  inconsistencias: [],
  inconsistenciasDetalhadas: [],
  consistenciaVeiculos: {
    veiculosTransporte: [
      { id: 1, veiculoId: 1, nome: "Caminhão A", placa: "ABC-1234", viagens: 0, litros: 400, tipo_operacao: "transporte" },
    ],
    veiculosApoio: [{ id: 2, veiculoId: 2, nome: "Retro B", placa: "XYZ-9999", viagens: 0, litros: 100, tipo_operacao: "apoio" }],
  },
  graficos: {
    consumoPorVeiculo: [
      { veiculo_id: 1, veiculo: "Caminhão A (ABC-1234)", litros: 400 },
      { veiculo_id: 2, veiculo: "Retro B (XYZ-9999)", litros: 100 },
    ],
  },
  modulos: {
    combustivel: {
      indicadores: { totalLitros: 500, totalValor: 3500, totalLitrosTransporte: 400, totalLitrosApoio: 100 },
      graficos: { consumoPorVeiculo: [{ veiculo_id: 1, veiculo: "Caminhão A", litros: 400 }] },
    },
    transporte: { indicadores: { totalViagensTransporte: 0, dadosTransporteDisponiveis: true } },
    frota: { indicadores: { totalParteDiaria: 2, totalVeiculosApoio: 1, totalVeiculosTransporte: 1 } },
  },
};

test("normalizarDados separa transporte, apoio e combustível", () => {
  const dados = normalizarDados(analysisMock);
  assert.equal(dados.transporte.veiculos.length, 1);
  assert.equal(dados.apoio.veiculos.length, 1);
  assert.equal(dados.combustivel.indicadores.totalLitros, 500);
  assert.equal(dados.operacional.transporte.length, 1);
  assert.equal(dados.operacional.apoio.length, 1);
});

test("validarConsistencia detecta consumo sem produção", () => {
  const dados = normalizarDados(analysisMock);
  const validacao = validarConsistencia(dados);
  assert.ok(validacao.consumoSemProducao);
  assert.ok(validacao.problemas.some((p) => /consumo sem produção/i.test(p)));
});

test("gerarInsights inclui veículo dominante e base teste", () => {
  const dados = normalizarDados({
    ...analysisMock,
    indicadores: { ...analysisMock.indicadores, totalVeiculosEscopo: 3 },
  });
  const validacao = validarConsistencia(dados);
  const contexto = gerarContexto(dados);
  const insights = gerarInsights({ ...dados, validacao, contextoParcial: contexto.operacional });
  assert.ok(insights.some((i) => i.tipo === "CONCENTRACAO" || i.tipo === "VEICULO_DOMINANTE"));
});

test("montarRespostaInteligente retorna JSON estruturado sem GPT", () => {
  const resposta = montarRespostaInteligente(analysisMock);

  assert.ok([STATUS.CRITICO, STATUS.ALERTA, STATUS.OK].includes(resposta.status));
  assert.equal(typeof resposta.resumo, "string");
  assert.ok(Array.isArray(resposta.problemas));
  assert.ok(Array.isArray(resposta.insights));
  assert.ok(Array.isArray(resposta.recomendacoes));
  assert.ok(resposta.contexto?.separacao?.transporte);
  assert.ok(resposta.contexto?.separacao?.apoio);
  assert.ok(resposta.contexto?.separacao?.combustivel);
  assert.equal(resposta.origem, "motor_operacional");
});

test("montarRespostaInteligente marca CRITICO em produção sem consumo", () => {
  const resposta = montarRespostaInteligente({
    ...analysisMock,
    consistenciaVeiculos: {
      veiculosTransporte: [
        { id: 1, nome: "Caminhão A", placa: "ABC-1234", viagens: 5, litros: 0, tipo_operacao: "transporte" },
      ],
      veiculosApoio: [],
    },
    indicadores: {
      ...analysisMock.indicadores,
      totalViagensTransporte: 5,
      totalLitrosTransporte: 0,
    },
  });

  assert.equal(resposta.status, STATUS.CRITICO);
  assert.ok(resposta.problemas.length > 0);
});

test("buildOverviewResponse monta payload para GET /inteligencia/overview", () => {
  const inteligencia = montarRespostaInteligente(analysisMock);
  const overview = buildOverviewResponse(analysisMock, inteligencia);

  assert.ok([STATUS.CRITICO, STATUS.ALERTA, STATUS.OK].includes(overview.status));
  assert.equal(typeof overview.resumo, "string");
  assert.ok(Array.isArray(overview.problemas));
  assert.ok(Array.isArray(overview.recomendacoes));
  assert.ok(overview.dados_graficos?.consumo_por_veiculo?.length > 0);
  assert.ok(overview.modulos_leitura?.combustivel?.leitura);
  assert.equal(overview.origem, "motor_operacional");
  assert.equal(overview.vazio, false);
  assert.ok(overview.painel_executivo?.score_geral);
  assert.ok(overview.painel_executivo?.narrativas?.score_operacional?.negativas?.length > 0);
  assert.ok(overview.narrativa_executiva?.o_que_aconteceu);
  assert.ok(overview.mio?.motores);
  assert.ok(Array.isArray(overview.top_riscos));
  assert.ok(overview.conteudo_relatorio?.meta);
  assert.equal(typeof overview.conteudo_relatorio.meta.reducao_percentual, "number");
});

test("mesclarComplementoGpt preserva motor e adiciona complemento estruturado da IA", () => {
  const motor = montarRespostaInteligente(analysisMock);
  const merged = mesclarComplementoGpt(
    motor,
    {
      origem: "openai",
      complemento_executivo: {
        hipotese_provavel: "Possível falha de integração entre romaneio e abastecimento.",
        consequencia: "Margem operacional permanece exposta a distorção de alocação.",
        risco_futuro: "O padrão pode se repetir em outros contratos do mesmo cliente.",
        acao_recomendada: "Definir responsável por reconciliação diária viagem × nota.",
      },
    },
    analysisMock
  );

  assert.equal(merged.status, motor.status);
  assert.deepEqual(merged.problemas, motor.problemas);
  assert.equal(merged.origem, "motor_operacional+gpt");
  assert.ok(merged.complemento_gpt?.hipotese_provavel);
  assert.ok(merged.complemento_gpt?.consequencia);
  assert.ok(merged.complemento_gpt?.risco_futuro);
  assert.ok(merged.complemento_gpt?.acao_recomendada);
  assert.ok(merged.recomendacoes.length >= motor.recomendacoes.length);
});

test("buildPayloadGeracaoIA inclui motor interno para GPT", () => {
  const motor = montarRespostaInteligente(analysisMock);
  const payload = buildPayloadGeracaoIA(analysisMock, motor, 1);
  assert.equal(payload.empresaId, 1);
  assert.equal(payload.inteligenciaMotor.status, motor.status);
  assert.ok(Array.isArray(payload.inteligenciaMotor.problemas));
});
