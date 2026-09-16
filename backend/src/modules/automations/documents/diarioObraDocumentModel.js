"use strict";

/**
 * Camada determinística de montagem do Diário de Obra (Bloco 7B, Seção 32) —
 * `buildDiarioObraDocumentModel` é uma função PURA (sem I/O, sem chamada de
 * rede, sem acesso a banco): recebe tudo já resolvido (config, execução,
 * snapshot, inteligência JÁ VALIDADA pelo Bloco 6, arquivos do Drive já
 * consultados) e devolve um objeto único que os builders de Excel e PDF
 * consomem exatamente da mesma forma — nenhuma regra de negócio é duplicada
 * entre os dois formatos (Seção 33).
 *
 * Nunca chama IA (Seção 18/55) — o texto usado vem exclusivamente de
 * `intelligence.structured_output`, já estruturado e validado pelo Bloco 6.
 */

const { DocumentError } = require("./documentErrorClassification");
const { DEFAULT_EXPEDIENTE_INICIO, DEFAULT_EXPEDIENTE_FIM, MAX_ACTIVITY_TEXT_LENGTH, MAX_ACTIVITIES_TOTAL, MAX_PHOTOS_TOTAL } = require("./diarioObraLayoutConstants");

// Bloco 12 — usado só quando o chamador não informa `fixedText` explicitamente
// (compatibilidade com chamadores/testes que não conhecem os rótulos de
// fallback de um template específico). O v1 nunca lê `tituloRdf`/
// `rodapeInstitucional` do modelo, então nunca precisa passar `fixedText`;
// documentGenerationService.js sempre passa o FIXED_TEXT do template ativo.
const DEFAULT_FALLBACK_LABELS = Object.freeze({
  tituloRdfFallbackPrefixo: "ATIVIDADES",
  tituloRdfFallbackGenerico: "REGISTRO DE ATIVIDADES",
  rodapeAssinanteFallback: "CONTRATANTE",
});

function compareNumericIdStrings(a, b) {
  const bigA = BigInt(a ?? "0");
  const bigB = BigInt(b ?? "0");
  if (bigA < bigB) return -1;
  if (bigA > bigB) return 1;
  return 0;
}

/**
 * Chave de normalização usada para decidir se dois textos representam a
 * MESMA atividade (Bloco 12, Seção "deduplicação determinística"): trim,
 * espaços internos colapsados, caixa baixa, e pontuação final removida —
 * nunca depende exclusivamente do julgamento da IA sobre se duas legendas
 * idênticas (a menos de diferenças triviais de formatação) são "a mesma"
 * atividade.
 */
function normalizeActivityKey(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/u, "")
    .toLowerCase();
}

/** Remove duplicatas por texto normalizado, preservando a ORDEM em que os itens chegam (Seção "ordem da primeira ocorrência"). */
function dedupeFacts(facts) {
  const seen = new Set();
  const result = [];
  for (const fact of facts) {
    const key = normalizeActivityKey(fact.statement);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(fact);
  }
  return result;
}

/**
 * Remove um prefixo de numeração de LISTA MANUAL do início do texto — nunca
 * um número que faça parte do conteúdo operacional (Seção 7: "não remover
 * números que realmente façam parte do texto sem critério"). Critério
 * OBJETIVO e único: dígito(s) + separador (- . ou )) + ESPAÇO obrigatório
 * logo em seguida, só no INÍCIO da string. "1.5 hectares" nunca é afetado
 * (falta o espaço logo após o "."); "1- Irrigação..." é afetado (o builder é
 * quem numera, uma vez só — nunca "1. 1- Irrigação...").
 */
function stripLeadingListNumber(text) {
  return String(text || "")
    .replace(/^\s*\d{1,3}\s*[-.)]\s+/, "")
    .trim();
}

