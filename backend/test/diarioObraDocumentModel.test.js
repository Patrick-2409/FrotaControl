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
  buildActivityTextsFromPhotos,
  stripLeadingListNumber,
  buildPhotos,
  dedupeFacts,
  normalizeActivityKey,
  resolveClima,
  compareNumericIdStrings,
  resolveTituloRdf,
  resolveRodapeInstitucional,
} = require("../src/modules/automations/documents/diarioObraDocumentModel");
const { FIXED_TEXT: FIXED_TEXT_V2 } = require("../src/modules/automations/documents/diarioObraLayoutConstantsV2");
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

// CASO A (Bloco 12) — deduplicação determinística mais robusta: espaços
// duplicados e pontuação final também são normalizados, nunca só case/trim.
test("normalizeActivityKey: colapsa espaços duplicados e remove pontuação final, além de case/trim", () => {
  assert.equal(normalizeActivityKey("Irrigação do canteiro"), normalizeActivityKey("  Irrigação   do    canteiro.  "));
  assert.equal(normalizeActivityKey("Irrigação do canteiro!"), normalizeActivityKey("irrigação do canteiro"));
  assert.equal(normalizeActivityKey("Coleta de material; "), normalizeActivityKey("Coleta de material"));
});

test("dedupeFacts: também deduplica diferenças de espaçamento e pontuação final (não só case/trim)", () => {
  const facts = [
    { statement: "Irrigação do canteiro." },
    { statement: "Irrigação   do canteiro" },
    { statement: "Irrigação do canteiro!" },
    { statement: "Manutenção do viveiro." },
  ];
  const result = dedupeFacts(facts);
  assert.equal(result.length, 2);
  assert.equal(result[0].statement, "Irrigação do canteiro.");
  assert.equal(result[1].statement, "Manutenção do viveiro.");
});

// CASO A completo — 3 fotos com a mesma legenda + 1 diferente, exatamente o
// cenário do enunciado da correção de linhagem: a fonte é a LEGENDA ORIGINAL
// da foto no snapshot, NUNCA `structuredOutput.facts` (que pode parafrasear).
test("buildActivities CASO A: 3 legendas de foto idênticas viram 1 atividade só, com o TEXTO ORIGINAL da primeira foto (nunca reescrito)", () => {
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "2026-09-14T08:00:00.000Z", type: "PHOTO", caption: "Irrigação do canteiro.", photo: { stored: true, driveFileId: "d1" } }),
      msg({ id: "2", timestamp: "2026-09-14T08:05:00.000Z", type: "PHOTO", caption: "Irrigação do canteiro", photo: { stored: true, driveFileId: "d2" } }),
      msg({ id: "3", timestamp: "2026-09-14T08:10:00.000Z", type: "PHOTO", caption: "IRRIGAÇÃO DO CANTEIRO!", photo: { stored: true, driveFileId: "d3" } }),
      msg({ id: "4", timestamp: "2026-09-14T09:00:00.000Z", type: "PHOTO", caption: "Manutenção do viveiro.", photo: { stored: true, driveFileId: "d4" } }),
    ],
  };
  // structuredOutput.facts propositalmente com um texto DIFERENTE do caption
  // (simula a IA parafraseando) — nunca deveria influenciar o resultado.
  const structuredOutput = {
    facts: [{ id: "f1", category: "ACTIVITY", statement: "Realização de irrigação no canteiro de obras", sourceRefs: ["1"] }],
  };
  const items = buildActivities(structuredOutput, snapshot);
  assert.equal(items.length, 2, "RDO = lista consolidada e sem repetição");
  assert.equal(items[0].texto, "Irrigação do canteiro.", "texto EXATO da primeira foto — nunca a paráfrase de structuredOutput.facts");
  assert.equal(items[1].texto, "Manutenção do viveiro.");
  assert.deepEqual(items.map((i) => i.numero), [1, 2]);
});

