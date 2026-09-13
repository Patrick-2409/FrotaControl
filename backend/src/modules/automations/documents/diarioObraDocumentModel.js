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

/** Mapa telegramMessageId -> {timestamp, messageId} — usado só para ordenar facts pela evidência mais antiga (Seção 15). */
function buildMessageOrderMap(snapshot) {
  const map = new Map();
  for (const message of snapshot.messages) {
    map.set(message.telegramMessageId, { timestamp: message.timestamp, messageId: message.telegramMessageId });
  }
  return map;
}

/** Chave de ordenação de um fato: (timestamp, messageId) da PRIMEIRA evidência cronológica citada — nunca alfabética (Seção 15). */
function factSortKey(fact, orderMap) {
  let best = null;
  for (const ref of fact.sourceRefs || []) {
    const info = orderMap.get(ref);
    if (!info || !info.timestamp) continue;
    if (!best || info.timestamp < best.timestamp || (info.timestamp === best.timestamp && compareNumericIdStrings(info.messageId, best.messageId) < 0)) {
      best = info;
    }
  }
  // Fato sem nenhuma referência resolvível (não deveria acontecer — Bloco 6 já
  // exige sourceRefs válidos — mas defensivo): vai para o final, nunca quebra.
  return best || { timestamp: "9999-12-31T23:59:59.999Z", messageId: "0" };
}

function dedupeFacts(facts) {
  const seen = new Set();
  const result = [];
  for (const fact of facts) {
    const key = String(fact.statement || "").trim().toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(fact);
  }
  return result;
}

/**
 * Sequência final da lista de atividades (Seção 14): 1) facts operacionais
 * (ordem cronológica da evidência), 2) conflicts + warnings (nunca como fato
 * executado), 3) missing information (agrupada, nunca dezenas de linhas
 * artificiais — Seção 17). Nunca mistura semanticamente as três categorias.
 */
function buildActivities(structuredOutput, snapshot) {
  const orderMap = buildMessageOrderMap(snapshot);
  const facts = dedupeFacts(structuredOutput.facts || []);
  const orderedFacts = [...facts].sort((a, b) => {
    const keyA = factSortKey(a, orderMap);
    const keyB = factSortKey(b, orderMap);
    if (keyA.timestamp !== keyB.timestamp) return keyA.timestamp < keyB.timestamp ? -1 : 1;
    return compareNumericIdStrings(keyA.messageId, keyB.messageId);
  });

  const items = [];
  for (const fact of orderedFacts) {
    items.push({ tipo: "FACT", texto: fact.statement });
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

  return { identification, activities, photos, signature, metadata };
}

module.exports = {
  buildDiarioObraDocumentModel,
  buildActivities,
  buildPhotos,
  dedupeFacts,
  compareNumericIdStrings,
  resolveTituloRdf,
  resolveRodapeInstitucional,
};
