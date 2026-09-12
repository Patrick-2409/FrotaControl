"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  yearFolderName,
  monthFolderName,
  dayFolderName,
  photoFileName,
  parseDataReferencia,
  DIARIOS_DE_OBRA_FOLDER_NAME,
  PHOTOS_FOLDER_NAME,
  MESES_PT_BR,
} = require("../src/modules/automations/storage/folderNaming");

test("yearFolderName extrai o ano de uma data_referencia YYYY-MM-DD", () => {
  assert.equal(yearFolderName("2026-02-14"), "2026");
});

test("monthFolderName usa nome do mês em pt-BR determinístico, sem depender de locale do runtime", () => {
  assert.equal(monthFolderName("2026-02-14"), "02 - Fevereiro");
  assert.equal(monthFolderName("2026-01-01"), "01 - Janeiro");
  assert.equal(monthFolderName("2026-12-31"), "12 - Dezembro");
});

test("MESES_PT_BR tem exatamente 12 nomes, todos distintos", () => {
  assert.equal(MESES_PT_BR.length, 12);
  assert.equal(new Set(MESES_PT_BR).size, 12);
});

test("dayFolderName usa a própria data_referencia, nunca a hora atual do servidor", () => {
  assert.equal(dayFolderName("2026-02-14"), "2026-02-14");
});

test("photoFileName é determinístico: mesma data_referencia + mesmo message_id => mesmo nome sempre", () => {
  const a = photoFileName({ dataReferencia: "2026-02-14", telegramMessageId: "12345", extension: "jpg" });
  const b = photoFileName({ dataReferencia: "2026-02-14", telegramMessageId: "12345", extension: "jpg" });
  assert.equal(a, b);
  assert.equal(a, "2026-02-14_msg-12345.jpg");
});

test("photoFileName normaliza extensão (maiúscula, com ponto) para minúscula sem ponto", () => {
  const name = photoFileName({ dataReferencia: "2026-02-14", telegramMessageId: "1", extension: ".JPG" });
  assert.equal(name, "2026-02-14_msg-1.jpg");
});

test("photoFileName usa jpg como fallback se extensão vier vazia", () => {
  const name = photoFileName({ dataReferencia: "2026-02-14", telegramMessageId: "1", extension: "" });
  assert.equal(name, "2026-02-14_msg-1.jpg");
});

test("photoFileName lança erro claro sem telegramMessageId", () => {
  assert.throws(
    () => photoFileName({ dataReferencia: "2026-02-14", telegramMessageId: null, extension: "jpg" }),
    /telegramMessageId/
  );
});

test("parseDataReferencia rejeita string em formato errado", () => {
  assert.throws(() => parseDataReferencia("14/02/2026"), /data_referencia inválida/);
  assert.throws(() => parseDataReferencia("2026-2-14"), /data_referencia inválida/);
});

test("parseDataReferencia rejeita um objeto Date (nunca deve receber um, ver aviso no arquivo)", () => {
  assert.throws(() => parseDataReferencia(new Date("2026-02-14T00:00:00Z")), /data_referencia inválida/);
});

test("parseDataReferencia rejeita mês fora do intervalo 01-12", () => {
  assert.throws(() => yearFolderName("2026-13-01"), /mês inválido/);
  assert.throws(() => monthFolderName("2026-00-01"), /mês inválido/);
});

test("nomes de pastas fixas são estáveis (nunca recalculados dinamicamente)", () => {
  assert.equal(DIARIOS_DE_OBRA_FOLDER_NAME, "Diários de Obra");
  assert.equal(PHOTOS_FOLDER_NAME, "Fotos");
});
