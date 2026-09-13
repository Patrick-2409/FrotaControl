"use strict";

/**
 * Orquestração da geração versionada do Diário de Obra em Excel/PDF (Bloco
 * 7B) — `generateExecutionDocument` transforma uma execução READY_FOR_DOCUMENT
 * em DOCUMENT_READY (ou ERROR recuperável/definitivo). Não depende de HTTP;
 * não é chamada automaticamente por nada (nenhum scheduler existe — mesma
 * decisão dos Blocos 4/5/6).
 *
 * Reaproveita deliberadamente os mesmos padrões já validados nos Blocos 5/6
 * (`closing/automationClosingService.js`, `ai/automationAiService.js`):
 * advisory lock de sessão pela duração inteira da operação, claim atômico via
 * UPDATE...RETURNING, idempotência por hash de entrada, evento de auditoria
 * por etapa, nunca reverter silenciosamente um estado posterior para um
 * anterior, e reconciliação de upload via `appProperties` (Bloco 4) para
 * nunca duplicar arquivo no Drive se o processo morrer entre o upload e a
 * persistência no banco.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { logInfo, logWarn } = require("../../../services/loggerService");
const { canonicalStringify } = require("../closing/snapshotBuilder");
const { parseDataReferencia } = require("../storage/folderNaming");
const { ensureExecutionFolders } = require("../storage/folderProvisioningService");
const { resolveArquivosForExecution } = require("../ai/evidenceBuilder");
const { AUTOMATION_DOCUMENT_RECOVERABLE_ERROR_CODES } = require("../constants/automationEnums");
const { DocumentError, classifyDocumentError } = require("./documentErrorClassification");
const { validateDocumentGenerationPrerequisites } = require("./documentPrerequisites");
const { buildDiarioObraDocumentModel } = require("./diarioObraDocumentModel");
const { buildDiarioObraExcelWorkbookV2 } = require("./diarioObraExcelBuilderV2");
const { buildDiarioObraPdfBufferV2 } = require("./diarioObraPdfBuilderV2");
const { getDocumentGenerationMaxAttempts, getDocumentPhotoMaxBytes } = require("./documentGenerationConfig");
// Bloco 12 — template ATIVO passa a ser o v2 (fidelidade visual auditada do
// arquivo de referência oficial). v1 (`diarioObraLayoutConstants.js`,
// `diarioObraExcelBuilder.js`, `diarioObraPdfBuilder.js`) permanece intacto
// e testável — nunca mais selecionado por `loadActiveDocumentTemplate`
// (resolve sempre por codigo+versao, nunca por id fixo), mas nenhuma linha
// dele foi apagada ou alterada.
const { FIXED_TEXT, TEMPLATE_CODIGO, TEMPLATE_VERSAO } = require("./diarioObraLayoutConstantsV2");

// Uma linha travada em DOCUMENT_PROCESSING (processo morreu no meio do
// trabalho) volta a ser elegível para claim depois deste tempo — mesmo
// espírito do STALE_AI_PROCESSING_MINUTES do Bloco 6.
const STALE_DOCUMENT_PROCESSING_MINUTES = 15;

const EXCEL_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_MIME_TYPE = "application/pdf";

// Carregado uma única vez por processo — o logo é um asset estático
// extraído no Bloco 7A com autorização explícita, nunca gerado/alterado em
// runtime. Bloco 12: reaproveitado tal qual para o template v2 (nenhuma
// extração de asset nova foi autorizada neste bloco — só geometria/estilo).
const LOGO_PATH = path.join(__dirname, "assets", "diario-obra-template-v1-logo.png");
let cachedLogoBuffer = null;
function loadLogoBuffer() {
  if (!cachedLogoBuffer) {
    cachedLogoBuffer = fs.readFileSync(LOGO_PATH);
  }
  return cachedLogoBuffer;
}

function sha256Hex(bufferOrString) {
  return crypto.createHash("sha256").update(bufferOrString).digest("hex");
}

function computeDocumentInputHash({ executionId, snapshotHash, intelligenceOutputHash, templateHash, templateVersao, generatorId, documento, projetoNome }) {
  return sha256Hex(
    canonicalStringify({
      executionId,
      snapshotHash,
      intelligenceOutputHash,
      templateHash,
      templateVersao,
      generatorId,
      projetoNome: projetoNome ?? null,
      documento: {
        referenciaContratual: documento.referenciaContratual ?? null,
        local: documento.local ?? null,
        clienteRazaoSocial: documento.clienteRazaoSocial ?? null,
        clienteEndereco: documento.clienteEndereco ?? null,
        responsavelTecnico: documento.responsavelTecnico ?? null,
        expedienteInicio: documento.expedienteInicio ?? null,
        expedienteFim: documento.expedienteFim ?? null,
      },
    })
  );
}

function documentLockKey(automacaoExecucaoId) {
  return `automacao_document:${automacaoExecucaoId}`;
}

async function withDocumentLock(pool, lockKeyText, fn) {
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [lockKeyText]);
    try {
      return await fn();
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKeyText]).catch(() => {});
    }
  } finally {
    lockClient.release();
  }
}

async function loadExecucaoById(pool, automacaoExecucaoId) {
  const { rows } = await pool.query(`SELECT * FROM automacao_execucoes WHERE id = $1`, [automacaoExecucaoId]);
  return rows[0] || null;
}

async function loadSnapshotById(pool, snapshotId) {
  const { rows } = await pool.query(`SELECT * FROM automacao_execucao_snapshots WHERE id = $1`, [snapshotId]);
  return rows[0] || null;
}

async function loadConfigById(pool, automacaoConfigId) {
  const { rows } = await pool.query(`SELECT * FROM automacao_configs WHERE id = $1`, [automacaoConfigId]);
  return rows[0] || null;
}

async function loadLatestCompletedIntelligence(pool, { automacaoExecucaoId, snapshotId }) {
  const { rows } = await pool.query(
    `SELECT * FROM automacao_execucao_inteligencias
     WHERE automacao_execucao_id = $1 AND snapshot_id = $2 AND status = 'COMPLETED'
     ORDER BY versao DESC LIMIT 1`,
    [automacaoExecucaoId, snapshotId]
  );
  return rows[0] || null;
}

/** Template ativo do v1 (Bloco 7A) — nunca hardcoda o id, sempre resolve por (codigo, versao, ativo). */
async function loadActiveDocumentTemplate(pool) {
  const { rows } = await pool.query(
    `SELECT * FROM automacao_templates WHERE codigo = $1 AND versao = $2 AND ativo = true`,
    [TEMPLATE_CODIGO, TEMPLATE_VERSAO]
  );
  return rows[0] || null;
}