/**
 * Fonte PRIMÁRIA e ÚNICA das atividades do RDO (correção de linhagem —
 * "o template nunca é fonte para atividades do dia; a IA nunca escreve o
 * fato operacional"): a LEGENDA ORIGINAL de cada foto do snapshot, EXATAMENTE
 * como chegou do Telegram — nunca `fact.statement` da IA, que pode
 * parafrasear/resumir/reescrever mesmo respeitando o sentido. O snapshot já
 * chega ordenado cronologicamente (Bloco 5: timestamp ASC, message_id ASC),
 * então a ordem de iteração já é a ordem real de chegada — nenhum sort
 * adicional é necessário aqui.
 *
 * Deduplicação por `normalizeActivityKey` (chave normalizada: trim, espaços
 * colapsados, case-insensitive, pontuação final removida) preserva o TEXTO
 * DA PRIMEIRA OCORRÊNCIA cronológica, nunca uma versão reescrita — 3 fotos
 * com a legenda "Irrigação do canteiro" (ou variações triviais de formatação
 * dela) geram UMA linha no RDO com o texto exato da primeira foto que a
 * usou, mas continuam sendo 3 registros distintos no RDF (`buildPhotos`
 * nunca deduplica).
 *
 * Foto SEM legenda nunca vira atividade (não há texto operacional para
 * descrever) — ainda aparece no RDF com o fallback de `resolvePhotoCaption`.
 * Mensagem de TEXTO avulsa (sem foto) também nunca vira atividade aqui —
 * só clima/observação/administrativo/não classificado, nunca por inferência
 * (Seção 6); se um dia isso mudar, será uma regra separada e explícita.
 */
function buildActivityTextsFromPhotos(snapshot) {
  const seen = new Set();
  const textos = [];
  for (const message of snapshot.messages || []) {
    if (message.type !== "PHOTO") continue;
    const captionOriginal = String(message.caption || "").trim();
    if (!captionOriginal) continue;
    const key = normalizeActivityKey(captionOriginal);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    textos.push(stripLeadingListNumber(captionOriginal));
  }
  return textos;
}

/**
 * Sequência final da lista de atividades: 1) legendas originais de foto,
 * deduplicadas e na ordem cronológica de chegada (nunca a IA — ver
 * `buildActivityTextsFromPhotos`), 2) conflicts + warnings da IA (nunca como
 * fato executado — só alertas/observações sobre o dia), 3) missing
 * information (agrupada, nunca dezenas de linhas artificiais). Nunca mistura
 * semanticamente as três categorias.
 */
function buildActivities(structuredOutput, snapshot) {
  const items = [];
  for (const texto of buildActivityTextsFromPhotos(snapshot)) {
    items.push({ tipo: "FACT", texto });
  }
  for (const conflict of structuredOutput.conflicts || []) {
    items.push({ tipo: "WARNING", texto: `Observação: ${conflict.description}` });
  }
  for (const warning of structuredOutput.warnings || []) {
    items.push({ tipo: "WARNING", texto: `Atenção: ${warning}` });
  }
  const missing = structuredOutput.missingInformation || [];
  if (missing.length === 1) {
    items.push({ tipo: "MISSING", texto: `Não informado: ${missing[0].description}` });
  } else if (missing.length > 1) {
    items.push({ tipo: "MISSING", texto: `Não informados: ${missing.map((m) => m.description).join("; ")}` });
  }

  if (items.length > MAX_ACTIVITIES_TOTAL) {
    throw new DocumentError(`Quantidade de itens de atividade (${items.length}) excede o limite de segurança (${MAX_ACTIVITIES_TOTAL}).`, {
      code: "DOCUMENT_LAYOUT_OVERFLOW",
    });
  }
  for (const item of items) {
    if (item.texto.length > MAX_ACTIVITY_TEXT_LENGTH) {
      throw new DocumentError(`Um item de atividade excede o tamanho máximo seguro (${MAX_ACTIVITY_TEXT_LENGTH} caracteres).`, {
        code: "DOCUMENT_LAYOUT_OVERFLOW",
      });
    }
  }

  return items.map((item, index) => ({ numero: index + 1, ...item }));
}

/**
 * Legenda da foto (Seções 25-27): caption original > descrição automática
 * (com prefixo obrigatório, nunca apresentada como se fosse do operador) >
 * "Sem legenda informada." Nunca usa summary/facts sem sourceRef vinculado a
 * ESTA foto especificamente.
 */
