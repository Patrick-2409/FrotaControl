"use strict";

/**
 * Motor de fechamento diário (Bloco 5) — transforma uma execução COLLECTING
 * num snapshot imutável, determinístico e auditável (READY_FOR_GENERATION),
 * sem gerar nenhum documento (isso é de um bloco futuro).
 *
 * Não depende de HTTP — pode ser chamado por testes, por um endpoint
 * administrativo futuro, ou por um scheduler futuro (nenhum dos dois existe
 * ainda; ver findExecutionsDueForClosing). Todo estado necessário vive no
 * Postgres (status, tentativas, snapshot) — nenhum Map/Set/timer em memória,
 * então um restart de processo nunca perde progresso (Seção 36).
 */

const { logInfo, logWarn } = require("../../../services/loggerService");
const { AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES, AUTOMATION_AI_RECOVERABLE_ERROR_CODES } = require("../constants/automationEnums");
const { isExecutionDueForClosing } = require("./closingTimeHelper");
const { buildExecutionSnapshot, computeSnapshotHash } = require("./snapshotBuilder");
const { claimSpecificPhotoMessage, processPhotoMessageStorage } = require("../storage/photoStorageService");
const { getMaxStorageAttempts, STALE_PROCESSING_MINUTES } = require("../storage/automationStorageConfig");

// Teto de segurança para quantas fotos distintas de UMA execução o motor
// examina numa única rodada de fechamento — nunca deveria ser alcançado na
// prática (um dia de obra não tem centenas de fotos pendentes), só evita um
// cenário patológico de crescer sem limite.
const PHOTO_RETRY_ROUND_LIMIT = 200;

function isRecoverableClosingErrorCode(code) {
  return AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES.includes(code);
}

function closingLockKey(automacaoConfigId, dataReferencia) {
  return `automacao_closing:${automacaoConfigId}:${dataReferencia}`;
}

/**
 * Advisory lock de SESSÃO (conexão dedicada, liberado explicitamente ao
 * final) escopado por (automacao_config_id, data_referencia) — Seção 7:
 * execuções de outra config ou outra data usam uma chave de hash diferente e
 * nunca esperam uma pela outra. Mantido só pela duração do fechamento desta
 * UMA execução (retry de fotos + construção do snapshot + persistência) —
 * nunca além disso.
 */
