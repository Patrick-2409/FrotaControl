const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizarDadosOperacionais,
  validarConsistenciaPorVeiculo,
  formatarInconsistenciaVeiculo,
  mergeInconsistencias,
} = require("../src/services/inteligencia/consistenciaOperacional");

test("normalizarDadosOperacionais separa transporte e apoio", () => {
  const dados = normalizarDadosOperacionais({
    veiculosTransporte: [{ id: 1, nome: "Caminhão", litros: 100, viagens: 2 }],
    veiculosApoio: [{ id: 2, nome: "Retro", litros: 50, viagens: 0 }],
  });

  assert.equal(dados.transporte.length, 1);
  assert.equal(dados.apoio.length, 1);
  assert.equal(dados.combustivel.length, 2);
});

test("validarConsistenciaPorVeiculo detecta produção sem consumo", () => {
  const dados = normalizarDadosOperacionais({
    veiculosTransporte: [{ id: 1, nome: "Caminhão A", placa: "ABC-1234", viagens: 5, litros: 0 }],
  });

  const result = validarConsistenciaPorVeiculo(dados);
  assert.equal(result.length, 1);
  assert.equal(result[0].tipo, "ERRO_CRITICO");
  assert.equal(result[0].veiculo, "Caminhão A");
});

test("validarConsistenciaPorVeiculo detecta consumo sem produção", () => {
  const dados = normalizarDadosOperacionais({
    veiculosTransporte: [{ id: 2, nome: "Caminhão B", placa: "XYZ-9999", viagens: 0, litros: 120 }],
  });

  const result = validarConsistenciaPorVeiculo(dados);
  assert.equal(result.length, 1);
  assert.equal(result[0].tipo, "ALERTA");
});

test("validarConsistenciaPorVeiculo ignora apoio", () => {
  const dados = normalizarDadosOperacionais({
    veiculosApoio: [{ id: 3, nome: "Retro", viagens: 0, litros: 80 }],
  });

  const result = validarConsistenciaPorVeiculo(dados);
  assert.equal(result.length, 0);
});

test("mergeInconsistencias combina globais e por veículo", () => {
  const merged = mergeInconsistencias(["totalLitros negativo."], [
    {
      tipo: "ALERTA",
      descricao: "Consumo sem produção",
      veiculo: "Caminhão B",
      placa: "XYZ-9999",
      viagens: 0,
      litros: 120,
    },
  ]);

  assert.equal(merged.length, 2);
  assert.match(merged[1], /Caminhão B \(XYZ-9999\)/);
});

test("formatarInconsistenciaVeiculo inclui viagens e litros", () => {
  const texto = formatarInconsistenciaVeiculo({
    tipo: "ERRO_CRITICO",
    descricao: "Transporte com produção sem consumo",
    veiculo: "Caminhão A",
    placa: "ABC-1234",
    viagens: 3,
    litros: 0,
  });

  assert.match(texto, /ERRO_CRITICO/);
  assert.match(texto, /3 viagem\(ns\), 0\.0 L/);
});