function resolvePhotoCaption({ message, photoObservationsByRef }) {
  const captionOriginal = message.caption?.trim();
  if (captionOriginal) {
    return { legenda: captionOriginal, legendaTipo: "ORIGINAL" };
  }
  const observation = message.photo?.driveFileId ? photoObservationsByRef.get(message.photo.driveFileId) : null;
  if (observation?.description?.trim()) {
    return { legenda: `Descrição visual automática: ${observation.description.trim()}`, legendaTipo: "AUTOMATICA" };
  }
  return { legenda: "Sem legenda informada.", legendaTipo: "AUSENTE" };
}

/** Ordem: timestamp Telegram ASC, message_id ASC — já garantida pelo snapshot (Bloco 5), nunca pelo nome do arquivo no Drive (Seção 22). */
function buildPhotos(snapshot, { arquivosByDriveFileId, photoObservationsByRef }) {
  const photoMessages = snapshot.messages.filter((message) => message.type === "PHOTO");
  if (photoMessages.length > MAX_PHOTOS_TOTAL) {
    throw new DocumentError(`Quantidade de fotos (${photoMessages.length}) excede o limite de segurança (${MAX_PHOTOS_TOTAL}).`, {
      code: "DOCUMENT_LAYOUT_OVERFLOW",
    });
  }

  return photoMessages.map((message, index) => {
    // Erro definitivo de armazenamento (Bloco 4) — nunca inventa imagem, mas
    // continua contando na rastreabilidade (Seção 27).
    if (message.photo?.failed || !message.photo?.stored || !message.photo?.driveFileId) {
      return {
        numero: index + 1,
        telegramMessageId: message.telegramMessageId,
        driveFileId: null,
        arquivoId: null,
        legenda: "Imagem indisponível.",
        legendaTipo: "INDISPONIVEL",
        disponivel: false,
      };
    }

    const arquivo = arquivosByDriveFileId.get(message.photo.driveFileId) || null;
    const { legenda, legendaTipo } = resolvePhotoCaption({ message, photoObservationsByRef });
    return {
      numero: index + 1,
      telegramMessageId: message.telegramMessageId,
      driveFileId: message.photo.driveFileId,
      arquivoId: arquivo?.id ?? null,
      legenda,
      legendaTipo,
      disponivel: true,
    };
  });
}

function buildPhotoObservationsByRef(structuredOutput) {
  const map = new Map();
  for (const observation of structuredOutput.photoObservations || []) {
    if (observation?.sourceRef) map.set(observation.sourceRef, observation);
  }
  return map;
}

const WEATHER_CONDITIONS = ["BOM", "CHUVAS", "NAO_INFORMADO"];

/**
 * Bloco 12 — clima por período (manhã/tarde/noite), campo estruturado
 * PRÓPRIO da IA (a interpretação de EVIDÊNCIA — o que foi dito sobre qual
 * período — nunca é feita aqui, é responsabilidade do prompt). Esta função
 * só aplica a regra de PADRÃO (ajuste solicitado pelo usuário, Seção
 * "clima"): quando a IA não teve nenhuma evidência para um período
 * (`NAO_INFORMADO` — inclusive quando o campo inteiro está ausente, caso de
 * `structured_output` de uma inteligência ANTERIOR a este campo existir),
 * o período é marcado BOM por padrão — "se nada foi dito sobre o tempo,
 * assume-se dia normal" — nunca deixa a célula do formulário em branco.
 * Um valor fora do enum conhecido também cai neste padrão (defensivo, nunca
 * lança). Isso NUNCA sobrescreve um período que a IA já determinou como
 * CHUVAS a partir de evidência real.
 */
function resolveClima(structuredOutput) {
  const clima = structuredOutput.clima || {};
  const resolved = {};
  for (const periodo of ["manha", "tarde", "noite"]) {
    const valor = WEATHER_CONDITIONS.includes(clima[periodo]) ? clima[periodo] : "NAO_INFORMADO";
    resolved[periodo] = valor === "NAO_INFORMADO" ? "BOM" : valor;
  }
  return resolved;
}

