"use strict";

/**
 * Orquestração da estruturação inteligente do dia (Bloco 6) —
 * `processExecutionIntelligence` transforma uma execução READY_FOR_GENERATION
 * em READY_FOR_DOCUMENT (ou ERROR recuperável). Não depende de HTTP; não é
 * chamada automaticamente por nada (nenhum scheduler existe — Seção 52).
 *
 * Reaproveita deliberadamente os mesmos padrões já validados no Bloco 5
 * (`closing/automationClosingService.js`): advisory lock de sessão pela
 * duração inteira da operação, claim atômico via UPDATE...RETURNING, evento
 * de auditoria por etapa, nunca reverter silenciosamente um estado posterior
 * para um anterior.
 */

const crypto = require("crypto");
const { logInfo, logWarn } = require("../../../services/loggerService");
const { canonicalStringify } = require("../closing/snapshotBuilder");
const { AUTOMATION_AI_RECOVERABLE_ERROR_CODES } = require("../constants/automationEnums");
const { AiError, classifyAiError } = require("./aiErrorClassification");
const { validateDailyIntelligence } = require("./dailyIntelligenceValidator");
const { PhotoObservationSchema } = require("./dailyIntelligenceSchema");
const {
  buildTextEvidence,
  buildValidSourceRefs,
  buildTextByRefMap,
  listStoredPhotosFromSnapshot,
  resolveArquivosForExecution,
} = require("./evidenceBuilder");
const { buildPhotoBatches } = require("./batchBuilder");
const {
  getAutomationAiMaxImagesPerBatch,
  getAutomationAiMaxImageBytes,
  getAutomationAiMaxAttempts,
} = require("./automationAiConfig");
const {
  PHOTO_ANALYSIS_PROMPT_VERSION,
  PHOTO_ANALYSIS_SYSTEM_PROMPT,
  buildPhotoAnalysisUserPrompt,
} = require("./prompts/photoAnalysisPromptV1");
const {
  DAILY_INTELLIGENCE_PROMPT_VERSION,
  DAILY_INTELLIGENCE_SYSTEM_PROMPT,
  buildDailyIntelligenceUserPrompt,
} = require("./prompts/dailyIntelligencePromptV1");

// Uma linha travada em AI_PROCESSING (processo morreu no meio do trabalho)
// volta a ser elegível para claim depois deste tempo — mesmo espírito do
// STALE_PROCESSING_MINUTES do Bloco 4.
const STALE_AI_PROCESSING_MINUTES = 15;

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function computeInputHash({ snapshotHash, promptVersion, model, sourceRefsIncluded }) {
  return sha256Hex(canonicalStringify({ snapshotHash, promptVersion, model, sourceRefsIncluded: [...sourceRefsIncluded].sort() }));
}

function computeOutputHash(structuredOutput) {
  return sha256Hex(canonicalStringify(structuredOutput));
}

function aiLockKey(automacaoExecucaoId) {
  return `automacao_ai:${automacaoExecucaoId}`;
}