async function loadLatestDocument(pool, { automacaoExecucaoId, snapshotId, intelligenceId, automacaoTemplateId, generatorId }) {
  const { rows } = await pool.query(
    `SELECT * FROM automacao_execucao_documentos
     WHERE automacao_execucao_id = $1 AND snapshot_id = $2 AND intelligence_id = $3
       AND automacao_template_id = $4 AND generator_id = $5
     ORDER BY versao DESC LIMIT 1`,
    [automacaoExecucaoId, snapshotId, intelligenceId, automacaoTemplateId, generatorId]
  );
  return rows[0] || null;
}

/**
 * Bloco 10, Seção 32: a versão CORRENTE anterior a `excludeDocumentoId`
 * (nunca já superseded) — usada só para decidir se/por que ela precisa ser
 * marcada obsoleta quando uma versão nova termina com sucesso. Deliberadamente
 * recalculado a partir do estado real no momento da CONCLUSÃO (nunca
 * carregado da decisão de versionamento do início da chamada) — assim
 * continua correto mesmo depois de N retries de uma mesma tentativa falha
 * (Seção 1-3: retries reaproveitam a mesma versão, nunca disparam uma decisão
 * de supersede nova).
 */
async function loadPreviousCurrentDocument(pool, automacaoExecucaoId, excludeDocumentoId) {
  const { rows } = await pool.query(
    `SELECT * FROM automacao_execucao_documentos
     WHERE automacao_execucao_id = $1 AND id <> $2 AND is_superseded = false
     ORDER BY versao DESC LIMIT 1`,
    [automacaoExecucaoId, excludeDocumentoId]
  );
  return rows[0] || null;
}

/**
 * Marca obsolescência EXPLÍCITA (Seção 32 — nunca inferida só pelo número da
 * versão): só toca linhas ainda não superseded, então o motivo de cada versão
 * antiga reflete exatamente o evento que a tornou obsoleta (nunca é
 * sobrescrito por um supersede posterior de uma versão ainda mais nova).
 */
async function supersedePreviousDocuments(pool, automacaoExecucaoId, { currentDocumentoId, reason }) {
  await pool.query(
    `UPDATE automacao_execucao_documentos
     SET is_superseded = true, superseded_reason = $3, superseded_at = NOW()
     WHERE automacao_execucao_id = $1 AND id <> $2 AND is_superseded = false`,
    [automacaoExecucaoId, currentDocumentoId, reason]
  );
}

/**
 * Bloco 10, Seção 1-3: maior `versao` já usada pela EXECUÇÃO inteira,
 * independente de snapshot/inteligência/template/gerador — é isto que torna
 * a numeração monotônica global (nunca reinicia em 1 quando um late input
 * cria um snapshot novo). Chamada só para decidir o PRÓXIMO número de uma
 * versão genuinamente nova (ver `generateExecutionDocument` abaixo); a
 * decisão de idempotência continua usando `loadLatestDocument` (escopo
 * estreito) sem nenhuma mudança.
 */
async function loadLatestDocumentVersaoGlobalForExecucao(pool, automacaoExecucaoId) {
  const { rows } = await pool.query(
    `SELECT versao FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1 ORDER BY versao DESC LIMIT 1`,
    [automacaoExecucaoId]
  );
  return rows[0] ? rows[0].versao : 0;
}

