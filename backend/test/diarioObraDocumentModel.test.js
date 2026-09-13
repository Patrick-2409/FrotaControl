"use strict";

/**
 * Testes unitários (sem banco/rede) da camada pura de montagem do documento
 * (Bloco 7B) — ordenação cronológica de fatos, dedup, política de
 * conflito/aviso/ausência (Seções 14-19), resolução de legenda de foto
 * (Seções 25-27) e o teto de segurança de overflow (Seção 21).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDiarioObraDocumentModel,
  buildActivities,
  buildPhotos,
  dedupeFacts,
  compareNumericIdStrings,
} = require("../src/modules/automations/documents/diarioObraDocumentModel");
const { DocumentError } = require("../src/modules/automations/documents/documentErrorClassification");
const { MAX_ACTIVITY_TEXT_LENGTH, MAX_ACTIVITIES_TOTAL } = require("../src/modules/automations/documents/diarioObraLayoutConstants");

function msg({ id, timestamp, type = "TEXT", caption = null, photo = null }) {
  return { telegramMessageId: id, timestamp, type, caption, photo };
}

test("compareNumericIdStrings: compara como BigInt, nunca como string/number", () => {
  assert.equal(compareNumericIdStrings("999999999999999999", "1000000000000000000") < 0, true);
  assert.equal(compareNumericIdStrings("100", "20") > 0, true, "comparação numérica correta, não alfabética");
  assert.equal(compareNumericIdStrings("50", "50"), 0);
});

test("dedupeFacts: remove duplicatas por texto normalizado (case/trim-insensitive), preserva ordem da primeira ocorrência", () => {
  const facts = [
    { statement: "Serviço concluído." },
    { statement: "  serviço concluído.  " },
    { statement: "Outra atividade." },
  ];
  const result = dedupeFacts(facts);
  assert.equal(result.length, 2);
  assert.equal(result[0].statement, "Serviço concluído.");
  assert.equal(result[1].statement, "Outra atividade.");
});

test("buildActivities: fatos são ordenados pela evidência cronológica MAIS ANTIGA, nunca pela ordem de input nem alfabeticamente", () => {
  const snapshot = {
    messages: [
      msg({ id: "300", timestamp: "2026-09-07T14:00:00.000Z" }),
      msg({ id: "100", timestamp: "2026-09-07T08:00:00.000Z" }),
      msg({ id: "200", timestamp: "2026-09-07T10:00:00.000Z" }),
    ],
  };
  const structuredOutput = {
    facts: [
      { statement: "Zebra: atividade da tarde.", sourceRefs: ["300"] },
      { statement: "Alfa: atividade da manhã.", sourceRefs: ["100"] },
      { statement: "Meio-dia: atividade intermediária.", sourceRefs: ["200"] },
    ],
  };
  const items = buildActivities(structuredOutput, snapshot);
  assert.deepEqual(items.map((i) => i.texto), [
    "Alfa: atividade da manhã.",
    "Meio-dia: atividade intermediária.",
    "Zebra: atividade da tarde.",
  ]);
  assert.deepEqual(items.map((i) => i.numero), [1, 2, 3]);
});

test("buildActivities: conflicts e warnings nunca aparecem como fato — sempre com prefixo dedicado, sempre depois dos fatos", () => {
  const snapshot = { messages: [msg({ id: "1", timestamp: "2026-09-07T08:00:00.000Z" })] };
  const structuredOutput = {
    facts: [{ statement: "Atividade normal.", sourceRefs: ["1"] }],
    conflicts: [{ description: "Duas mensagens divergem sobre o horário." }],
    warnings: ["Chuva forte relatada à tarde."],
    missingInformation: [],
  };
  const items = buildActivities(structuredOutput, snapshot);
  assert.deepEqual(
    items.map((i) => i.texto),
    ["Atividade normal.", "Observação: Duas mensagens divergem sobre o horário.", "Atenção: Chuva forte relatada à tarde."]
  );
  assert.equal(items[0].tipo, "FACT");
  assert.equal(items[1].tipo, "WARNING");
  assert.equal(items[2].tipo, "WARNING");
});

test("buildActivities: informação ausente única usa singular, múltipla é agrupada numa única linha (nunca dezenas de linhas artificiais)", () => {
  const snapshot = { messages: [] };
  const single = buildActivities({ facts: [], missingInformation: [{ description: "Condição climática" }] }, snapshot);
  assert.equal(single[0].texto, "Não informado: Condição climática");

  const multiple = buildActivities(
    { facts: [], missingInformation: [{ description: "Condição climática" }, { description: "Quantitativo de equipe" }] },
    snapshot
  );
  assert.equal(multiple.length, 1, "múltiplas ausências viram UMA única linha agrupada");
  assert.equal(multiple[0].texto, "Não informados: Condição climática; Quantitativo de equipe");
});

test("buildActivities: fato sem sourceRef resolvível nunca quebra — vai para o final, não para o início", () => {
  const snapshot = { messages: [msg({ id: "1", timestamp: "2026-09-07T08:00:00.000Z" })] };
  const structuredOutput = {
    facts: [
      { statement: "Sem referência.", sourceRefs: ["ref-inexistente"] },
      { statement: "Com referência real.", sourceRefs: ["1"] },
    ],
  };
  const items = buildActivities(structuredOutput, snapshot);
  assert.deepEqual(items.map((i) => i.texto), ["Com referência real.", "Sem referência."]);
});

test("buildActivities: excede MAX_ACTIVITIES_TOTAL lança DocumentError DOCUMENT_LAYOUT_OVERFLOW", () => {
  const facts = Array.from({ length: MAX_ACTIVITIES_TOTAL + 1 }, (_, i) => ({ statement: `Atividade distinta ${i}`, sourceRefs: [] }));
  assert.throws(
    () => buildActivities({ facts }, { messages: [] }),
    (err) => err instanceof DocumentError && err.code === "DOCUMENT_LAYOUT_OVERFLOW"
  );
});

test("buildActivities: um único item além de MAX_ACTIVITY_TEXT_LENGTH lança DocumentError DOCUMENT_LAYOUT_OVERFLOW", () => {
  const longText = "x".repeat(MAX_ACTIVITY_TEXT_LENGTH + 1);
  assert.throws(
    () => buildActivities({ facts: [{ statement: longText, sourceRefs: [] }] }, { messages: [] }),
    (err) => err instanceof DocumentError && err.code === "DOCUMENT_LAYOUT_OVERFLOW"
  );
});

test("buildPhotos: preserva a ordem cronológica já correta do snapshot (nunca reordena)", () => {
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "t1", type: "PHOTO", photo: { stored: true, driveFileId: "drive-1" } }),
      msg({ id: "2", timestamp: "t2", type: "TEXT" }),
      msg({ id: "3", timestamp: "t3", type: "PHOTO", photo: { stored: true, driveFileId: "drive-3" } }),
    ],
  };
  const photos = buildPhotos(snapshot, { arquivosByDriveFileId: new Map(), photoObservationsByRef: new Map() });
  assert.equal(photos.length, 2);
  assert.deepEqual(photos.map((p) => p.driveFileId), ["drive-1", "drive-3"]);
  assert.deepEqual(photos.map((p) => p.numero), [1, 2]);
});

test("buildPhotos: foto com falha/sem armazenamento definitivo nunca inventa imagem — marca INDISPONIVEL mas conta na rastreabilidade", () => {
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "t1", type: "PHOTO", photo: { stored: false, failed: true, driveFileId: null } }),
      msg({ id: "2", timestamp: "t2", type: "PHOTO", photo: { stored: true, driveFileId: "drive-2" } }),
    ],
  };
  const photos = buildPhotos(snapshot, { arquivosByDriveFileId: new Map([["drive-2", { id: 42 }]]), photoObservationsByRef: new Map() });
  assert.equal(photos[0].disponivel, false);
  assert.equal(photos[0].legendaTipo, "INDISPONIVEL");
  assert.equal(photos[0].arquivoId, null);
  assert.equal(photos[1].disponivel, true);
  assert.equal(photos[1].arquivoId, 42);
});

test("legenda de foto: prioridade é caption original > descrição automática (com prefixo) > ausente", () => {
  const arquivosByDriveFileId = new Map([
    ["drive-original", { id: 1 }],
    ["drive-auto", { id: 2 }],
    ["drive-ausente", { id: 3 }],
  ]);
  const photoObservationsByRef = new Map([["drive-auto", { description: "Equipamento visível na cena." }]]);
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "t1", type: "PHOTO", caption: "Legenda original do operador.", photo: { stored: true, driveFileId: "drive-original" } }),
      msg({ id: "2", timestamp: "t2", type: "PHOTO", photo: { stored: true, driveFileId: "drive-auto" } }),
      msg({ id: "3", timestamp: "t3", type: "PHOTO", photo: { stored: true, driveFileId: "drive-ausente" } }),
    ],
  };
  const photos = buildPhotos(snapshot, { arquivosByDriveFileId, photoObservationsByRef });
  assert.equal(photos[0].legenda, "Legenda original do operador.");
  assert.equal(photos[0].legendaTipo, "ORIGINAL");
  assert.equal(photos[1].legenda, "Descrição visual automática: Equipamento visível na cena.");
  assert.equal(photos[1].legendaTipo, "AUTOMATICA");
  assert.equal(photos[2].legenda, "Sem legenda informada.");
  assert.equal(photos[2].legendaTipo, "AUSENTE");
});

test("buildDiarioObraDocumentModel: monta o objeto final com identification/activities/photos/signature/metadata coerentes", () => {
  const config = {
    projeto_nome: "Obra Central",
    configuracao: {
      documento: {
        referenciaContratual: "Contrato 01/2026",
        local: "Canteiro A",
        clienteRazaoSocial: "Cliente LTDA",
        clienteEndereco: "Rua X, 1",
        responsavelTecnico: "Eng. Ana",
      },
    },
  };
  const execucao = { id: 10 };
  const snapshot = {
    id: 20,
    snapshot_hash: "hash-snap",
    snapshot: {
      referenceDate: "2026-09-07",
      messages: [msg({ id: "1", timestamp: "2026-09-07T08:00:00.000Z" })],
    },
  };
  const intelligence = {
    id: 30,
    output_hash: "hash-intel",
    structured_output: { facts: [{ statement: "Atividade única.", sourceRefs: ["1"] }] },
  };
  const template = { id: 40, codigo: "diario_obra_ppflora", versao: 1 };

  const model = buildDiarioObraDocumentModel({
    config,
    execucao,
    snapshot,
    intelligence,
    arquivosByDriveFileId: new Map(),
    template,
    documentVersion: 1,
    generatorId: "diario_obra_ppflora_v1",
  });

  assert.equal(model.identification.projetoNome, "Obra Central");
  assert.equal(model.identification.referenciaContratual, "Contrato 01/2026");
  assert.equal(model.identification.expedienteEhDefaultDoTemplate, true);
  assert.equal(model.activities.length, 1);
  assert.equal(model.activities[0].texto, "Atividade única.");
  assert.equal(model.signature.responsavelTecnico, "Eng. Ana");
  assert.equal(model.metadata.executionId, 10);
  assert.equal(model.metadata.snapshotId, 20);
  assert.equal(model.metadata.intelligenceId, 30);
  assert.equal(model.metadata.templateId, 40);
  assert.equal(model.metadata.documentVersion, 1);
});

test("buildDiarioObraDocumentModel: expediente explícito na config nunca é marcado como default do template", () => {
  const config = {
    projeto_nome: "Obra X",
    configuracao: { documento: { expedienteInicio: "08:00", expedienteFim: "18:00" } },
  };
  const model = buildDiarioObraDocumentModel({
    config,
    execucao: { id: 1 },
    snapshot: { id: 1, snapshot_hash: "h", snapshot: { referenceDate: "2026-09-07", messages: [] } },
    intelligence: { id: 1, output_hash: "h", structured_output: { facts: [] } },
    arquivosByDriveFileId: new Map(),
    template: { id: 1, codigo: "diario_obra_ppflora", versao: 1 },
    documentVersion: 1,
    generatorId: "diario_obra_ppflora_v1",
  });
  assert.equal(model.identification.expedienteInicio, "08:00");
  assert.equal(model.identification.expedienteFim, "18:00");
  assert.equal(model.identification.expedienteEhDefaultDoTemplate, false);
});

test("test-narrative-leak: o texto das atividades vem EXCLUSIVAMENTE de structured_output — texto bruto do snapshot nunca aparece sozinho", () => {
  const snapshot = {
    messages: [msg({ id: "1", timestamp: "2026-09-07T08:00:00.000Z" })],
  };
  snapshot.messages[0].text = "texto bruto original da mensagem do Telegram, nunca deveria aparecer no documento";
  const structuredOutput = { facts: [{ statement: "Resumo estruturado pela IA.", sourceRefs: ["1"] }] };
  const items = buildActivities(structuredOutput, snapshot);
  assert.equal(items.length, 1);
  assert.equal(items[0].texto, "Resumo estruturado pela IA.");
  assert.ok(!items.some((i) => i.texto.includes("texto bruto original")), "texto bruto do snapshot nunca deveria vazar para o documento");
});
