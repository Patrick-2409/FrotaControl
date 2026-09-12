"use strict";

/**
 * Guarda estrutural do Bloco 7B (Seção 56) — o MOTOR de geração de documento
 * (orquestração + builders Excel/PDF + modelo de documento) precisa
 * permanecer 100% genérico/reutilizável para qualquer automação/template
 * futuro. Só o TEMPLATE v1, especificamente auditado do PPFlora no Bloco 7A
 * (`diarioObraLayoutConstants.js`), pode conhecer o nome "PPFlora" — nenhum
 * outro arquivo do motor pode hardcodar esse (ou qualquer outro) nome de
 * cliente específico.
 *
 * Este teste falha se uma edição futura acidentalmente colar um valor
 * específico de cliente (ex.: copiar/colar um teste ou um exemplo) dentro do
 * código de orquestração — o único lugar permitido para a string "PPFlora" no
 * motor é a constante de auditoria do template v1.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { readFileSync } = require("fs");

const ENGINE_FILES = [
  "../src/modules/automations/documents/documentGenerationService.js",
  "../src/modules/automations/documents/diarioObraDocumentModel.js",
  "../src/modules/automations/documents/diarioObraExcelBuilder.js",
  "../src/modules/automations/documents/diarioObraPdfBuilder.js",
  "../src/modules/automations/documents/documentPrerequisites.js",
  "../src/modules/automations/documents/documentConfigSchema.js",
  "../src/modules/automations/documents/documentErrorClassification.js",
  "../src/modules/automations/documents/documentGenerationConfig.js",
];

// Único arquivo do módulo de documentos autorizado a citar o nome do cliente
// específico auditado no Bloco 7A — é literalmente a definição do template,
// não do motor.
const ALLOWED_TEMPLATE_FILE = "diarioObraLayoutConstants.js";

test("motor de geração de documento nunca hardcoda 'PPFlora' fora da constante de template v1", () => {
  for (const relativePath of ENGINE_FILES) {
    const absolutePath = path.join(__dirname, relativePath);
    const content = readFileSync(absolutePath, "utf8");
    assert.ok(
      !/ppflora/i.test(content),
      `${path.basename(absolutePath)} não deveria conter "PPFlora" — isso pertence exclusivamente a ${ALLOWED_TEMPLATE_FILE}`
    );
  }
});

test("template v1 (diarioObraLayoutConstants.js) é o ÚNICO lugar do motor que referencia o cliente auditado", () => {
  const templatePath = path.join(__dirname, "../src/modules/automations/documents/diarioObraLayoutConstants.js");
  const content = readFileSync(templatePath, "utf8");
  assert.ok(/ppflora/i.test(content), "o arquivo de template v1 deveria mesmo citar a origem da auditoria (Bloco 7A)");
});

test("motor de geração nunca importa nada específico do template diretamente do nome do cliente (só via TEMPLATE_* genérico)", () => {
  const servicePath = path.join(__dirname, "../src/modules/automations/documents/documentGenerationService.js");
  const content = readFileSync(servicePath, "utf8");
  assert.ok(content.includes("TEMPLATE_CODIGO") || content.includes("template.codigo"), "o serviço deveria resolver o template dinamicamente, nunca por um id fixo");
});