async function withClosingLock(pool, lockKeyText, fn) {
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

async function loadExecucaoByConfigAndData(pool, automacaoConfigId, dataReferencia) {
  const { rows } = await pool.query(
    `SELECT e.*, to_char(e.data_referencia, 'YYYY-MM-DD') AS "dataReferencia"
     FROM automacao_execucoes e
     WHERE e.automacao_config_id = $1 AND e.data_referencia = $2`,
    [automacaoConfigId, dataReferencia]
  );
  return rows[0] || null;
}

async function loadExecucaoById(pool, execucaoId) {
  const { rows } = await pool.query(
    `SELECT e.*, to_char(e.data_referencia, 'YYYY-MM-DD') AS "dataReferencia"
     FROM automacao_execucoes e WHERE e.id = $1`,
    [execucaoId]
  );
  return rows[0] || null;
}

async function loadConfigById(pool, automacaoConfigId) {
  const { rows } = await pool.query(`SELECT * FROM automacao_configs WHERE id = $1`, [automacaoConfigId]);
  return rows[0] || null;
}

/** Claim atômico COLLECTING|ERROR(recuperável) -> PROCESSING (Seção 8). */
async function claimExecutionForClosing(pool, execucaoId) {
  const { rows } = await pool.query(
    `WITH claimed AS (
       UPDATE automacao_execucoes
       SET status = 'PROCESSING', closing_started_at = NOW(), closing_attempts = closing_attempts + 1, updated_at = NOW()
       WHERE id = $1
         AND (status = 'COLLECTING' OR (status = 'ERROR' AND erro_codigo = ANY($2::text[])))
       RETURNING *
     )
     SELECT claimed.*, to_char(claimed.data_referencia, 'YYYY-MM-DD') AS "dataReferencia" FROM claimed`,
    [execucaoId, AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES]
  );
  return rows[0] || null;
}

/** Claim atômico READY_FOR_GENERATION -> PROCESSING, só para reprocessamento explícito (Seção 26). */
/**
 * Aceita como ponto de partida READY_FOR_GENERATION, mas também qualquer
 * estágio POSTERIOR: READY_FOR_DOCUMENT, ERROR recuperável (do fechamento OU
 * da IA — Bloco 6), AI_PROCESSING abandonado e, desde o Bloco 9,
 * AWAITING_APPROVAL/APPROVED/SENDING/SENT/REJECTED. Achado ao implementar o
 * Bloco 6 (Seção 42): um late input pode chegar depois que a execução já
 * avançou para a estruturação por IA, e um rebuild explícito precisa
 * conseguir suplantar QUALQUER um desses estágios — travar o claim em
 * READY_FOR_GENERATION (como este código fazia até o Bloco 5) tornaria o
 * rebuild impossível de chamar sempre que a IA já tivesse processado o
 * snapshot antigo.
 *
 * O Bloco 5 originalmente excluía AWAITING_APPROVAL em diante de propósito
 * ("um documento já aprovado nunca é suplantado silenciosamente"). O Bloco 9
 * precisa revisar essa decisão: Seção 4/37 da sua autorização exige
 * EXPLICITAMENTE o cenário "v1 aprovada -> late input chega -> rebuild -> IA
 * -> documento v2 -> aprovação v2" como forma de destravar uma execução cujo
 * documento aprovado ficou obsoleto. Isto continua seguro porque (a) o
 * rebuild aqui é sempre uma ação EXPLÍCITA de um humano/operador, nunca
 * automática; (b) o histórico de v1 (snapshot, inteligência, documento,
 * aprovação, e uma eventual distribuição) nunca é apagado nem alterado —
 * apenas uma versão NOVA (v2) passa a existir; e (c)
 * `documentDistributionService.js` já garante estruturalmente que a
 * aprovação de v1 nunca autoriza o envio de v2 (verifica
 * automacao_documento_id/versao_documento exatos). "Nunca silenciosamente"
 * continua verdadeiro — o que mudou é que "silenciosamente" nunca incluiu
 * uma chamada explícita e auditada a rebuildDailySnapshot.
 *
 * Bloco 10 (Seção 26): adiciona DOCUMENT_READY ao conjunto — um late input
 * pode chegar depois do documento já ter sido gerado mas ANTES de ter sido
 * enviado ao Telegram para aprovação. Este era um buraco real na cobertura
 * (READY_FOR_DOCUMENT e AWAITING_APPROVAL em diante já eram elegíveis;
 * DOCUMENT_READY, o estado exatamente entre os dois, nunca tinha sido
 * coberto) — o orquestrador automático torna este estado muito mais comum de
 * se observar de fato (a janela entre gerar o documento e enviá-lo pode
 * durar um ciclo inteiro), então corrigir agora é necessário para a Seção 26
 * funcionar. Continua sendo apenas uma AMPLIAÇÃO aditiva do conjunto já
 * existente — nenhum estado antes elegível deixa de ser.
 */
const REBUILD_RECOVERABLE_ERROR_CODES = [...AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES, ...AUTOMATION_AI_RECOVERABLE_ERROR_CODES];
const REBUILD_POST_APPROVAL_STATUSES = ["AWAITING_APPROVAL", "APPROVED", "SENDING", "SENT", "REJECTED"];

/** Mesmo conjunto de elegibilidade da query em claimExecutionForRebuild — mantido em JS só para a checagem antecipada (evita gastar closing_attempts num claim já sabido inútil). */
function isEligibleForRebuildClaim(execucao) {
  if (execucao.status === "READY_FOR_GENERATION" || execucao.status === "READY_FOR_DOCUMENT" || execucao.status === "DOCUMENT_READY") return true;
  if (REBUILD_POST_APPROVAL_STATUSES.includes(execucao.status)) return true;
  if (execucao.status === "ERROR" && REBUILD_RECOVERABLE_ERROR_CODES.includes(execucao.erro_codigo)) return true;
  if (execucao.status === "AI_PROCESSING" && new Date(execucao.updated_at).getTime() < Date.now() - 15 * 60 * 1000) return true;
  return false;
}

async function claimExecutionForRebuild(pool, execucaoId) {
  const { rows } = await pool.query(
    `WITH claimed AS (
       UPDATE automacao_execucoes
       SET status = 'PROCESSING', closing_started_at = NOW(), closing_attempts = closing_attempts + 1, updated_at = NOW()
       WHERE id = $1
         AND (
           status IN ('READY_FOR_GENERATION', 'READY_FOR_DOCUMENT', 'DOCUMENT_READY', 'AWAITING_APPROVAL', 'APPROVED', 'SENDING', 'SENT', 'REJECTED')
           OR (status = 'ERROR' AND erro_codigo = ANY($2::text[]))
           OR (status = 'AI_PROCESSING' AND updated_at < NOW() - INTERVAL '15 minutes')
         )
       RETURNING *
     )
     SELECT claimed.*, to_char(claimed.data_referencia, 'YYYY-MM-DD') AS "dataReferencia" FROM claimed`,
    [execucaoId, REBUILD_RECOVERABLE_ERROR_CODES]
  );
  return rows[0] || null;
}

async function countBlockingPhotos(pool, execucaoId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM telegram_mensagens
     WHERE automacao_execucao_id = $1 AND tipo = 'PHOTO' AND storage_status IN ('PENDING', 'PROCESSING')`,
    [execucaoId]
  );
  return rows[0].count;
}

async function markClosingRecoverableError(pool, execucaoId, { code, message }) {
  await pool.query(
    `UPDATE automacao_execucoes SET status = 'ERROR', erro_codigo = $2, erro_mensagem = $3, updated_at = NOW() WHERE id = $1`,
    [execucaoId, code, message]
  );
}

async function markClosingUnexpectedError(pool, execucaoId, { message }) {
  await pool.query(
    `UPDATE automacao_execucoes SET status = 'ERROR', erro_codigo = NULL, erro_mensagem = $2, updated_at = NOW() WHERE id = $1`,
    [execucaoId, String(message || "").slice(0, 4000)]
  );
}

/** Nunca reverte para COLLECTING — só READY_FOR_GENERATION aponta pro snapshot corrente (Seção 25). */
async function finalizeExecutionReady(pool, execucaoId, { snapshotId, snapshotVersion, clearReprocessing }) {
  await pool.query(
    `UPDATE automacao_execucoes
     SET status = 'READY_FOR_GENERATION', processado_em = NOW(), current_snapshot_id = $2,
         snapshot_version = $3, erro_codigo = NULL, erro_mensagem = NULL, updated_at = NOW()
         ${clearReprocessing ? ", needs_reprocessing = false" : ""}
     WHERE id = $1`,
    [execucaoId, snapshotId, snapshotVersion]
  );
}

/** Nunca UPDATE em cima de um snapshot anterior — cada fechamento/rebuild é uma linha NOVA (Seção 28). */
async function insertSnapshot(pool, { empresaId, automacaoExecucaoId, versao, snapshot, snapshotHash, metrics, reason }) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_execucao_snapshots (empresa_id, automacao_execucao_id, versao, snapshot, snapshot_hash, metrics, reason)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7)
     RETURNING *`,
    [empresaId, automacaoExecucaoId, versao, JSON.stringify(snapshot), snapshotHash, JSON.stringify(metrics), reason]
  );
  return rows[0];
}