async function withAiLock(pool, lockKeyText, fn) {
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

async function loadLatestIntelligence(pool, { automacaoExecucaoId, snapshotId }) {
  const { rows } = await pool.query(
    `SELECT * FROM automacao_execucao_inteligencias
     WHERE automacao_execucao_id = $1 AND snapshot_id = $2
     ORDER BY versao DESC LIMIT 1`,
    [automacaoExecucaoId, snapshotId]
  );
  return rows[0] || null;
}

/**
 * Claim atômico READY_FOR_GENERATION|ERROR(recuperável IA)|AI_PROCESSING(abandonado) -> AI_PROCESSING.
 *
 * Seção 51: "respeitar número máximo de tentativas configurável" — attempts
 * vive em `automacao_execucao_inteligencias` (por snapshot), não na própria
 * execução, então o guard é um NOT EXISTS contra a tentativa mais recente do
 * SNAPSHOT ATUAL da execução. Uma vez esgotado, o claim simplesmente para de
 * bater (a execução fica em ERROR, mas não é mais reclamável automaticamente
 * — precisa de um `force` explícito ou de um novo snapshot via rebuild).
 */
async function claimExecutionForAiProcessing(pool, automacaoExecucaoId, { maxAttempts = getAutomationAiMaxAttempts(), force = false } = {}) {
  const { rows } = await pool.query(
    `UPDATE automacao_execucoes e
     SET status = 'AI_PROCESSING', updated_at = NOW()
     WHERE e.id = $1
       AND (
         e.status = 'READY_FOR_GENERATION'
         OR ($5::boolean AND e.status = 'READY_FOR_DOCUMENT')
         OR (
           (
             (e.status = 'ERROR' AND e.erro_codigo = ANY($2::text[]))
             OR (e.status = 'AI_PROCESSING' AND e.updated_at < NOW() - ($3 || ' minutes')::interval)
           )
           AND NOT EXISTS (
             SELECT 1 FROM automacao_execucao_inteligencias i
             WHERE i.automacao_execucao_id = e.id AND i.snapshot_id = e.current_snapshot_id AND i.attempts >= $4
           )
         )
       )
     RETURNING e.*`,
    [automacaoExecucaoId, AUTOMATION_AI_RECOVERABLE_ERROR_CODES, STALE_AI_PROCESSING_MINUTES, maxAttempts, force]
  );
  return rows[0] || null;
}

/** Transição dedicada para IA desativada — não é um "erro recuperável" automático (exige mudança de config). */
async function claimExecutionForAiDisabled(pool, automacaoExecucaoId) {
  const { rows } = await pool.query(
    `UPDATE automacao_execucoes
     SET status = 'ERROR', erro_codigo = 'AI_DISABLED', erro_mensagem = 'Config com usa_ia=false — estruturação por IA não executada.', updated_at = NOW()
     WHERE id = $1 AND status = 'READY_FOR_GENERATION'
     RETURNING *`,
    [automacaoExecucaoId]
  );
  return rows[0] || null;
}

async function upsertIntelligenceAttempt(pool, { empresaId, automacaoExecucaoId, snapshotId, versao, promptVersion, model, inputHash }) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_execucao_inteligencias
       (empresa_id, automacao_execucao_id, snapshot_id, versao, prompt_version, model, status, input_hash, attempts, started_at)
     VALUES ($1,$2,$3,$4,$5,$6,'PROCESSING',$7,1,NOW())
     ON CONFLICT (automacao_execucao_id, snapshot_id, versao)
     DO UPDATE SET status = 'PROCESSING', attempts = automacao_execucao_inteligencias.attempts + 1,
                   started_at = NOW(), input_hash = EXCLUDED.input_hash, model = EXCLUDED.model, prompt_version = EXCLUDED.prompt_version
     RETURNING *`,
    [empresaId, automacaoExecucaoId, snapshotId, versao, promptVersion, model, inputHash]
  );
  return rows[0];
}

async function finalizeIntelligenceCompleted(pool, intelligenceId, { structuredOutput, outputHash, usage }) {
  await pool.query(
    `UPDATE automacao_execucao_inteligencias
     SET status = 'COMPLETED', structured_output = $2::jsonb, output_hash = $3,
         input_tokens = $4, output_tokens = $5, total_tokens = $6,
         erro_codigo = NULL, erro_mensagem = NULL, completed_at = NOW()
     WHERE id = $1`,
    [intelligenceId, JSON.stringify(structuredOutput), outputHash, usage.inputTokens ?? null, usage.outputTokens ?? null, usage.totalTokens ?? null]
  );
}

async function markIntelligenceFailed(pool, intelligenceId, { code, message }) {
  await pool.query(
    `UPDATE automacao_execucao_inteligencias SET status = 'FAILED', erro_codigo = $2, erro_mensagem = $3 WHERE id = $1`,
    [intelligenceId, code, String(message || "").slice(0, 4000)]
  );
}

async function finalizeExecutionReadyForDocument(pool, automacaoExecucaoId) {
  await pool.query(
    `UPDATE automacao_execucoes SET status = 'READY_FOR_DOCUMENT', erro_codigo = NULL, erro_mensagem = NULL, updated_at = NOW() WHERE id = $1`,
    [automacaoExecucaoId]
  );
}

async function markExecutionAiError(pool, automacaoExecucaoId, { code, message }) {
  await pool.query(
    `UPDATE automacao_execucoes SET status = 'ERROR', erro_codigo = $2, erro_mensagem = $3, updated_at = NOW() WHERE id = $1`,
    [automacaoExecucaoId, code, String(message || "").slice(0, 4000)]
  );
}

async function logAiEvent(pool, { empresaId, automacaoConfigId, automacaoExecucaoId, tipoEvento, dados }) {
  await pool.query(
    `INSERT INTO automacao_eventos (empresa_id, automacao_config_id, automacao_execucao_id, tipo_evento, origem, dados)
     VALUES ($1,$2,$3,$4,'SISTEMA',$5::jsonb)`,
    [empresaId, automacaoConfigId, automacaoExecucaoId, tipoEvento, JSON.stringify(dados || {})]
  );
}

async function getCachedPhotoAnalysis(pool, { automacaoArquivoId, model, promptVersion }) {
  const { rows } = await pool.query(
    `SELECT * FROM automacao_arquivo_analises WHERE automacao_arquivo_id = $1 AND model = $2 AND prompt_version = $3`,
    [automacaoArquivoId, model, promptVersion]
  );
  return rows[0] || null;
}

async function saveCachedPhotoAnalysis(pool, { empresaId, automacaoArquivoId, model, promptVersion, analysis, inputTokens, outputTokens }) {
  await pool.query(
    `INSERT INTO automacao_arquivo_analises (empresa_id, automacao_arquivo_id, model, prompt_version, analysis, analysis_hash, input_tokens, output_tokens)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
     ON CONFLICT (automacao_arquivo_id, model, prompt_version) DO NOTHING`,
    [empresaId, automacaoArquivoId, model, promptVersion, JSON.stringify(analysis), sha256Hex(canonicalStringify(analysis)), inputTokens ?? null, outputTokens ?? null]
  );
}

/**
 * Análise visual com cache por foto (Seção 26/27) — só baixa/chama a IA para
 * fotos ainda não analisadas com o (model, prompt_version) atual. Nunca
 * expõe o buffer da imagem em log (Seção 23/48).
 */
async function analyzePhotosWithCache({ pool, empresaId, eventBase, storedPhotos, arquivosByRef, driveClient, aiClient, model }) {
  const observations = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const pending = [];

  for (const photo of storedPhotos) {
    const arquivo = arquivosByRef.get(photo.sourceRef);
    if (!arquivo) continue; // não resolvido com segurança via automacao_arquivos (Seção 23) — nunca analisado
    const cached = await getCachedPhotoAnalysis(pool, {
      automacaoArquivoId: arquivo.id,
      model,
      promptVersion: PHOTO_ANALYSIS_PROMPT_VERSION,
    });
    if (cached) {
      observations.push(cached.analysis);
      continue;
    }
    pending.push({ ...photo, arquivo });
  }

  if (!pending.length) return { observations, usage };

  const maxImageBytes = getAutomationAiMaxImageBytes();
  const batches = buildPhotoBatches(pending, getAutomationAiMaxImagesPerBatch());

  for (const batch of batches) {
    const images = [];
    for (const photo of batch) {
      let buffer;
      try {
        buffer = await driveClient.downloadFileContent({ fileId: photo.sourceRef, maxBytes: maxImageBytes });
      } catch (err) {
        throw new AiError(`Falha ao baixar foto do Drive para análise: ${err.message}`, { code: "IMAGE_DOWNLOAD_FAILED", cause: err });
      }
      images.push({ sourceRef: photo.sourceRef, caption: photo.caption, mimeType: photo.arquivo.mime_type || "image/jpeg", buffer });
    }

    const { observations: batchObservations, usage: batchUsage } = await aiClient.analyzePhotoBatch({
      systemPrompt: PHOTO_ANALYSIS_SYSTEM_PROMPT,
      images,
      buildUserPromptForImage: (image) => buildPhotoAnalysisUserPrompt({ sourceRef: image.sourceRef, caption: image.caption }),
    });
    usage.inputTokens += batchUsage.inputTokens || 0;
    usage.outputTokens += batchUsage.outputTokens || 0;

    for (const raw of batchObservations) {
      const parsed = PhotoObservationSchema.safeParse(raw);
      if (!parsed.success) continue; // observação malformada é descartada, nunca derruba o lote inteiro
      const photo = batch.find((p) => p.sourceRef === parsed.data.sourceRef);
      if (!photo) continue; // IA respondeu com um sourceRef que não fazia parte do lote pedido — descarta

      observations.push(parsed.data);
      await saveCachedPhotoAnalysis(pool, {
        empresaId,
        automacaoArquivoId: photo.arquivo.id,
        model,
        promptVersion: PHOTO_ANALYSIS_PROMPT_VERSION,
        analysis: parsed.data,
        inputTokens: batchUsage.inputTokens,
        outputTokens: batchUsage.outputTokens,
      });
      await logAiEvent(pool, { ...eventBase, tipoEvento: "AI_PHOTO_ANALYSIS_COMPLETED", dados: { sourceRef: photo.sourceRef } });
    }
  }

  return { observations, usage };
}

async function runIntelligencePipeline({ pool, execucao, snapshot, config, intelligenceRow, aiClient, driveClient, model }) {
  const eventBase = { empresaId: execucao.empresa_id, automacaoConfigId: execucao.automacao_config_id, automacaoExecucaoId: execucao.id };
  await logAiEvent(pool, { ...eventBase, tipoEvento: "AI_PROCESSING_STARTED", dados: { snapshotId: snapshot.id, versao: intelligenceRow.versao } });

  try {
    const storedPhotos = listStoredPhotosFromSnapshot(snapshot.snapshot);
    const driveFileIds = storedPhotos.map((p) => p.sourceRef);
    const arquivos = await resolveArquivosForExecution(pool, {
      empresaId: execucao.empresa_id,
      automacaoExecucaoId: execucao.id,
      driveFileIds,
    });
    const arquivosByRef = new Map(arquivos.map((a) => [a.drive_file_id, a]));

    const { observations: photoObservations, usage: photoUsage } = await analyzePhotosWithCache({
      pool,
      empresaId: execucao.empresa_id,
      eventBase,
      storedPhotos,
      arquivosByRef,
      driveClient,
      aiClient,
      model,
    });

    const textEvidence = buildTextEvidence(snapshot.snapshot);
    const validSourceRefs = buildValidSourceRefs(snapshot.snapshot);
    const textByRef = buildTextByRefMap(snapshot.snapshot);

    const userPrompt = buildDailyIntelligenceUserPrompt({
      referenceDate: snapshot.snapshot.referenceDate,
      timezone: snapshot.snapshot.timezone,
      textEvidence,
      photoObservations,
      validSourceRefs: [...validSourceRefs],
    });

    const { structuredOutput, usage: consolidationUsage } = await aiClient.consolidateDailyIntelligence({
      systemPrompt: DAILY_INTELLIGENCE_SYSTEM_PROMPT,
      userPrompt,
    });

    const validation = validateDailyIntelligence(structuredOutput, { validSourceRefs, textByRef });
    if (!validation.valid) {
      await logAiEvent(pool, { ...eventBase, tipoEvento: "AI_VALIDATION_FAILED", dados: { code: validation.code, errors: validation.errors } });
      throw new AiError(`Validação da saída da IA falhou: ${validation.errors.join(" | ")}`, { code: validation.code });
    }

    const totalUsage = {
      inputTokens: (photoUsage.inputTokens || 0) + (consolidationUsage.inputTokens || 0),
      outputTokens: (photoUsage.outputTokens || 0) + (consolidationUsage.outputTokens || 0),
      totalTokens: (photoUsage.inputTokens || 0) + (photoUsage.outputTokens || 0) + (consolidationUsage.totalTokens || 0),
    };
    const outputHash = computeOutputHash(validation.data);

    await finalizeIntelligenceCompleted(pool, intelligenceRow.id, { structuredOutput: validation.data, outputHash, usage: totalUsage });
    await finalizeExecutionReadyForDocument(pool, execucao.id);
    await logAiEvent(pool, { ...eventBase, tipoEvento: "AI_DAILY_ANALYSIS_COMPLETED", dados: { versao: intelligenceRow.versao, outputHash } });

    logInfo("automation_ai_processing_completed", { execucaoId: execucao.id, versao: intelligenceRow.versao });
    return { outcome: "READY", execucaoId: execucao.id, intelligenceId: intelligenceRow.id, versao: intelligenceRow.versao, outputHash };
  } catch (err) {
    const code = classifyAiError(err);
    await markIntelligenceFailed(pool, intelligenceRow.id, { code, message: err.message });
    await markExecutionAiError(pool, execucao.id, { code, message: err.message });
    await logAiEvent(pool, { ...eventBase, tipoEvento: "AI_PROCESSING_FAILED", dados: { code, message: err.message } });
    logWarn("automation_ai_processing_failed", { execucaoId: execucao.id, code, message: err.message });
    return { outcome: "ERROR_RECOVERABLE", code, execucaoId: execucao.id, intelligenceId: intelligenceRow.id };
  }
}

/**
 * Ponto de entrada principal (Seção 52). `force: true` cria uma NOVA versão
 * de inteligência para o MESMO snapshot mesmo que já exista uma COMPLETED —
 * sem isso, uma chamada repetida é sempre idempotente (Seção 9).
 */
async function processExecutionIntelligence({
  pool,
  empresaId = null,
  automacaoExecucaoId,
  aiClient,
  driveClient,
  force = false,
  maxAttempts = getAutomationAiMaxAttempts(),
}) {
  const preCheck = await loadExecucaoById(pool, automacaoExecucaoId);
  if (!preCheck || (empresaId != null && preCheck.empresa_id !== empresaId)) {
    return { outcome: "NOT_FOUND" };
  }

  return withAiLock(pool, aiLockKey(automacaoExecucaoId), async () => {
    const execucao = await loadExecucaoById(pool, automacaoExecucaoId);
    if (!execucao) return { outcome: "NOT_FOUND" };

    if (!execucao.current_snapshot_id) {
      return { outcome: "NO_SNAPSHOT", execucaoId: execucao.id };
    }

    const snapshot = await loadSnapshotById(pool, execucao.current_snapshot_id);
    const config = await loadConfigById(pool, execucao.automacao_config_id);
    const model = aiClient?.model;
    const promptVersion = DAILY_INTELLIGENCE_PROMPT_VERSION;

    // Idempotência (Seção 9): a chave é (execution, snapshot, prompt_version,
    // model) — não só (execution, snapshot). Uma análise COMPLETED gerada com
    // um model/prompt_version DIFERENTE do atual nunca é reaproveitada
    // silenciosamente (Seção 27: mudança de modelo/prompt pode gerar nova
    // versão), mesmo sem `force` explícito.
    const latestBeforeClaim = await loadLatestIntelligence(pool, { automacaoExecucaoId: execucao.id, snapshotId: snapshot.id });
    const latestMatchesConfig = Boolean(latestBeforeClaim && latestBeforeClaim.model === model && latestBeforeClaim.prompt_version === promptVersion);

    if (latestMatchesConfig && latestBeforeClaim.status === "COMPLETED" && !force) {
      await logAiEvent(pool, {
        empresaId: execucao.empresa_id,
        automacaoConfigId: execucao.automacao_config_id,
        automacaoExecucaoId: execucao.id,
        tipoEvento: "AI_RESULT_REUSED",
        dados: { versao: latestBeforeClaim.versao, snapshotId: snapshot.id },
      });
      return {
        outcome: "ALREADY_READY",
        execucaoId: execucao.id,
        intelligenceId: latestBeforeClaim.id,
        versao: latestBeforeClaim.versao,
        outputHash: latestBeforeClaim.output_hash,
      };
    }

    if (!config?.usa_ia) {
      const claimedDisabled = await claimExecutionForAiDisabled(pool, execucao.id);
      if (claimedDisabled) {
        await logAiEvent(pool, {
          empresaId: execucao.empresa_id,
          automacaoConfigId: execucao.automacao_config_id,
          automacaoExecucaoId: execucao.id,
          tipoEvento: "AI_PROCESSING_FAILED",
          dados: { code: "AI_DISABLED" },
        });
      }
      const fresh = claimedDisabled || (await loadExecucaoById(pool, execucao.id));
      return { outcome: "AI_DISABLED", execucaoId: fresh.id, currentStatus: fresh.status };
    }

    const claimed = await claimExecutionForAiProcessing(pool, execucao.id, { maxAttempts, force });
    if (!claimed) {
      const fresh = await loadExecucaoById(pool, execucao.id);
      return { outcome: "NOT_ELIGIBLE", currentStatus: fresh.status, execucaoId: fresh.id };
    }

    // Nova versão quando: o model/prompt_version mudou desde a última
    // tentativa (independente de force), OU quando force pediu explicitamente
    // reprocessar algo que já estava COMPLETED. Um retry comum de uma
    // tentativa FAILED (mesmo model/prompt) reaproveita a MESMA versão.
    let versao = 1;
    if (latestBeforeClaim) {
      versao =
        !latestMatchesConfig || (force && latestBeforeClaim.status === "COMPLETED")
          ? latestBeforeClaim.versao + 1
          : latestBeforeClaim.versao;
    }

    const allSourceRefs = [...buildValidSourceRefs(snapshot.snapshot)];
    const inputHash = computeInputHash({
      snapshotHash: snapshot.snapshot_hash,
      promptVersion,
      model,
      sourceRefsIncluded: allSourceRefs,
    });

    const intelligenceRow = await upsertIntelligenceAttempt(pool, {
      empresaId: execucao.empresa_id,
      automacaoExecucaoId: execucao.id,
      snapshotId: snapshot.id,
      versao,
      promptVersion,
      model,
      inputHash,
    });

    return runIntelligencePipeline({ pool, execucao: claimed, snapshot, config, intelligenceRow, aiClient, driveClient, model });
  });
}

async function getIntelligenceStatusForEmpresa(pool, { empresaId, automacaoExecucaoId }) {
  const { rows } = await pool.query(
    `SELECT id, status, snapshot_version, needs_reprocessing, has_late_inputs, erro_codigo, erro_mensagem, current_snapshot_id
     FROM automacao_execucoes WHERE id = $1 AND empresa_id = $2`,
    [automacaoExecucaoId, empresaId]
  );
  return rows[0] || null;
}

async function getCurrentIntelligenceForEmpresa(pool, { empresaId, automacaoExecucaoId }) {
  const { rows } = await pool.query(
    `SELECT i.*
     FROM automacao_execucao_inteligencias i
     JOIN automacao_execucoes e ON e.id = i.automacao_execucao_id
     WHERE e.id = $1 AND e.empresa_id = $2 AND i.snapshot_id = e.current_snapshot_id AND i.status = 'COMPLETED'
     ORDER BY i.versao DESC LIMIT 1`,
    [automacaoExecucaoId, empresaId]
  );
  return rows[0] || null;
}

async function listIntelligenceVersionsForEmpresa(pool, { empresaId, automacaoExecucaoId }) {
  const { rows } = await pool.query(
    `SELECT i.id, i.snapshot_id, i.versao, i.status, i.model, i.prompt_version, i.output_hash, i.erro_codigo, i.created_at, i.completed_at
     FROM automacao_execucao_inteligencias i
     JOIN automacao_execucoes e ON e.id = i.automacao_execucao_id
     WHERE e.id = $1 AND e.empresa_id = $2
     ORDER BY i.snapshot_id DESC, i.versao DESC`,
    [automacaoExecucaoId, empresaId]
  );
  return rows;
}

module.exports = {
  STALE_AI_PROCESSING_MINUTES,
  computeInputHash,
  computeOutputHash,
  processExecutionIntelligence,
  getIntelligenceStatusForEmpresa,
  getCurrentIntelligenceForEmpresa,
  listIntelligenceVersionsForEmpresa,
};
