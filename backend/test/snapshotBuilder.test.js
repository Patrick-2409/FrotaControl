"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canonicalStringify,
  computeSnapshotHash,
  buildMessageSnapshot,
  computeMetrics,
  SNAPSHOT_FORMAT_VERSION,
} = require("../src/modules/automations/closing/snapshotBuilder");

// ------------------------------------------------------- serialização canônica / hash

test("canonicalStringify ordena chaves alfabeticamente em qualquer profundidade", () => {
  const a = canonicalStringify({ b: 1, a: { d: 2, c: 3 } });
  const b = canonicalStringify({ a: { c: 3, d: 2 }, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":{"c":3,"d":2},"b":1}');
});

test("computeSnapshotHash é insensível à ordem de inserção das chaves (serialização canônica de verdade)", () => {
  const snapshotA = { version: 1, referenceDate: "2026-02-14", timezone: "America/Sao_Paulo", messages: [] };
  const snapshotB = { timezone: "America/Sao_Paulo", messages: [], version: 1, referenceDate: "2026-02-14" };
  assert.equal(computeSnapshotHash(snapshotA), computeSnapshotHash(snapshotB));
});

test("dois snapshots logicamente iguais (mesma ordem de mensagens) geram o mesmo hash", () => {
  const messages = [buildMessageSnapshot(fakeRow({ message_id: "1", texto: "oi" }))];
  const snapshotA = { version: 1, referenceDate: "2026-02-14", timezone: "tz", messages };
  const snapshotB = { version: 1, referenceDate: "2026-02-14", timezone: "tz", messages: [...messages] };
  assert.equal(computeSnapshotHash(snapshotA), computeSnapshotHash(snapshotB));
});

test("mudar o texto de uma mensagem muda o hash", () => {
  const base = { version: 1, referenceDate: "2026-02-14", timezone: "tz", messages: [buildMessageSnapshot(fakeRow({ texto: "A" }))] };
  const changed = { version: 1, referenceDate: "2026-02-14", timezone: "tz", messages: [buildMessageSnapshot(fakeRow({ texto: "B" }))] };
  assert.notEqual(computeSnapshotHash(base), computeSnapshotHash(changed));
});

test("mudar o driveFileId de uma foto muda o hash (mudança de mídia é uma mudança de dado)", () => {
  const rowA = fakeRow({ tipo: "PHOTO", storage_status: "COMPLETED", drive_file_id: "arquivo-1" });
  const rowB = fakeRow({ tipo: "PHOTO", storage_status: "COMPLETED", drive_file_id: "arquivo-2" });
  const a = { version: 1, referenceDate: "d", timezone: "tz", messages: [buildMessageSnapshot(rowA)] };
  const b = { version: 1, referenceDate: "d", timezone: "tz", messages: [buildMessageSnapshot(rowB)] };
  assert.notEqual(computeSnapshotHash(a), computeSnapshotHash(b));
});

test("computeSnapshotHash produz sempre um hex SHA-256 (64 caracteres)", () => {
  const hash = computeSnapshotHash({ version: 1, referenceDate: "d", timezone: "tz", messages: [] });
  assert.match(hash, /^[0-9a-f]{64}$/);
});

function fakeRow(overrides = {}) {
  return {
    message_id: "1000",
    telegram_user_id: "555",
    autor_nome: "João",
    telegram_username: "joaofiscal",
    data_hora_original: new Date("2026-02-14T11:05:00.000Z"),
    tipo: "TEXT",
    texto: "Serviço concluído",
    caption: null,
    media_group_id: null,
    telegram_file_unique_id: null,
    storage_status: null,
    storage_last_error: null,
    drive_file_id: null,
    ...overrides,
  };
}

// ------------------------------------------------------------------- buildMessageSnapshot

test("buildMessageSnapshot: mensagem TEXT preserva text e caption separadamente, nunca concatena", () => {
  const msg = buildMessageSnapshot(fakeRow({ texto: "texto original", caption: null }));
  assert.equal(msg.text, "texto original");
  assert.equal(msg.caption, null);
  assert.equal(msg.effectiveText, "texto original");
});

test("buildMessageSnapshot: caption preservada quando não há texto (effectiveText cai pra caption)", () => {
  const msg = buildMessageSnapshot(fakeRow({ tipo: "PHOTO", texto: null, caption: "legenda da foto" }));
  assert.equal(msg.text, null);
  assert.equal(msg.caption, "legenda da foto");
  assert.equal(msg.effectiveText, "legenda da foto");
});

test("buildMessageSnapshot: media_group_id preservado quando presente", () => {
  const msg = buildMessageSnapshot(fakeRow({ tipo: "PHOTO", media_group_id: "album-xyz" }));
  assert.equal(msg.mediaGroupId, "album-xyz");
});

test("buildMessageSnapshot: author reflete telegram_user_id/autor_nome/username", () => {
  const msg = buildMessageSnapshot(fakeRow({ telegram_user_id: "999", autor_nome: "Maria", telegram_username: "mariafiscal" }));
  assert.deepEqual(msg.author, { id: "999", name: "Maria", username: "mariafiscal" });
});

test("buildMessageSnapshot: telegramMessageId nunca perde precisão (vem de BIGINT como string)", () => {
  const msg = buildMessageSnapshot(fakeRow({ message_id: "99999999999999999" }));
  assert.equal(msg.telegramMessageId, "99999999999999999");
  assert.equal(typeof msg.telegramMessageId, "string");
});

test("buildMessageSnapshot: foto armazenada (COMPLETED) marca stored=true com driveFileId", () => {
  const msg = buildMessageSnapshot(
    fakeRow({ tipo: "PHOTO", storage_status: "COMPLETED", drive_file_id: "drive-1", telegram_file_unique_id: "u1" })
  );
  assert.deepEqual(msg.photo, { stored: true, driveFileId: "drive-1", fileUniqueId: "u1", failed: false, failureReason: null });
});

test("buildMessageSnapshot: foto com erro definitivo (FAILED) nunca bloqueia — registra falha com motivo saneado", () => {
  const msg = buildMessageSnapshot(
    fakeRow({ tipo: "PHOTO", storage_status: "FAILED", storage_last_error: "Arquivo excede limite configurado" })
  );
  assert.equal(msg.photo.stored, false);
  assert.equal(msg.photo.failed, true);
  assert.equal(msg.photo.failureReason, "Arquivo excede limite configurado");
  assert.equal(msg.photo.driveFileId, null);
});

test("buildMessageSnapshot: nunca inclui bytes/binário da foto — só metadados", () => {
  const msg = buildMessageSnapshot(fakeRow({ tipo: "PHOTO", storage_status: "COMPLETED", drive_file_id: "d1" }));
  const json = JSON.stringify(msg);
  assert.ok(!json.includes("buffer"));
  assert.ok(json.length < 1000, "mensagem individual deve ser pequena — só metadados, nunca payload de imagem");
});

test("buildMessageSnapshot: mensagem TEXT/DOCUMENT nunca tem campo photo preenchido", () => {
  assert.equal(buildMessageSnapshot(fakeRow({ tipo: "TEXT" })).photo, null);
  assert.equal(buildMessageSnapshot(fakeRow({ tipo: "DOCUMENT" })).photo, null);
});

// -------------------------------------------------------------------------- metrics

test("computeMetrics: conta mensagens/texto/fotos corretamente", () => {
  const messages = [
    buildMessageSnapshot(fakeRow({ tipo: "TEXT" })),
    buildMessageSnapshot(fakeRow({ tipo: "TEXT" })),
    buildMessageSnapshot(fakeRow({ tipo: "PHOTO", storage_status: "COMPLETED" })),
    buildMessageSnapshot(fakeRow({ tipo: "PHOTO", storage_status: "FAILED" })),
    buildMessageSnapshot(fakeRow({ tipo: "PHOTO", storage_status: "PENDING" })),
  ];
  const metrics = computeMetrics(messages);
  assert.equal(metrics.messagesTotal, 5);
  assert.equal(metrics.textMessagesTotal, 2);
  assert.equal(metrics.photosTotal, 3);
  assert.equal(metrics.photosStored, 1);
  assert.equal(metrics.photosFailedPermanent, 1);
});

test("computeMetrics: conta media_groups_total distintos, não fotos por álbum", () => {
  const messages = [
    buildMessageSnapshot(fakeRow({ tipo: "PHOTO", media_group_id: "album-1", storage_status: "COMPLETED" })),
    buildMessageSnapshot(fakeRow({ tipo: "PHOTO", media_group_id: "album-1", storage_status: "COMPLETED" })),
    buildMessageSnapshot(fakeRow({ tipo: "PHOTO", media_group_id: "album-2", storage_status: "COMPLETED" })),
    buildMessageSnapshot(fakeRow({ tipo: "TEXT" })),
  ];
  const metrics = computeMetrics(messages);
  assert.equal(metrics.mediaGroupsTotal, 2);
  assert.equal(metrics.photosTotal, 3);
});

test("SNAPSHOT_FORMAT_VERSION é 1 e é um número (campo interno do JSON, distinto da versão da execução)", () => {
  assert.equal(SNAPSHOT_FORMAT_VERSION, 1);
  assert.equal(typeof SNAPSHOT_FORMAT_VERSION, "number");
});
