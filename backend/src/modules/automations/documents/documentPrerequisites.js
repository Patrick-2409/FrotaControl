"use strict";

/**
 * Pré-checagem de campos obrigatórios (Bloco 7B, Seções 10/51) — roda ANTES
 * de qualquer claim/custo relevante (nenhuma tentativa de geração começa sem
 * isso passar). Nunca inventa um valor ausente; só relata o que falta.
 */

const REQUIRED_FIELDS = Object.freeze([
  { key: "projeto_nome", label: "Nome do projeto (OBRA)", source: "projeto_nome" },
  { key: "referenciaContratual", label: "Referência contratual", source: "configuracao.documento.referenciaContratual" },
  { key: "local", label: "Local", source: "configuracao.documento.local" },
  { key: "clienteRazaoSocial", label: "Razão social do cliente", source: "configuracao.documento.clienteRazaoSocial" },
  { key: "clienteEndereco", label: "Endereço do cliente", source: "configuracao.documento.clienteEndereco" },
]);

function validateDocumentGenerationPrerequisites(config) {
  const documento = config?.configuracao?.documento || {};
  const missingFields = [];

  if (!String(config?.projeto_nome || "").trim()) {
    missingFields.push(REQUIRED_FIELDS[0]);
  }
  for (const field of REQUIRED_FIELDS.slice(1)) {
    if (!String(documento[field.key] || "").trim()) {
      missingFields.push(field);
    }
  }

  return { valid: missingFields.length === 0, missingFields };
}

module.exports = { validateDocumentGenerationPrerequisites, REQUIRED_FIELDS };