/**
 * Bloco 12 — título do cabeçalho do RDF: SEMPRE de `documento.tituloRdf`
 * quando configurado; nunca um nome de cliente/projeto fixo no código
 * quando ausente — o fallback usa só dado já presente na própria config
 * (local ou nome do projeto), nunca uma string idêntica entre clientes
 * diferentes por acidente, mas também nunca um nome hardcoded.
 */
function resolveTituloRdf({ documento, projetoNome, fixedText }) {
  const configurado = String(documento.tituloRdf || "").trim();
  if (configurado) return configurado;
  const base = String(documento.local || "").trim() || String(projetoNome || "").trim();
  return base ? `${fixedText.tituloRdfFallbackPrefixo} — ${base}` : fixedText.tituloRdfFallbackGenerico;
}

/**
 * Bloco 12 — rodapé institucional do RDO (assinatura esquerda + razão
 * social completa + endereço). Cadeia de fallback EXATA definida na
 * autorização: campo próprio -> `clienteRazaoSocial`/`clienteEndereco`
 * (já genéricos, vêm da config) -> rótulo neutro. Nunca uma constante de
 * cliente específico.
 */
function resolveRodapeInstitucional(documento, fixedText) {
  const r = documento.rodapeInstitucional || {};
  const clienteRazaoSocial = String(documento.clienteRazaoSocial || "").trim();
  const clienteEndereco = String(documento.clienteEndereco || "").trim();
  return {
    assinanteEsquerda: String(r.assinanteEsquerda || "").trim() || clienteRazaoSocial || fixedText.rodapeAssinanteFallback,
    razaoSocialCompleta: String(r.razaoSocialCompleta || "").trim() || clienteRazaoSocial || "",
    endereco: String(r.endereco || "").trim() || clienteEndereco || "",
  };
}

/**
 * `arquivosByDriveFileId`: Map<driveFileId, { id }> — já resolvido pelo
 * chamador (documentGenerationService.js) via `automacao_arquivos`, nunca
 * uma consulta feita aqui dentro (função pura, Seção 32).
 */
function buildDiarioObraDocumentModel({ config, execucao, snapshot, intelligence, arquivosByDriveFileId, template, documentVersion, generatorId, fixedText = DEFAULT_FALLBACK_LABELS }) {
  const documento = config?.configuracao?.documento || {};
  const structuredOutput = intelligence.structured_output;
  const photoObservationsByRef = buildPhotoObservationsByRef(structuredOutput);

  const identification = {
    projetoNome: config.projeto_nome,
    referenciaContratual: documento.referenciaContratual,
    local: documento.local,
    clienteRazaoSocial: documento.clienteRazaoSocial,
    clienteEndereco: documento.clienteEndereco,
    dataReferencia: snapshot.snapshot.referenceDate,
    expedienteInicio: documento.expedienteInicio || DEFAULT_EXPEDIENTE_INICIO,
    expedienteFim: documento.expedienteFim || DEFAULT_EXPEDIENTE_FIM,
    expedienteEhDefaultDoTemplate: !documento.expedienteInicio && !documento.expedienteFim,
    // Bloco 12 — SEMPRE resolvidos a partir da config (nunca constante de
    // cliente no código); ver resolveTituloRdf/resolveRodapeInstitucional.
    tituloRdf: resolveTituloRdf({ documento, projetoNome: config.projeto_nome, fixedText }),
    rodapeInstitucional: resolveRodapeInstitucional(documento, fixedText),
  };

  const activities = buildActivities(structuredOutput, snapshot.snapshot);
  const photos = buildPhotos(snapshot.snapshot, { arquivosByDriveFileId, photoObservationsByRef });
  const clima = resolveClima(structuredOutput);

  const signature = {
    responsavelTecnico: documento.responsavelTecnico?.trim() || null,
  };

  const metadata = {
    executionId: execucao.id,
    snapshotId: snapshot.id,
    snapshotHash: snapshot.snapshot_hash,
    intelligenceId: intelligence.id,
    intelligenceOutputHash: intelligence.output_hash,
    templateId: template.id,
    templateCodigo: template.codigo,
    templateVersao: template.versao,
    generatorId,
    documentVersion,
  };

  return { identification, activities, photos, clima, signature, metadata };
}

module.exports = {
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
};