// Seção 6 — mensagem de TEXTO avulsa (sem foto) nunca vira atividade, mesmo
// que a IA a categorize como ACTIVITY em structuredOutput.facts.
test("buildActivities: mensagem de TEXTO avulsa (sem foto) NUNCA vira atividade, mesmo categorizada ACTIVITY pela IA", () => {
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "2026-09-14T08:00:00.000Z", type: "TEXT" }),
      msg({ id: "2", timestamp: "2026-09-14T08:05:00.000Z", type: "PHOTO", caption: "Irrigação do canteiro.", photo: { stored: true, driveFileId: "d2" } }),
    ],
  };
  const structuredOutput = {
    facts: [{ id: "f1", category: "ACTIVITY", statement: "Tempo bom durante o dia", sourceRefs: ["1"] }],
  };
  const items = buildActivities(structuredOutput, snapshot);
  assert.equal(items.length, 1);
  assert.equal(items[0].texto, "Irrigação do canteiro.");
  assert.ok(!items.some((i) => i.texto.toLowerCase().includes("tempo bom")), "mensagem avulsa nunca vira atividade por inferência da IA");
});

test("buildActivities: atividades seguem a ordem de CHEGADA no snapshot (já cronológica — Bloco 5), nunca reordenadas aqui", () => {
  const snapshot = {
    messages: [
      msg({ id: "100", timestamp: "2026-09-07T08:00:00.000Z", type: "PHOTO", caption: "Alfa: atividade da manhã.", photo: { stored: true, driveFileId: "d1" } }),
      msg({ id: "200", timestamp: "2026-09-07T10:00:00.000Z", type: "PHOTO", caption: "Meio-dia: atividade intermediária.", photo: { stored: true, driveFileId: "d2" } }),
      msg({ id: "300", timestamp: "2026-09-07T14:00:00.000Z", type: "PHOTO", caption: "Zebra: atividade da tarde.", photo: { stored: true, driveFileId: "d3" } }),
    ],
  };
  const items = buildActivities({}, snapshot);
  assert.deepEqual(items.map((i) => i.texto), [
    "Alfa: atividade da manhã.",
    "Meio-dia: atividade intermediária.",
    "Zebra: atividade da tarde.",
  ]);
  assert.deepEqual(items.map((i) => i.numero), [1, 2, 3]);
});

test("buildActivities: conflicts e warnings da IA continuam depois das atividades — nunca como fato executado", () => {
  const snapshot = {
    messages: [msg({ id: "1", timestamp: "2026-09-07T08:00:00.000Z", type: "PHOTO", caption: "Atividade normal.", photo: { stored: true, driveFileId: "d1" } })],
  };
  const structuredOutput = {
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

// Seção 7 — o builder numera uma única vez; um caption que já chega com
// numeração manual do operador ("1- ...") nunca vira "1. 1- ...".
test("buildActivities: legenda que já começa com numeração manual não duplica a numeração do builder", () => {
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "2026-09-14T08:00:00.000Z", type: "PHOTO", caption: "1- Atividades diárias de irrigação das mudas;", photo: { stored: true, driveFileId: "d1" } }),
      msg({ id: "2", timestamp: "2026-09-14T08:05:00.000Z", type: "PHOTO", caption: "2- Assinatura diária da APR;", photo: { stored: true, driveFileId: "d2" } }),
    ],
  };
  const items = buildActivities({}, snapshot);
  assert.equal(items[0].texto, "Atividades diárias de irrigação das mudas;");
  assert.equal(items[1].texto, "Assinatura diária da APR;");
  assert.deepEqual(items.map((i) => i.numero), [1, 2]);
});

