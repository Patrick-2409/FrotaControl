const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  classificarVeiculos,
  separarVeiculosPorTipo,
  resolveUsaRomaneio,
} = require("../src/services/inteligencia/classificarVeiculos");

test("classificarVeiculos usa tipo_operacao existente", () => {
  const [veiculo] = classificarVeiculos([{ id: 1, nome: "Caminhão", tipo_operacao: "transporte" }]);
  assert.equal(veiculo.tipo_operacao, "transporte");
});

test("classificarVeiculos infere transporte via usa_romaneio", () => {
  const [veiculo] = classificarVeiculos([{ id: 2, nome: "Bitrem", usa_romaneio: true }]);
  assert.equal(veiculo.tipo_operacao, "transporte");
});

test("classificarVeiculos infere transporte via usa_para_transporte", () => {
  const [veiculo] = classificarVeiculos([{ id: 3, nome: "Carreta", usa_para_transporte: true }]);
  assert.equal(veiculo.tipo_operacao, "transporte");
  assert.equal(veiculo.usa_romaneio, true);
});

test("classificarVeiculos define apoio quando não usa romaneio", () => {
  const [veiculo] = classificarVeiculos([{ id: 4, nome: "Retro" }]);
  assert.equal(veiculo.tipo_operacao, "apoio");
  assert.equal(resolveUsaRomaneio(veiculo), false);
});

test("separarVeiculosPorTipo não mistura transporte e apoio", () => {
  const { transporte, apoio } = separarVeiculosPorTipo([
    { id: 1, usa_romaneio: true },
    { id: 2, usa_romaneio: false },
    { id: 3, tipo_operacao: "apoio" },
  ]);

  assert.equal(transporte.length, 1);
  assert.equal(apoio.length, 2);
});