async function logClosingEvent(pool, { empresaId, automacaoConfigId, automacaoExecucaoId, tipoEvento, dados }) {
  await pool.query(
    `INSERT INTO automacao_eventos (empresa_id, automacao_config_id, automacao_execucao_id, tipo_evento, origem, dados)
     VALUES ($1,$2,$3,$4,'SISTEMA',$5::jsonb)`,
    [empresaId, automacaoConfigId, automacaoExecucaoId, tipoEvento, JSON.stringify(dados || {})]
  );
}

/**
 * Uma tentativa de armazenamento por foto ainda bloqueante desta execução —
 * NUNCA um loop que fica reclamando a mesma foto até esgotar suas tentativas
 * (Seção 13: "uma tentativa do motor de fechamento por chamada é
 * suficiente"). Isso importa de verdade: `processPendingPhotoStorage` do
 * Bloco 4 (fila genérica) reclama "a próxima elegível" em loop — se usada
 * aqui, uma foto que falha volta pra PENDING e fica IMEDIATAMENTE elegível
 * de novo dentro do MESMO loop, esgotando `storage_attempts` inteiro numa
 * única chamada de fechamento em vez de espalhar as tentativas ao longo de
 * várias chamadas (o comportamento pretendido de AUTOMATION_STORAGE_MAX_ATTEMPTS).
 * Por isso o Bloco 5 lista as fotos bloqueantes UMA vez e usa
 * `claimSpecificPhotoMessage` (por id) para tentar cada uma exatamente uma vez.
 */