test("stripLeadingListNumber: só remove número+separador+ESPAÇO no início — nunca números que fazem parte do conteúdo", () => {
  assert.equal(stripLeadingListNumber("1- Atividade X"), "Atividade X");
  assert.equal(stripLeadingListNumber("2. Atividade Y"), "Atividade Y");
  assert.equal(stripLeadingListNumber("10) Atividade Z"), "Atividade Z");
  assert.equal(stripLeadingListNumber("1.5 hectares plantados"), "1.5 hectares plantados", "sem espaço após o separador, nunca é numeração de lista");
  assert.equal(stripLeadingListNumber("Coleta de 3-4 amostras"), "Coleta de 3-4 amostras", "número no MEIO do texto nunca é afetado");
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

test("buildActivities: excede MAX_ACTIVITIES_TOTAL lança DocumentError DOCUMENT_LAYOUT_OVERFLOW", () => {
  const messages = Array.from({ length: MAX_ACTIVITIES_TOTAL + 1 }, (_, i) =>
    msg({ id: String(i), timestamp: `2026-09-07T08:${String(i % 60).padStart(2, "0")}:00.000Z`, type: "PHOTO", caption: `Atividade distinta ${i}`, photo: { stored: true, driveFileId: `d${i}` } })
  );
  assert.throws(
    () => buildActivities({}, { messages }),
    (err) => err instanceof DocumentError && err.code === "DOCUMENT_LAYOUT_OVERFLOW"
  );
});

test("buildActivities: uma única legenda além de MAX_ACTIVITY_TEXT_LENGTH lança DocumentError DOCUMENT_LAYOUT_OVERFLOW", () => {
  const longText = "x".repeat(MAX_ACTIVITY_TEXT_LENGTH + 1);
  const snapshot = { messages: [msg({ id: "1", timestamp: "2026-09-07T08:00:00.000Z", type: "PHOTO", caption: longText, photo: { stored: true, driveFileId: "d1" } })] };
  assert.throws(
    () => buildActivities({}, snapshot),
    (err) => err instanceof DocumentError && err.code === "DOCUMENT_LAYOUT_OVERFLOW"
  );
});

// CASO A/B combinado — mesmo cenário do enunciado (Seção 2/3): 3 fotos com a
// MESMA legenda geram 1 atividade no RDO, mas as 3 fotos e as 3 legendas
// continuam aparecendo no RDF (buildPhotos nunca deduplica — regra DIFERENTE do RDO).
test("CASO B: buildPhotos NUNCA deduplica — 3 fotos com legenda idêntica continuam 3 fotos distintas (uma foto = um registro)", () => {
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "t1", type: "PHOTO", caption: "Irrigação do canteiro", photo: { stored: true, driveFileId: "drive-1" } }),
      msg({ id: "2", timestamp: "t2", type: "PHOTO", caption: "Irrigação do canteiro", photo: { stored: true, driveFileId: "drive-2" } }),
      msg({ id: "3", timestamp: "t3", type: "PHOTO", caption: "Irrigação do canteiro", photo: { stored: true, driveFileId: "drive-3" } }),
    ],
  };
  const photos = buildPhotos(snapshot, { arquivosByDriveFileId: new Map(), photoObservationsByRef: new Map() });
  assert.equal(photos.length, 3, "RDF nunca deduplica — cada foto é seu próprio registro");
  assert.deepEqual(photos.map((p) => p.legenda), ["Irrigação do canteiro", "Irrigação do canteiro", "Irrigação do canteiro"]);
  assert.deepEqual(photos.map((p) => p.numero), [1, 2, 3]);
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
      messages: [msg({ id: "1", timestamp: "2026-09-07T08:00:00.000Z", type: "PHOTO", caption: "Atividade única.", photo: { stored: true, driveFileId: "d1" } })],
    },
  };
  const intelligence = {
    id: 30,
    output_hash: "hash-intel",
    structured_output: { facts: [] },
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

// Correção de linhagem (revisão desta regra): o texto ORIGINAL do Telegram é
// exatamente o que DEVE aparecer — é a paráfrase da IA que nunca pode vazar
// para o documento sozinha, substituindo o caption real.
test("test-narrative-leak (invertido): o texto da atividade vem EXCLUSIVAMENTE do caption ORIGINAL da foto — a paráfrase de structured_output.facts nunca aparece", () => {
  const snapshot = {
    messages: [msg({ id: "1", timestamp: "2026-09-07T08:00:00.000Z", type: "PHOTO", caption: "Coleta de material para análise de solo", photo: { stored: true, driveFileId: "d1" } })],
  };
  const structuredOutput = { facts: [{ statement: "Realização de coleta de material para análise de solo em andamento", sourceRefs: ["1"] }] };
  const items = buildActivities(structuredOutput, snapshot);
  assert.equal(items.length, 1);
  assert.equal(items[0].texto, "Coleta de material para análise de solo", "texto EXATO do caption original do Telegram");
  assert.ok(!items.some((i) => i.texto.includes("Realização de")), "paráfrase da IA nunca deveria vazar para o documento");
});

// --------------------------------------------------------- Bloco 12: tituloRdf / rodapeInstitucional

test("resolveTituloRdf: usa o valor configurado quando presente, nunca o fallback", () => {
  const titulo = resolveTituloRdf({ documento: { tituloRdf: "Título Configurado" }, projetoNome: "Obra X", fixedText: FIXED_TEXT_V2 });
  assert.equal(titulo, "Título Configurado");
});

test("resolveTituloRdf: sem configuração, cai no fallback baseado em local/projeto — NUNCA um nome de cliente fixo", () => {
  const porLocal = resolveTituloRdf({ documento: { local: "Canteiro Central" }, projetoNome: "Obra X", fixedText: FIXED_TEXT_V2 });
  assert.equal(porLocal, "ATIVIDADES — Canteiro Central");

  const porProjeto = resolveTituloRdf({ documento: {}, projetoNome: "Obra X", fixedText: FIXED_TEXT_V2 });
  assert.equal(porProjeto, "ATIVIDADES — Obra X");

  const semNada = resolveTituloRdf({ documento: {}, projetoNome: "", fixedText: FIXED_TEXT_V2 });
  assert.equal(semNada, FIXED_TEXT_V2.tituloRdfFallbackGenerico);
  assert.doesNotMatch(semNada, /porto central|presidente kennedy|ppflora/i);
});

test("resolveRodapeInstitucional: cadeia de fallback EXATA — campo próprio -> clienteRazaoSocial/clienteEndereco -> rótulo neutro", () => {
  const tudoConfigurado = resolveRodapeInstitucional(
    {
      rodapeInstitucional: { assinanteEsquerda: "Assinante Config", razaoSocialCompleta: "Razão Config", endereco: "Endereço Config" },
      clienteRazaoSocial: "Cliente LTDA",
      clienteEndereco: "Rua Cliente, 1",
    },
    FIXED_TEXT_V2
  );
  assert.deepEqual(tudoConfigurado, { assinanteEsquerda: "Assinante Config", razaoSocialCompleta: "Razão Config", endereco: "Endereço Config" });

  const soClienteConfigurado = resolveRodapeInstitucional({ clienteRazaoSocial: "Cliente LTDA", clienteEndereco: "Rua Cliente, 1" }, FIXED_TEXT_V2);
  assert.deepEqual(soClienteConfigurado, { assinanteEsquerda: "Cliente LTDA", razaoSocialCompleta: "Cliente LTDA", endereco: "Rua Cliente, 1" });

  const semNadaConfigurado = resolveRodapeInstitucional({}, FIXED_TEXT_V2);
  assert.equal(semNadaConfigurado.assinanteEsquerda, FIXED_TEXT_V2.rodapeAssinanteFallback);
  assert.equal(semNadaConfigurado.razaoSocialCompleta, "");
  assert.equal(semNadaConfigurado.endereco, "");
  assert.doesNotMatch(JSON.stringify(semNadaConfigurado), /porto central|presidente kennedy|ppflora/i);
});

test("buildDiarioObraDocumentModel: tituloRdf/rodapeInstitucional chegam resolvidos em identification quando fixedText do template v2 é passado", () => {
  const config = {
    projeto_nome: "Obra Central",
    configuracao: {
      documento: {
        local: "Canteiro A",
        clienteRazaoSocial: "Cliente LTDA",
        clienteEndereco: "Rua X, 1",
        tituloRdf: "Título Real Configurado",
      },
    },
  };
  const model = buildDiarioObraDocumentModel({
    config,
    execucao: { id: 1 },
    snapshot: { id: 1, snapshot_hash: "h", snapshot: { referenceDate: "2026-09-07", messages: [] } },
    intelligence: { id: 1, output_hash: "h", structured_output: { facts: [] } },
    arquivosByDriveFileId: new Map(),
    template: { id: 1, codigo: "diario_obra_ppflora_v2", versao: 2 },
    documentVersion: 1,
    generatorId: "diario_obra_ppflora_v2",
    fixedText: FIXED_TEXT_V2,
  });
  assert.equal(model.identification.tituloRdf, "Título Real Configurado");
  assert.equal(model.identification.rodapeInstitucional.assinanteEsquerda, "Cliente LTDA");
  assert.equal(model.identification.rodapeInstitucional.razaoSocialCompleta, "Cliente LTDA");
  assert.equal(model.identification.rodapeInstitucional.endereco, "Rua X, 1");
});

// CASO C/D (Bloco 12) — clima estruturado, separado de atividades.
test("resolveClima: reflete exatamente structuredOutput.clima quando presente", () => {
  const clima = resolveClima({ clima: { manha: "BOM", tarde: "BOM", noite: "BOM" } });
  assert.deepEqual(clima, { manha: "BOM", tarde: "BOM", noite: "BOM" });
});

test("CASO D: 'chuva pela manhã e tempo bom à tarde e à noite' — cada período reflete a condição informada", () => {
  const clima = resolveClima({ clima: { manha: "CHUVAS", tarde: "BOM", noite: "BOM" } });
  assert.equal(clima.manha, "CHUVAS");
  assert.equal(clima.tarde, "BOM");
  assert.equal(clima.noite, "BOM");
});

// Ajuste solicitado pelo usuário (Seção "clima"): quando não há NENHUMA
// evidência de clima (campo ausente — inteligência ANTERIOR ao Bloco 12, ou
// a IA não encontrou nada para relatar), o padrão passa a ser BOM nos 3
// períodos — nunca deixa a célula do formulário em branco.
test("resolveClima: ausência do campo (inteligência ANTERIOR ao Bloco 12, ou nada relatado) nunca quebra — cai em BOM por padrão nos 3 períodos", () => {
  assert.deepEqual(resolveClima({}), { manha: "BOM", tarde: "BOM", noite: "BOM" });
});

test("resolveClima: valor fora do enum conhecido nunca lança — cai no padrão BOM (defensivo)", () => {
  const clima = resolveClima({ clima: { manha: "ENSOLARADO", tarde: "BOM", noite: undefined } });
  assert.equal(clima.manha, "BOM");
  assert.equal(clima.tarde, "BOM");
  assert.equal(clima.noite, "BOM");
});

test("resolveClima: CHUVAS informado só para um período nunca é sobrescrito pelo padrão — os outros dois caem em BOM", () => {
  // Cenário do enunciado: "chuva à tarde" — a IA preenche só tarde=CHUVAS,
  // manhã/noite ficam NAO_INFORMADO (nunca inferidos pela IA) e assumem BOM aqui.
  const clima = resolveClima({ clima: { manha: "NAO_INFORMADO", tarde: "CHUVAS", noite: "NAO_INFORMADO" } });
  assert.deepEqual(clima, { manha: "BOM", tarde: "CHUVAS", noite: "BOM" });
});

test("resolveClima: CHUVAS genérico (sem período específico) preenchido pela IA nos 3 períodos permanece CHUVAS nos 3 (padrão nunca sobrescreve valor real)", () => {
  const clima = resolveClima({ clima: { manha: "CHUVAS", tarde: "CHUVAS", noite: "CHUVAS" } });
  assert.deepEqual(clima, { manha: "CHUVAS", tarde: "CHUVAS", noite: "CHUVAS" });
});

test("buildDiarioObraDocumentModel: clima chega resolvido no model a partir de structured_output.clima", () => {
  const model = buildDiarioObraDocumentModel({
    config: { projeto_nome: "Obra X", configuracao: { documento: {} } },
    execucao: { id: 1 },
    snapshot: { id: 1, snapshot_hash: "h", snapshot: { referenceDate: "2026-09-14", messages: [] } },
    intelligence: { id: 1, output_hash: "h", structured_output: { facts: [], clima: { manha: "BOM", tarde: "BOM", noite: "BOM" } } },
    arquivosByDriveFileId: new Map(),
    template: { id: 1, codigo: "diario_obra_ppflora_v2", versao: 2 },
    documentVersion: 1,
    generatorId: "diario_obra_ppflora_v2",
  });
  assert.deepEqual(model.clima, { manha: "BOM", tarde: "BOM", noite: "BOM" });
});

test("buildDiarioObraDocumentModel: sem fixedText explícito (chamador antigo, ex. v1), usa fallback embutido sem quebrar", () => {
  const model = buildDiarioObraDocumentModel({
    config: { projeto_nome: "Obra X", configuracao: { documento: {} } },
    execucao: { id: 1 },
    snapshot: { id: 1, snapshot_hash: "h", snapshot: { referenceDate: "2026-09-07", messages: [] } },
    intelligence: { id: 1, output_hash: "h", structured_output: { facts: [] } },
    arquivosByDriveFileId: new Map(),
    template: { id: 1, codigo: "diario_obra_ppflora", versao: 1 },
    documentVersion: 1,
    generatorId: "diario_obra_ppflora_v1",
  });
  assert.equal(model.identification.tituloRdf, "ATIVIDADES — Obra X");
  assert.equal(model.identification.rodapeInstitucional.assinanteEsquerda, "CONTRATANTE");
});