/**
 * Claim atômico READY_FOR_DOCUMENT|DOCUMENT_READY(force)|ERROR(recuperável documento)|DOCUMENT_PROCESSING(abandonado) -> DOCUMENT_PROCESSING.
 * Mesmo espírito de `claimExecutionForAiProcessing` (Bloco 6): o guard de
 * tentativas máximas é um NOT EXISTS contra a tentativa mais recente desta
 * MESMA combinação (execução, snapshot, inteligência, template, gerador) —
 * nunca contra a execução como um todo, que poderia já ter tentativas
 * esgotadas de um snapshot/inteligência ANTERIOR.
 */
async function claimExecutionForDocumentProcessing(
  pool,
  automacaoExecucaoId,
  { snapshotId, intelligenceId, automacaoTemplateId, generatorId, maxAttempts = getDocumentGenerationMaxAttempts(), force = false }
) {
  const { rows } = await pool.query(
    `UPDATE automacao_execucoes e
     SET status = 'DOCUMENT_PROCESSING', updated_at = NOW()
     WHERE e.id = $1
       AND (
         e.status = 'READY_FOR_DOCUMENT'
         -- force também aceita DOCUMENT_READY (Bloco 7B, regenerar um
         -- documento já pronto) e AWAITING_APPROVAL (Bloco 8, ação
         -- REGENERAR clicada no Telegram enquanto uma versão anterior
         -- ainda aguarda decisão humana — nunca aceito sem force).
         OR ($9::boolean AND e.status IN ('DOCUMENT_READY', 'AWAITING_APPROVAL'))
         OR (
           (
             (e.status = 'ERROR' AND e.erro_codigo = ANY($2::text[]))
             OR (e.status = 'DOCUMENT_PROCESSING' AND e.updated_at < NOW() - ($3 || ' minutes')::interval)
           )
           AND NOT EXISTS (
             SELECT 1 FROM automacao_execucao_documentos d
             WHERE d.automacao_execucao_id = e.id AND d.snapshot_id = $4 AND d.intelligence_id = $5
               AND d.automacao_template_id = $6 AND d.generator_id = $7 AND d.attempts >= $8
           )
         )
       )
     RETURNING e.*`,
    [automacaoExecucaoId, AUTOMATION_DOCUMENT_RECOVERABLE_ERROR_CODES, STALE_DOCUMENT_PROCESSING_MINUTES, snapshotId, intelligenceId, automacaoTemplateId, generatorId, maxAttempts, force]
  );
  return rows[0] || null;
}

/** Transição dedicada para pré-requisito de configuração incompleto — exige ação humana, nunca resolve só de tentar de novo (mesmo espírito de AI_DISABLED). */
async function claimExecutionForDocumentConfigIncomplete(pool, automacaoExecucaoId, { message }) {
  const { rows } = await pool.query(
    `UPDATE automacao_execucoes
     SET status = 'ERROR', erro_codigo = 'DOCUMENT_CONFIG_INCOMPLETE', erro_mensagem = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'READY_FOR_DOCUMENT'
     RETURNING *`,
    [automacaoExecucaoId, message]
  );
  return rows[0] || null;
}

/** Transição dedicada para template ausente/inativo — exige intervenção administrativa, nunca resolve só de tentar de novo. */
async function claimExecutionForDocumentTemplateNotFound(pool, automacaoExecucaoId, { message }) {
  const { rows } = await pool.query(
    `UPDATE automacao_execucoes
     SET status = 'ERROR', erro_codigo = 'DOCUMENT_TEMPLATE_NOT_FOUND', erro_mensagem = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'READY_FOR_DOCUMENT'
     RETURNING *`,
    [automacaoExecucaoId, message]
  );
  return rows[0] || null;
}

