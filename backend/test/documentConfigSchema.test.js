"use strict";

/**
 * Testes do schema Zod dos dados documentais (Bloco 7B/12) — foco nos
 * campos novos do Bloco 12 (`tituloRdf`, `rodapeInstitucional`), sempre
 * opcionais (obrigatoriedade real é responsabilidade de
 * `documentPrerequisites.js`, não deste schema).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { DocumentConfigSchema } = require("../src/modules/automations/documents/documentConfigSchema");

test("aceita objeto vazio — tituloRdf/rodapeInstitucional são opcionais", () => {
  const result = DocumentConfigSchema.safeParse({});
  assert.equal(result.success, true);
});

test("aceita tituloRdf configurado", () => {
  const result = DocumentConfigSchema.safeParse({ tituloRdf: "ATIVIDADES PRESIDENTE KENNEDY - Porto Central" });
  assert.equal(result.success, true);
  assert.equal(result.data.tituloRdf, "ATIVIDADES PRESIDENTE KENNEDY - Porto Central");
});

test("rejeita tituloRdf vazio quando informado (min 1)", () => {
  const result = DocumentConfigSchema.safeParse({ tituloRdf: "" });
  assert.equal(result.success, false);
});

test("aceita rodapeInstitucional completo", () => {
  const result = DocumentConfigSchema.safeParse({
    rodapeInstitucional: {
      assinanteEsquerda: "PORTO CENTRAL",
      razaoSocialCompleta: "PORTO CENTRAL COMPLEXO INDUSTRIAL PORTUÁRIO S.A",
      endereco: "Rua Projetada, s/n, Praia de Marobá, Presidente Kennedy/ES",
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.data.rodapeInstitucional.assinanteEsquerda, "PORTO CENTRAL");
});

test("aceita rodapeInstitucional parcial (cada sub-campo é independentemente opcional)", () => {
  const result = DocumentConfigSchema.safeParse({ rodapeInstitucional: { assinanteEsquerda: "Só este campo" } });
  assert.equal(result.success, true);
  assert.equal(result.data.rodapeInstitucional.assinanteEsquerda, "Só este campo");
  assert.equal(result.data.rodapeInstitucional.razaoSocialCompleta, undefined);
});

test("rejeita rodapeInstitucional com sub-campo vazio quando informado", () => {
  const result = DocumentConfigSchema.safeParse({ rodapeInstitucional: { endereco: "" } });
  assert.equal(result.success, false);
});

test("rejeita rodapeInstitucional além do tamanho máximo do endereço", () => {
  const result = DocumentConfigSchema.safeParse({ rodapeInstitucional: { endereco: "a".repeat(256) } });
  assert.equal(result.success, false);
});

test("continua validando os campos pré-existentes normalmente (Bloco 7B) junto dos novos", () => {
  const result = DocumentConfigSchema.safeParse({
    referenciaContratual: "Contrato 01/2026",
    local: "Canteiro Central",
    clienteRazaoSocial: "Cliente LTDA",
    clienteEndereco: "Rua X, 1",
    expedienteInicio: "07:00",
    expedienteFim: "17:00",
    tituloRdf: "ATIVIDADES — Canteiro Central",
    rodapeInstitucional: { assinanteEsquerda: "CONTRATANTE" },
  });
  assert.equal(result.success, true);
});