async function retryBlockingPhotosOnce({ pool, execucaoId, telegramFileClient, googleDriveClient, maxStorageAttempts }) {
  const maxAttempts = maxStorageAttempts ?? getMaxStorageAttempts();
  const { rows: blocking } = await pool.query(
    `SELECT id FROM telegram_mensagens
     WHERE automacao_execucao_id = $1 AND tipo = 'PHOTO'
       AND (
         storage_status = 'PENDING'
         OR (storage_status = 'PROCESSING' AND storage_last_attempt_at < NOW() - ($2 || ' minutes')::interval)
       )
       AND storage_attempts < $3
     ORDER BY created_at ASC
     LIMIT $4`,
    [execucaoId, STALE_PROCESSING_MINUTES, maxAttempts, PHOTO_RETRY_ROUND_LIMIT]
  );

  const summary = { processed: 0, succeeded: 0, failed: 0 };
  for (const { id: mensagemId } of blocking) {
    const claimed = await claimSpecificPhotoMessage(pool, mensagemId, { maxAttempts });
    if (!claimed) continue; // não elegível mais no instante do claim (outro processo já resolveu) — nada a fazer
    summary.processed += 1;
    try {
      await processPhotoMessageStorage({ mensagem: claimed, pool, telegramFileClient, googleDriveClient, maxAttempts });
      summary.succeeded += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}

/**
 * Pipeline compartilhado entre fechamento inicial e rebuild — a única
 * diferença de verdade entre os dois é COMO a execução chegou a PROCESSING
 * (claim de COLLECTING/ERROR vs. claim de READY_FOR_GENERATION) e o `reason`
 * gravado no snapshot. Tudo o resto (retry de fotos, checagem de bloqueio,
 * construção do snapshot, hash, persistência, eventos) é idêntico.
 */
async function runClosingPipeline({ pool, execucao, telegramFileClient, googleDriveClient, maxStorageAttempts, reason }) {
  const eventBase = {
    empresaId: execucao.empresa_id,
    automacaoConfigId: execucao.automacao_config_id,
    automacaoExecucaoId: execucao.id,
  };

  await logClosingEvent(pool, { ...eventBase, tipoEvento: "DAILY_CLOSING_STARTED", dados: { reason } });

  try {
    // Seção 13: exatamente uma tentativa por foto ainda bloqueante desta
    // execução, nunca um loop que esgota as tentativas de uma só foto numa
    // única chamada (ver retryBlockingPhotosOnce acima).
    if (telegramFileClient && googleDriveClient) {
      const retrySummary = await retryBlockingPhotosOnce({
        pool,
        execucaoId: execucao.id,
        telegramFileClient,
        googleDriveClient,
        maxStorageAttempts,
      });
      if (retrySummary.processed > 0) {
        await logClosingEvent(pool, { ...eventBase, tipoEvento: "PHOTO_STORAGE_RETRY_REQUESTED", dados: retrySummary });
      }
    }

    // Seção 12/14: só fecha se nenhuma foto ainda "processável" restar.
    // FAILED (erro definitivo do Bloco 4) nunca bloqueia — vira alerta no
    // snapshot (Seção 15), não um impedimento eterno.
    const blockingCount = await countBlockingPhotos(pool, execucao.id);
    if (blockingCount > 0) {
      await markClosingRecoverableError(pool, execucao.id, {
        code: "PHOTO_STORAGE_PENDING",
        message: `${blockingCount} foto(s) ainda não armazenada(s) definitivamente — fechamento pode ser tentado novamente.`,
      });
      await logClosingEvent(pool, {
        ...eventBase,
        tipoEvento: "DAILY_CLOSING_FAILED",
        dados: { code: "PHOTO_STORAGE_PENDING", blockingCount },
      });
      logWarn("automation_daily_closing_recoverable_error", { execucaoId: execucao.id, blockingCount });
      return { outcome: "ERROR_RECOVERABLE", code: "PHOTO_STORAGE_PENDING", execucaoId: execucao.id, blockingCount };
    }

    const config = await loadConfigById(pool, execucao.automacao_config_id);
    const { snapshot, metrics } = await buildExecutionSnapshot(pool, {
      execucaoId: execucao.id,
      dataReferencia: execucao.dataReferencia,
      timezone: config.timezone,
    });
    const snapshotHash = computeSnapshotHash(snapshot);
    const nextVersion = (execucao.snapshot_version || 0) + 1;

    const snapshotRow = await insertSnapshot(pool, {
      empresaId: execucao.empresa_id,
      automacaoExecucaoId: execucao.id,
      versao: nextVersion,
      snapshot,
      snapshotHash,
      metrics,
      reason,
    });
    await logClosingEvent(pool, {
      ...eventBase,
      tipoEvento: "DAILY_SNAPSHOT_CREATED",
      dados: { versao: nextVersion, hash: snapshotHash, metrics },
    });

    await finalizeExecutionReady(pool, execucao.id, {
      snapshotId: snapshotRow.id,
      snapshotVersion: nextVersion,
      clearReprocessing: reason === "REBUILD",
    });

    if (reason === "REBUILD") {
      await logClosingEvent(pool, {
        ...eventBase,
        tipoEvento: "DAILY_SNAPSHOT_REBUILT",
        dados: { versao: nextVersion, hash: snapshotHash },
      });
    }
    await logClosingEvent(pool, { ...eventBase, tipoEvento: "DAILY_CLOSING_COMPLETED", dados: { versao: nextVersion } });

    logInfo("automation_daily_closing_completed", { execucaoId: execucao.id, versao: nextVersion, reason });
    return { outcome: "READY", execucaoId: execucao.id, snapshotVersion: nextVersion, snapshotHash };
  } catch (err) {
    await markClosingUnexpectedError(pool, execucao.id, { message: err.message });
    await logClosingEvent(pool, { ...eventBase, tipoEvento: "DAILY_CLOSING_FAILED", dados: { message: err.message } });
    logWarn("automation_daily_closing_unexpected_error", { execucaoId: execucao.id, message: err.message });
    throw err;
  }
}

/**
 * Ponto de entrada do fechamento inicial (COLLECTING -> READY_FOR_GENERATION).
 * `empresaId`, se informado, é checado contra a execução encontrada — nunca
 * revela se ela existe (mesmo outcome "NO_EXECUTION") quando pertence a outra
 * empresa (Seção 38).
 */
async function closeDailyExecution({
  pool,
  empresaId = null,
  automacaoConfigId,
  referenceDate,
  telegramFileClient = null,
  googleDriveClient = null,
  maxStorageAttempts,
}) {
  const preCheck = await loadExecucaoByConfigAndData(pool, automacaoConfigId, referenceDate);
  // Seção 11: sem execução (sem movimento naquele dia), não há o que fechar
  // — nunca cria uma execução artificial só para poder fechá-la.
  if (!preCheck || (empresaId != null && preCheck.empresa_id !== empresaId)) {
    return { outcome: "NO_EXECUTION" };
  }

  return withClosingLock(pool, closingLockKey(automacaoConfigId, referenceDate), async () => {
    const execucao = await loadExecucaoByConfigAndData(pool, automacaoConfigId, referenceDate);
    if (!execucao) return { outcome: "NO_EXECUTION" };

    if (execucao.status === "READY_FOR_GENERATION") {
      return { outcome: "ALREADY_READY", execucaoId: execucao.id, snapshotVersion: execucao.snapshot_version };
    }
    const eligible =
      execucao.status === "COLLECTING" || (execucao.status === "ERROR" && isRecoverableClosingErrorCode(execucao.erro_codigo));
    if (!eligible) {
      return { outcome: "NOT_ELIGIBLE", currentStatus: execucao.status, execucaoId: execucao.id };
    }

    const claimed = await claimExecutionForClosing(pool, execucao.id);
    if (!claimed) {
      const fresh = await loadExecucaoById(pool, execucao.id);
      if (fresh.status === "READY_FOR_GENERATION") {
        return { outcome: "ALREADY_READY", execucaoId: fresh.id, snapshotVersion: fresh.snapshot_version };
      }
      return { outcome: "NOT_ELIGIBLE", currentStatus: fresh.status, execucaoId: fresh.id };
    }

    return runClosingPipeline({ pool, execucao: claimed, telegramFileClient, googleDriveClient, maxStorageAttempts, reason: "INITIAL_CLOSING" });
  });
}

/**
 * Reprocessamento explícito (Seção 26/27) — só incorpora late inputs quando
 * chamado de propósito, nunca automaticamente. Sempre gera uma linha NOVA em
 * automacao_execucao_snapshots (versão += 1); a anterior nunca é apagada.
 */
async function rebuildDailySnapshot({
  pool,
  empresaId = null,
  automacaoExecucaoId,
  telegramFileClient = null,
  googleDriveClient = null,
  maxStorageAttempts,
}) {
  const preCheck = await loadExecucaoById(pool, automacaoExecucaoId);
  if (!preCheck || (empresaId != null && preCheck.empresa_id !== empresaId)) {
    return { outcome: "NOT_FOUND" };
  }

  return withClosingLock(pool, closingLockKey(preCheck.automacao_config_id, preCheck.dataReferencia), async () => {
    const execucao = await loadExecucaoById(pool, automacaoExecucaoId);
    if (!execucao) return { outcome: "NOT_FOUND" };

    // Mesmo conjunto aceito por claimExecutionForRebuild — checagem antecipada
    // só para devolver NOT_ELIGIBLE_FOR_REBUILD sem gastar um claim_attempts
    // quando o estado é obviamente fora de alcance (ex.: ainda COLLECTING).
    if (!isEligibleForRebuildClaim(execucao)) {
      return { outcome: "NOT_ELIGIBLE_FOR_REBUILD", currentStatus: execucao.status, execucaoId: execucao.id };
    }

    const claimed = await claimExecutionForRebuild(pool, execucao.id);
    if (!claimed) {
      const fresh = await loadExecucaoById(pool, execucao.id);
      return { outcome: "NOT_ELIGIBLE_FOR_REBUILD", currentStatus: fresh.status, execucaoId: fresh.id };
    }

    return runClosingPipeline({ pool, execucao: claimed, telegramFileClient, googleDriveClient, maxStorageAttempts, reason: "REBUILD" });
  });
}

/**
 * Lista candidatas a fechamento (Seção 35) — preparação para um scheduler
 * futuro (nenhum é criado aqui: sem cron, sem setInterval). A checagem
 * "due" em si é feita em JS via `isExecutionDueForClosing`, reaproveitando
 * exatamente a mesma lógica testada em closingTimeHelper.test.js.
 */
async function findExecutionsDueForClosing(pool, now) {
  const { rows } = await pool.query(
    `SELECT e.id AS execucao_id, e.automacao_config_id, e.status,
            to_char(e.data_referencia, 'YYYY-MM-DD') AS "dataReferencia",
            c.timezone, c.horario_fechamento, c.ativo, c.deleted_at
     FROM automacao_execucoes e
     JOIN automacao_configs c ON c.id = e.automacao_config_id
     WHERE e.status = 'COLLECTING'
       AND c.ativo = true AND c.deleted_at IS NULL
       AND c.horario_fechamento IS NOT NULL`
  );
  return rows
    .filter((row) =>
      isExecutionDueForClosing(
        { ativo: row.ativo, deleted_at: row.deleted_at, timezone: row.timezone, horario_fechamento: row.horario_fechamento },
        { status: row.status, dataReferencia: row.dataReferencia },
        now
      )
    )
    .map((row) => ({
      automacaoConfigId: row.automacao_config_id,
      execucaoId: row.execucao_id,
      dataReferencia: row.dataReferencia,
    }));
}

/** Leitura tenant-safe do status de fechamento — nunca distingue "não existe" de "existe, mas é de outra empresa" (Seção 38). */
async function getExecutionClosingStatusForEmpresa(pool, { empresaId, automacaoExecucaoId }) {
  const { rows } = await pool.query(
    `SELECT id, status, snapshot_version, needs_reprocessing, has_late_inputs, erro_codigo, erro_mensagem,
            current_snapshot_id, to_char(data_referencia, 'YYYY-MM-DD') AS "dataReferencia"
     FROM automacao_execucoes WHERE id = $1 AND empresa_id = $2`,
    [automacaoExecucaoId, empresaId]
  );
  return rows[0] || null;
}

/** Leitura tenant-safe do snapshot CORRENTE de uma execução. */
async function getCurrentSnapshotForEmpresa(pool, { empresaId, automacaoExecucaoId }) {
  const { rows } = await pool.query(
    `SELECT s.*
     FROM automacao_execucao_snapshots s
     JOIN automacao_execucoes e ON e.id = s.automacao_execucao_id
     WHERE e.id = $1 AND e.empresa_id = $2 AND s.id = e.current_snapshot_id`,
    [automacaoExecucaoId, empresaId]
  );
  return rows[0] || null;
}

module.exports = {
  PHOTO_RETRY_ROUND_LIMIT,
  isRecoverableClosingErrorCode,
  closingLockKey,
  closeDailyExecution,
  rebuildDailySnapshot,
  findExecutionsDueForClosing,
  getExecutionClosingStatusForEmpresa,
  getCurrentSnapshotForEmpresa,
};