async function upsertDocumentAttempt(pool, { empresaId, automacaoExecucaoId, snapshotId, intelligenceId, automacaoTemplateId, generatorId, versao, inputHash }) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_execucao_documentos
       (empresa_id, automacao_execucao_id, snapshot_id, intelligence_id, automacao_template_id, generator_id, versao, status, input_hash, attempts, started_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'PROCESSING',$8,1,NOW())
     ON CONFLICT (automacao_execucao_id, snapshot_id, intelligence_id, automacao_template_id, generator_id, versao)
     DO UPDATE SET status = 'PROCESSING', attempts = automacao_execucao_documentos.attempts + 1,
                   started_at = NOW(), input_hash = EXCLUDED.input_hash
     RETURNING *`,
    [empresaId, automacaoExecucaoId, snapshotId, intelligenceId, automacaoTemplateId, generatorId, versao, inputHash]
  );
  return rows[0];
}

async function finalizeDocumentCompleted(pool, documentoId, { excelHash, pdfHash, excelArquivoId, pdfArquivoId }) {
  await pool.query(
    `UPDATE automacao_execucao_documentos
     SET status = 'COMPLETED', excel_hash = $2, pdf_hash = $3, excel_arquivo_id = $4, pdf_arquivo_id = $5,
         erro_codigo = NULL, erro_mensagem = NULL, completed_at = NOW()
     WHERE id = $1`,
    [documentoId, excelHash, pdfHash, excelArquivoId, pdfArquivoId]
  );
}

async function markDocumentFailed(pool, documentoId, { code, message }) {
  await pool.query(
    `UPDATE automacao_execucao_documentos SET status = 'FAILED', erro_codigo = $2, erro_mensagem = $3 WHERE id = $1`,
    [documentoId, code, String(message || "").slice(0, 4000)]
  );
}

async function finalizeExecutionDocumentReady(pool, automacaoExecucaoId) {
  await pool.query(
    `UPDATE automacao_execucoes SET status = 'DOCUMENT_READY', erro_codigo = NULL, erro_mensagem = NULL, updated_at = NOW() WHERE id = $1`,
    [automacaoExecucaoId]
  );
}

async function markExecutionDocumentError(pool, automacaoExecucaoId, { code, message }) {
  await pool.query(
    `UPDATE automacao_execucoes SET status = 'ERROR', erro_codigo = $2, erro_mensagem = $3, updated_at = NOW() WHERE id = $1`,
    [automacaoExecucaoId, code, String(message || "").slice(0, 4000)]
  );
}

async function logDocumentEvent(pool, { empresaId, automacaoConfigId, automacaoExecucaoId, tipoEvento, dados }) {
  await pool.query(
    `INSERT INTO automacao_eventos (empresa_id, automacao_config_id, automacao_execucao_id, tipo_evento, origem, dados)
     VALUES ($1,$2,$3,$4,'SISTEMA',$5::jsonb)`,
    [empresaId, automacaoConfigId, automacaoExecucaoId, tipoEvento, JSON.stringify(dados || {})]
  );
}

/**
 * Busca-antes-de-escrever (Seção 45/46) — mesma disciplina de reconciliação
 * de `photoStorageService.js` (Bloco 4): `appProperties` inclui `input_hash`,
 * então uma tentativa que já subiu o arquivo mas falhou antes de persistir no
 * banco (crash entre upload e INSERT) encontra o mesmo arquivo na próxima
 * chamada em vez de duplicar.
 */
async function findOrUploadDocumentFile({ driveClient, parentId, appProperties, name, mimeType, buffer }) {
  let driveFile = await driveClient.findFileBySourceMetadata({ parentId, appProperties });
  const recovered = Boolean(driveFile);
  if (!driveFile) {
    driveFile = await driveClient.uploadFile({ parentId, name, mimeType, buffer, appProperties });
  }
  return { driveFile, recovered };
}

/**
 * Vínculo em `automacao_arquivos` (Seção 7) — reentrante: uma linha já ligada
 * a este `automacaoDocumentoId`+`tipo` (retry após falha num passo posterior
 * do pipeline) é reaproveitada, nunca duplicada. Marca a versão anterior
 * (mesma execução/tipo) como não-corrente ANTES de inserir a nova — nunca viola
 * `ux_automacao_arquivos_current_documento` (Bloco 1), que permite no máximo
 * 1 linha `is_current = true` por (execução, tipo) para EXCEL/PDF.
 */
async function findOrCreateArquivoRow(pool, { empresaId, automacaoExecucaoId, tipo, versao, nomeArquivo, mimeType, tamanhoBytes, driveFileId, driveFolderId, automacaoDocumentoId }) {
  const existing = await pool.query(
    `SELECT id FROM automacao_arquivos WHERE automacao_documento_id = $1 AND tipo = $2`,
    [automacaoDocumentoId, tipo]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  await pool.query(
    `UPDATE automacao_arquivos SET is_current = false WHERE automacao_execucao_id = $1 AND tipo = $2 AND is_current = true`,
    [automacaoExecucaoId, tipo]
  );
  const { rows } = await pool.query(
    `INSERT INTO automacao_arquivos
       (empresa_id, automacao_execucao_id, tipo, versao, nome_arquivo, mime_type, tamanho_bytes, drive_file_id, drive_folder_id, metadata, is_current, automacao_documento_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}'::jsonb, true, $10)
     RETURNING id`,
    [empresaId, automacaoExecucaoId, tipo, versao, nomeArquivo, mimeType, tamanhoBytes, driveFileId, driveFolderId, automacaoDocumentoId]
  );
  return rows[0].id;
}

function documentFileName({ dataReferencia, extension, versao }) {
  const { ano, mes, dia } = parseDataReferencia(dataReferencia);
  return `Diario_de_Obra_${ano}-${mes}-${dia}_v${versao}.${extension}`;
}

/** Baixa, do Drive, o buffer de CADA foto `disponivel` do modelo — nunca cacheia bytes entre chamadas (mesma disciplina do Bloco 6). */
async function downloadPhotoBuffers({ model, driveClient, maxBytes }) {
  const buffers = new Map();
  for (const photo of model.photos) {
    if (!photo.disponivel || !photo.driveFileId || buffers.has(photo.driveFileId)) continue;
    try {
      const buffer = await driveClient.downloadFileContent({ fileId: photo.driveFileId, maxBytes });
      buffers.set(photo.driveFileId, buffer);
    } catch (err) {
      throw new DocumentError(`Falha ao baixar foto do Drive para montagem do documento: ${err.message}`, {
        code: "DOCUMENT_STORAGE_FAILED",
        cause: err,
      });
    }
  }
  return buffers;
}

async function runDocumentGenerationPipeline({ pool, execucao, snapshot, intelligence, config, template, documentRow, driveClient, generatorId }) {
  const eventBase = { empresaId: execucao.empresa_id, automacaoConfigId: execucao.automacao_config_id, automacaoExecucaoId: execucao.id };
  await logDocumentEvent(pool, { ...eventBase, tipoEvento: "DOCUMENT_GENERATION_STARTED", dados: { snapshotId: snapshot.id, versao: documentRow.versao } });

  try {
    const photoDriveFileIds = (snapshot.snapshot.messages || [])
      .filter((m) => m.type === "PHOTO" && m.photo?.stored && m.photo.driveFileId)
      .map((m) => m.photo.driveFileId);
    const arquivosRows = await resolveArquivosForExecution(pool, {
      empresaId: execucao.empresa_id,
      automacaoExecucaoId: execucao.id,
      driveFileIds: photoDriveFileIds,
    });
    const arquivosByDriveFileId = new Map(arquivosRows.map((a) => [a.drive_file_id, a]));

    const model = buildDiarioObraDocumentModel({
      config,
      execucao,
      snapshot,
      intelligence,
      arquivosByDriveFileId,
      template,
      documentVersion: documentRow.versao,
      generatorId,
      fixedText: FIXED_TEXT,
    });

    const logoBuffer = loadLogoBuffer();
    const photoBuffers = await downloadPhotoBuffers({ model, driveClient, maxBytes: getDocumentPhotoMaxBytes() });

    let excelBuffer;
    try {
      const workbook = buildDiarioObraExcelWorkbookV2(model, { logoBuffer, photoBuffers });
      excelBuffer = await workbook.xlsx.writeBuffer();
    } catch (err) {
      throw new DocumentError(`Falha ao gerar o Excel do Diário de Obra: ${err.message}`, { code: "DOCUMENT_EXCEL_GENERATION_FAILED", cause: err });
    }
    const excelHash = sha256Hex(excelBuffer);
    await logDocumentEvent(pool, { ...eventBase, tipoEvento: "DOCUMENT_EXCEL_GENERATED", dados: { versao: documentRow.versao, excelHash, tamanho_bytes: excelBuffer.length } });

    let pdfBuffer;
    try {
      pdfBuffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers });
    } catch (err) {
      throw new DocumentError(`Falha ao gerar o PDF do Diário de Obra: ${err.message}`, { code: "DOCUMENT_PDF_GENERATION_FAILED", cause: err });
    }
    const pdfHash = sha256Hex(pdfBuffer);
    await logDocumentEvent(pool, { ...eventBase, tipoEvento: "DOCUMENT_PDF_GENERATED", dados: { versao: documentRow.versao, pdfHash, tamanho_bytes: pdfBuffer.length } });

    let diaId;
    try {
      ({ diaId } = await ensureExecutionFolders({ pool, execucaoId: execucao.id, driveClient }));
    } catch (err) {
      throw new DocumentError(`Falha ao provisionar pasta do dia no Drive: ${err.message}`, { code: "DOCUMENT_STORAGE_FAILED", cause: err });
    }

    const dataReferencia = model.identification.dataReferencia;
    const excelAppProperties = {
      frotamax_module: "automations_document",
      automacao_execucao_id: String(execucao.id),
      document_version: String(documentRow.versao),
      document_type: "EXCEL",
      input_hash: documentRow.input_hash,
    };
    const pdfAppProperties = { ...excelAppProperties, document_type: "PDF" };

    let excelUpload;
    try {
      excelUpload = await findOrUploadDocumentFile({
        driveClient,
        parentId: diaId,
        appProperties: excelAppProperties,
        name: documentFileName({ dataReferencia, extension: "xlsx", versao: documentRow.versao }),
        mimeType: EXCEL_MIME_TYPE,
        buffer: excelBuffer,
      });
    } catch (err) {
      throw new DocumentError(`Falha ao enviar Excel ao Drive: ${err.message}`, { code: "DOCUMENT_STORAGE_FAILED", cause: err });
    }
    await logDocumentEvent(pool, {
      ...eventBase,
      tipoEvento: "DOCUMENT_EXCEL_STORED",
      dados: { versao: documentRow.versao, drive_file_id: excelUpload.driveFile.id, recovered: excelUpload.recovered },
    });

    let pdfUpload;
    try {
      pdfUpload = await findOrUploadDocumentFile({
        driveClient,
        parentId: diaId,
        appProperties: pdfAppProperties,
        name: documentFileName({ dataReferencia, extension: "pdf", versao: documentRow.versao }),
        mimeType: PDF_MIME_TYPE,
        buffer: pdfBuffer,
      });
    } catch (err) {
      throw new DocumentError(`Falha ao enviar PDF ao Drive: ${err.message}`, { code: "DOCUMENT_STORAGE_FAILED", cause: err });
    }
    await logDocumentEvent(pool, {
      ...eventBase,
      tipoEvento: "DOCUMENT_PDF_STORED",
      dados: { versao: documentRow.versao, drive_file_id: pdfUpload.driveFile.id, recovered: pdfUpload.recovered },
    });

    const excelArquivoId = await findOrCreateArquivoRow(pool, {
      empresaId: execucao.empresa_id,
      automacaoExecucaoId: execucao.id,
      tipo: "EXCEL",
      versao: documentRow.versao,
      nomeArquivo: documentFileName({ dataReferencia, extension: "xlsx", versao: documentRow.versao }),
      mimeType: EXCEL_MIME_TYPE,
      tamanhoBytes: excelBuffer.length,
      driveFileId: excelUpload.driveFile.id,
      driveFolderId: diaId,
      automacaoDocumentoId: documentRow.id,
    });
    const pdfArquivoId = await findOrCreateArquivoRow(pool, {
      empresaId: execucao.empresa_id,
      automacaoExecucaoId: execucao.id,
      tipo: "PDF",
      versao: documentRow.versao,
      nomeArquivo: documentFileName({ dataReferencia, extension: "pdf", versao: documentRow.versao }),
      mimeType: PDF_MIME_TYPE,
      tamanhoBytes: pdfBuffer.length,
      driveFileId: pdfUpload.driveFile.id,
      driveFolderId: diaId,
      automacaoDocumentoId: documentRow.id,
    });

    await finalizeDocumentCompleted(pool, documentRow.id, { excelHash, pdfHash, excelArquivoId, pdfArquivoId });
    await finalizeExecutionDocumentReady(pool, execucao.id);

    // Bloco 10, Seção 32: obsolescência explícita da versão anterior, só
    // aplicada quando esta versão nova de fato SUBSTITUI outra já existente
    // (nunca no primeiro documento da execução). O motivo é derivado do
    // snapshot usado: mesma snapshot da versão anterior => regeneração comum
    // (config mudou ou force explícito); snapshot diferente => só um rebuild
    // (late input incorporado) muda a snapshot corrente de uma execução.
    const previousCurrent = await loadPreviousCurrentDocument(pool, execucao.id, documentRow.id);
    if (previousCurrent) {
      const supersedeReason = previousCurrent.snapshot_id === snapshot.id && previousCurrent.intelligence_id === intelligence.id ? "REGENERATION" : "LATE_INPUT";
      await supersedePreviousDocuments(pool, execucao.id, { currentDocumentoId: documentRow.id, reason: supersedeReason });
    }

    await logDocumentEvent(pool, { ...eventBase, tipoEvento: "DOCUMENT_GENERATION_COMPLETED", dados: { versao: documentRow.versao, excelHash, pdfHash } });

    logInfo("automation_document_generation_completed", { execucaoId: execucao.id, versao: documentRow.versao });
    return {
      outcome: "READY",
      execucaoId: execucao.id,
      documentoId: documentRow.id,
      versao: documentRow.versao,
      excelHash,
      pdfHash,
      excelArquivoId,
      pdfArquivoId,
    };
  } catch (err) {
    const code = classifyDocumentError(err);
    await markDocumentFailed(pool, documentRow.id, { code, message: err.message });
    await markExecutionDocumentError(pool, execucao.id, { code, message: err.message });
    await logDocumentEvent(pool, { ...eventBase, tipoEvento: "DOCUMENT_GENERATION_FAILED", dados: { code, message: err.message } });
    logWarn("automation_document_generation_failed", { execucaoId: execucao.id, code, message: err.message });
    return { outcome: "ERROR_RECOVERABLE", code, execucaoId: execucao.id, documentoId: documentRow.id };
  }
}

/**
 * Ponto de entrada principal. `force: true` cria uma NOVA versão de documento
 * mesmo que já exista uma COMPLETED com o MESMO input_hash — sem isso, uma
 * chamada repetida com a mesma entrada é sempre idempotente (reaproveita o
 * resultado, nunca gera de novo). Quando já existe uma COMPLETED mas com
 * input_hash DIFERENTE do atual (config mudou depois da última geração) e
 * `force` não foi passado, a geração NÃO é refeita automaticamente — o
 * chamador precisa decidir explicitamente (`STALE_RESULT_NEEDS_FORCE`), nunca
 * um documento é substituído silenciosamente por uma mudança de config não
 * intencional.
 */
async function generateExecutionDocument({
  pool,
  empresaId = null,
  automacaoExecucaoId,
  driveClient,
  force = false,
  maxAttempts = getDocumentGenerationMaxAttempts(),
}) {
  const preCheck = await loadExecucaoById(pool, automacaoExecucaoId);
  if (!preCheck || (empresaId != null && preCheck.empresa_id !== empresaId)) {
    return { outcome: "NOT_FOUND" };
  }

  return withDocumentLock(pool, documentLockKey(automacaoExecucaoId), async () => {
    const execucao = await loadExecucaoById(pool, automacaoExecucaoId);
    if (!execucao) return { outcome: "NOT_FOUND" };

    if (!execucao.current_snapshot_id) {
      return { outcome: "NO_SNAPSHOT", execucaoId: execucao.id };
    }

    const snapshotRow = await loadSnapshotById(pool, execucao.current_snapshot_id);
    const snapshot = { ...snapshotRow, snapshot: snapshotRow.snapshot };
    const config = await loadConfigById(pool, execucao.automacao_config_id);

    const intelligence = await loadLatestCompletedIntelligence(pool, { automacaoExecucaoId: execucao.id, snapshotId: snapshot.id });
    if (!intelligence) {
      return { outcome: "NO_INTELLIGENCE", execucaoId: execucao.id };
    }

    const prerequisites = validateDocumentGenerationPrerequisites(config);
    if (!prerequisites.valid) {
      const message = `Configuração incompleta para gerar o documento: ${prerequisites.missingFields.map((f) => f.label).join("; ")}.`;
      const claimedIncomplete = await claimExecutionForDocumentConfigIncomplete(pool, execucao.id, { message });
      if (claimedIncomplete) {
        await logDocumentEvent(pool, {
          empresaId: execucao.empresa_id,
          automacaoConfigId: execucao.automacao_config_id,
          automacaoExecucaoId: execucao.id,
          tipoEvento: "DOCUMENT_GENERATION_FAILED",
          dados: { code: "DOCUMENT_CONFIG_INCOMPLETE", missingFields: prerequisites.missingFields.map((f) => f.key) },
        });
      }
      const fresh = claimedIncomplete || (await loadExecucaoById(pool, execucao.id));
      return { outcome: "CONFIG_INCOMPLETE", execucaoId: fresh.id, currentStatus: fresh.status, missingFields: prerequisites.missingFields };
    }

    const template = await loadActiveDocumentTemplate(pool);
    if (!template) {
      const message = `Nenhum template ativo encontrado para ${TEMPLATE_CODIGO} v${TEMPLATE_VERSAO}.`;
      const claimedMissing = await claimExecutionForDocumentTemplateNotFound(pool, execucao.id, { message });
      if (claimedMissing) {
        await logDocumentEvent(pool, {
          empresaId: execucao.empresa_id,
          automacaoConfigId: execucao.automacao_config_id,
          automacaoExecucaoId: execucao.id,
          tipoEvento: "DOCUMENT_GENERATION_FAILED",
          dados: { code: "DOCUMENT_TEMPLATE_NOT_FOUND" },
        });
      }
      const fresh = claimedMissing || (await loadExecucaoById(pool, execucao.id));
      return { outcome: "TEMPLATE_NOT_FOUND", execucaoId: fresh.id, currentStatus: fresh.status };
    }

    const generatorId = template.generator_id;
    const documento = config?.configuracao?.documento || {};
    const inputHash = computeDocumentInputHash({
      executionId: execucao.id,
      snapshotHash: snapshot.snapshot_hash,
      intelligenceOutputHash: intelligence.output_hash,
      templateHash: template.template_hash,
      templateVersao: template.versao,
      generatorId,
      documento,
      projetoNome: config.projeto_nome,
    });

    const latestBeforeClaim = await loadLatestDocument(pool, {
      automacaoExecucaoId: execucao.id,
      snapshotId: snapshot.id,
      intelligenceId: intelligence.id,
      automacaoTemplateId: template.id,
      generatorId,
    });

    if (latestBeforeClaim && latestBeforeClaim.status === "COMPLETED" && latestBeforeClaim.input_hash === inputHash && !force) {
      await logDocumentEvent(pool, {
        empresaId: execucao.empresa_id,
        automacaoConfigId: execucao.automacao_config_id,
        automacaoExecucaoId: execucao.id,
        tipoEvento: "DOCUMENT_RESULT_REUSED",
        dados: { versao: latestBeforeClaim.versao, snapshotId: snapshot.id },
      });
      return {
        outcome: "ALREADY_READY",
        execucaoId: execucao.id,
        documentoId: latestBeforeClaim.id,
        versao: latestBeforeClaim.versao,
        excelHash: latestBeforeClaim.excel_hash,
        pdfHash: latestBeforeClaim.pdf_hash,
        excelArquivoId: latestBeforeClaim.excel_arquivo_id,
        pdfArquivoId: latestBeforeClaim.pdf_arquivo_id,
      };
    }

    if (latestBeforeClaim && latestBeforeClaim.status === "COMPLETED" && latestBeforeClaim.input_hash !== inputHash && !force) {
      return {
        outcome: "STALE_RESULT_NEEDS_FORCE",
        execucaoId: execucao.id,
        documentoId: latestBeforeClaim.id,
        existingVersao: latestBeforeClaim.versao,
        existingInputHash: latestBeforeClaim.input_hash,
        currentInputHash: inputHash,
      };
    }

    const claimed = await claimExecutionForDocumentProcessing(pool, execucao.id, {
      snapshotId: snapshot.id,
      intelligenceId: intelligence.id,
      automacaoTemplateId: template.id,
      generatorId,
      maxAttempts,
      force,
    });
    if (!claimed) {
      const fresh = await loadExecucaoById(pool, execucao.id);
      return { outcome: "NOT_ELIGIBLE", currentStatus: fresh.status, execucaoId: fresh.id };
    }

    // Nova versão quando o input_hash mudou (config/snapshot/inteligência
    // mudou desde a última tentativa DESTA combinação — só alcançável aqui
    // com force=true, ver STALE_RESULT_NEEDS_FORCE acima) OU quando force
    // pediu explicitamente reprocessar algo já COMPLETED com a MESMA entrada.
    // Um retry comum de uma tentativa FAILED (mesmo input_hash, mesma
    // combinação) reaproveita a MESMA versão — nunca consome um número novo.
    //
    // Bloco 10, Seção 1-3: quando uma versão NOVA é de fato necessária, o
    // número não é mais `latestBeforeClaim.versao + 1` (escopo estreito por
    // snapshot/inteligência/template/gerador — reiniciava em 1 a cada
    // snapshot novo, ver Bloco 9). Agora é sempre o maior `versao` já usado
    // por TODA a execução (`loadLatestDocumentVersaoGlobalForExecucao`) + 1 —
    // monotônico por execução, nunca reinicia por late input/rebuild.
    const isNewContentVersion =
      !latestBeforeClaim || latestBeforeClaim.input_hash !== inputHash || (force && latestBeforeClaim.status === "COMPLETED");
    let versao;
    if (!isNewContentVersion) {
      versao = latestBeforeClaim.versao;
    } else {
      const globalLatestVersao = await loadLatestDocumentVersaoGlobalForExecucao(pool, execucao.id);
      versao = globalLatestVersao + 1;
    }

    const documentRow = await upsertDocumentAttempt(pool, {
      empresaId: execucao.empresa_id,
      automacaoExecucaoId: execucao.id,
      snapshotId: snapshot.id,
      intelligenceId: intelligence.id,
      automacaoTemplateId: template.id,
      generatorId,
      versao,
      inputHash,
    });

    return runDocumentGenerationPipeline({ pool, execucao: claimed, snapshot, intelligence, config, template, documentRow, driveClient, generatorId });
  });
}

async function getDocumentStatusForEmpresa(pool, { empresaId, automacaoExecucaoId }) {
  const { rows } = await pool.query(
    `SELECT id, status, current_snapshot_id, erro_codigo, erro_mensagem
     FROM automacao_execucoes WHERE id = $1 AND empresa_id = $2`,
    [automacaoExecucaoId, empresaId]
  );
  return rows[0] || null;
}

async function getCurrentDocumentForEmpresa(pool, { empresaId, automacaoExecucaoId }) {
  const { rows } = await pool.query(
    `SELECT d.*
     FROM automacao_execucao_documentos d
     JOIN automacao_execucoes e ON e.id = d.automacao_execucao_id
     WHERE e.id = $1 AND e.empresa_id = $2 AND d.snapshot_id = e.current_snapshot_id AND d.status = 'COMPLETED'
     ORDER BY d.versao DESC LIMIT 1`,
    [automacaoExecucaoId, empresaId]
  );
  return rows[0] || null;
}

async function listDocumentVersionsForEmpresa(pool, { empresaId, automacaoExecucaoId }) {
  const { rows } = await pool.query(
    `SELECT d.id, d.snapshot_id, d.intelligence_id, d.versao, d.status, d.generator_id, d.excel_hash, d.pdf_hash,
            d.excel_arquivo_id, d.pdf_arquivo_id, d.erro_codigo, d.created_at, d.completed_at
     FROM automacao_execucao_documentos d
     JOIN automacao_execucoes e ON e.id = d.automacao_execucao_id
     WHERE e.id = $1 AND e.empresa_id = $2
     ORDER BY d.versao DESC`,
    [automacaoExecucaoId, empresaId]
  );
  return rows;
}

module.exports = {
  STALE_DOCUMENT_PROCESSING_MINUTES,
  EXCEL_MIME_TYPE,
  PDF_MIME_TYPE,
  computeDocumentInputHash,
  documentFileName,
  generateExecutionDocument,
  getDocumentStatusForEmpresa,
  getCurrentDocumentForEmpresa,
  listDocumentVersionsForEmpresa,
};
