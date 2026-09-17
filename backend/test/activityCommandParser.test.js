"use strict";

/**
 * Testes unitários (sem banco/rede) do parser DETERMINÍSTICO de comandos
 * explícitos de atividade (Seção "comandos explícitos") — cobre só o
 * reconhecimento de cabeçalho e a divisão em blocos; a integração com
 * `buildActivities` (dedup, ordem, complemento aplicado na célula) é coberta
 * em `test/activityCommands.test.js`.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseExplicitActivityCommand, splitIntoBlocks } = require("../src/modules/automations/documents/activityCommandParser");

test("ATIVIDADE SEM FOTO: reconhece o cabeçalho case-insensitive e divide em blocos por linha em branco", () => {
  const text = "ATIVIDADE SEM FOTO:\n\nAtividade X...\n- 78 sementes beneficiadas\n\nAtividade Y...\n- 67 mudas de aroeira transportadas para rustificação";
  const result = parseExplicitActivityCommand(text);
  assert.equal(result.type, "SEM_FOTO");
  assert.deepEqual(result.blocks, ["Atividade X...\n- 78 sementes beneficiadas", "Atividade Y...\n- 67 mudas de aroeira transportadas para rustificação"]);
});

test("ATIVIDADE SEM FOTO: case-insensitive e tolera espaçamento extra entre as palavras do cabeçalho", () => {
  const result = parseExplicitActivityCommand("atividade   sem  foto:\nSó uma atividade aqui.");
  assert.equal(result.type, "SEM_FOTO");
  assert.deepEqual(result.blocks, ["Só uma atividade aqui."]);
});

test("ATIVIDADE SEM FOTO: um único bloco (sem linha em branco) vira UMA atividade só", () => {
  const result = parseExplicitActivityCommand("Atividade sem foto:\nPlantio de mudas na área 2.");
  assert.equal(result.type, "SEM_FOTO");
  assert.deepEqual(result.blocks, ["Plantio de mudas na área 2."]);
});

test("splitIntoBlocks: preserva quebras de linha DENTRO de um bloco, só remove a linha em branco separadora", () => {
  const blocks = splitIntoBlocks("Linha 1\nLinha 2\n\nBloco 2 linha única");
  assert.deepEqual(blocks, ["Linha 1\nLinha 2", "Bloco 2 linha única"]);
});

test("splitIntoBlocks: múltiplas linhas em branco entre blocos ainda separam corretamente", () => {
  const blocks = splitIntoBlocks("Bloco A\n\n\n\nBloco B");
  assert.deepEqual(blocks, ["Bloco A", "Bloco B"]);
});

test("splitIntoBlocks: blocos vazios (linhas em branco no início/fim) são descartados", () => {
  const blocks = splitIntoBlocks("\n\nBloco único\n\n");
  assert.deepEqual(blocks, ["Bloco único"]);
});

test("INSERIR NA ATIVIDADE N: reconhece o cabeçalho e extrai o número alvo + texto a anexar", () => {
  const text = "INSERIR NA ATIVIDADE 1:\n\n- 93 sementes de aroeira plantadas\n- 156 sementes de pau-brasil plantadas";
  const result = parseExplicitActivityCommand(text);
  assert.equal(result.type, "COMPLEMENTO");
  assert.equal(result.targetNumero, 1);
  assert.equal(result.texto, "- 93 sementes de aroeira plantadas\n- 156 sementes de pau-brasil plantadas");
});

test("ADICIONAR À ATIVIDADE N: (com acento) reconhece o mesmo comando de complemento", () => {
  const result = parseExplicitActivityCommand("ADICIONAR À ATIVIDADE 2:\nComplemento simples.");
  assert.equal(result.type, "COMPLEMENTO");
  assert.equal(result.targetNumero, 2);
  assert.equal(result.texto, "Complemento simples.");
});

test("ADICIONAR A ATIVIDADE N: (sem acento, digitação comum no celular) também é reconhecido", () => {
  const result = parseExplicitActivityCommand("adicionar a atividade 3:\nTexto sem acento.");
  assert.equal(result.type, "COMPLEMENTO");
  assert.equal(result.targetNumero, 3);
});

test("mensagem comum (sem nenhum cabeçalho) retorna null — segue o caminho normal da IA", () => {
  assert.equal(parseExplicitActivityCommand("Bom dia, equipe! Hoje choveu de manhã."), null);
  assert.equal(parseExplicitActivityCommand("Atividade concluída com sucesso."), null);
});

test("mensagem vazia/nula nunca lança — retorna null", () => {
  assert.equal(parseExplicitActivityCommand(""), null);
  assert.equal(parseExplicitActivityCommand(null), null);
  assert.equal(parseExplicitActivityCommand(undefined), null);
});

test("cabeçalho de complemento sem número não é reconhecido como COMPLEMENTO (nunca gera NaN silencioso)", () => {
  assert.equal(parseExplicitActivityCommand("INSERIR NA ATIVIDADE:\nTexto qualquer."), null);
});
