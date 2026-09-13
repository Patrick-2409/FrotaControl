"use strict";

/**
 * Bloco 10, Seção 10-13/43-47 — testes de DESCOBERTA em isolamento (linhas
 * de `automacao_execucoes`/`automacao_solicitacoes_aprovacao` inseridas
 * diretamente via SQL, sem rodar o pipeline inteiro — mais rápido e preciso
 * para provar cada predicado de elegibilidade isoladamente).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const {
  discoverEligibleExecutions,
  findStaleInputPendingCandidates,
  findPostSendLateInputCandidates,
  findRegenerationPendingCandidates,
  findDistributionPendingCandidates,
  findAiPendingCandidates,
  findDocumentPendingCandidates,
  findApprovalSendPendingCandidates,
  findRetryPendingCandidates,
} = require("../src/modules/automations/orchestrator/orchestratorDiscovery");

const RUN_TAG = `orqdisc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const createdEmpresaIds = [];

test.before(async () => {
  await initAutomationsSchema(pool);
});

test.after(async () => {
  if (createdEmpresaIds.length) {
    await pool.query(`DELETE FROM empresas WHERE id = ANY($1::int[])`, [createdEmpresaIds]);
  }
  await pool.end();
});

async function createEmpresa(nome) {
  const { rows } = await pool.query(`INSERT INTO empresas (nome) VALUES ($1) RETURNING id`, [`${RUN_TAG}-${nome}`]);
  createdEmpresaIds.push(rows[0].id);
  return rows[0].id;
}

let chatSeq = 1;
async function createConfig(empresaId, overrides = {}) {
  const cat = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  const chatId = overrides.chatId ?? -(9_000_000 + chatSeq++);
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, telegram_chat_id, ativo, timezone, horario_fechamento, usa_ia)
     VALUES ($1,$2,'cfg',$3,true,'America/Sao_Paulo',$4,true) RETURNING *`,
    [empresaId, cat.rows[0].id, chatId, overrides.horarioFechamento ?? "18:00:00"]
  );
  return rows[0];
}

let execSeq = 1;
async function createExecucao(config, overrides = {}) {
  const dataReferencia = overrides.dataReferencia ?? `2026-01-${String(10 + (execSeq % 15)).padStart(2, "0")}`;
  execSeq += 1;
  const { rows } = await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia, status, needs_reprocessing, has_late_inputs, post_send_late_input, erro_codigo, updated_at)
     VALUES ($1,$2,$3,$4,$5,$5,$6,$7, COALESCE($8, NOW()))
     RETURNING *`,
    [
      config.id,
      config.empresa_id,
      dataReferencia,
      overrides.status ?? "COLLECTING",
      overrides.needsReprocessing ?? false,
      overrides.postSendLateInput ?? false,
      overrides.erroCodigo ?? null,
      overrides.updatedAt ?? null,
    ]
  );
  return rows[0];
}

test("STALE_INPUT_PENDING: needs_reprocessing em status elegível para rebuild é selecionada; SENT nunca entra aqui (isso é POST_SEND)", async () => {
  const empresaId = await createEmpresa("staleinput");
  const config = await createConfig(empresaId);
  const elegivel = await createExecucao(config, { status: "AWAITING_APPROVAL", needsReprocessing: true });
  const naoElegivelSent = await createExecucao(config, { status: "SENT", needsReprocessing: true });
  const naoElegivelSemLateInput = await createExecucao(config, { status: "AWAITING_APPROVAL", needsReprocessing: false });

  const candidates = await findStaleInputPendingCandidates(pool);
  const ids = candidates.map((c) => c.execucaoId);
  assert.ok(ids.includes(elegivel.id));
  assert.ok(!ids.includes(naoElegivelSent.id));
  assert.ok(!ids.includes(naoElegivelSemLateInput.id));
});

test("POST_SEND_LATE_INPUT_PENDING: só SENT+needs_reprocessing+post_send_late_input=false; já sinalizada não aparece de novo", async () => {
  const empresaId = await createEmpresa("postsend");
  const config = await createConfig(empresaId);
  const pendente = await createExecucao(config, { status: "SENT", needsReprocessing: true, postSendLateInput: false });
  const jaSinalizada = await createExecucao(config, { status: "SENT", needsReprocessing: true, postSendLateInput: true });
  const sentSemLateInput = await createExecucao(config, { status: "SENT", needsReprocessing: false });

  const candidates = await findPostSendLateInputCandidates(pool);
  const ids = candidates.map((c) => c.execucaoId);
  assert.ok(ids.includes(pendente.id));
  assert.ok(!ids.includes(jaSinalizada.id), "nunca deveria sinalizar a MESMA pendência de novo (Seção 29 — só uma vez)");
  assert.ok(!ids.includes(sentSemLateInput.id));
});

test("REGENERATION_PENDING: só solicitação SUPERSEDED+REGENERATION não processada", async () => {
  const empresaId = await createEmpresa("regenpendente");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config, { status: "AWAITING_APPROVAL" });

  // documento + solicitação mínimos para satisfazer as FKs
  const { rows: snap } = await pool.query(
    `INSERT INTO automacao_execucao_snapshots (empresa_id, automacao_execucao_id, versao, snapshot, snapshot_hash, reason) VALUES ($1,$2,1,'{}'::jsonb,'h1','INITIAL_CLOSING') RETURNING id`,
    [empresaId, execucao.id]
  );
  const { rows: intel } = await pool.query(
    `INSERT INTO automacao_execucao_inteligencias (empresa_id, automacao_execucao_id, snapshot_id, versao, status, structured_output, output_hash, prompt_version, model)
     VALUES ($1,$2,$3,1,'COMPLETED','{}'::jsonb,'ih1','v1','fake') RETURNING id`,
    [empresaId, execucao.id, snap[0].id]
  );
  const { rows: tpl } = await pool.query(`SELECT id FROM automacao_templates WHERE codigo = 'diario_obra_ppflora'`);
  const { rows: doc } = await pool.query(
    `INSERT INTO automacao_execucao_documentos (empresa_id, automacao_execucao_id, snapshot_id, intelligence_id, automacao_template_id, versao, generator_id, status, input_hash)
     VALUES ($1,$2,$3,$4,$5,1,'diario_obra_ppflora_v1','COMPLETED','dh1') RETURNING id`,
    [empresaId, execucao.id, snap[0].id, intel[0].id, tpl[0].id]
  );
  async function createSolicitacao({ status, supersededReason, processed }) {
    const { rows } = await pool.query(
      `INSERT INTO automacao_solicitacoes_aprovacao (empresa_id, automacao_config_id, automacao_execucao_id, automacao_documento_id, versao_documento, status, superseded_reason, regeneration_processed_at)
       VALUES ($1,$2,$3,$4,1,$5,$6,$7) RETURNING *`,
      [empresaId, config.id, execucao.id, doc[0].id, status, supersededReason, processed ? new Date() : null]
    );
    return rows[0];
  }

  const pendente = await createSolicitacao({ status: "SUPERSEDED", supersededReason: "REGENERATION", processed: false });
  const candidates = await findRegenerationPendingCandidates(pool);
  assert.ok(candidates.some((c) => c.execucaoId === execucao.id && c.solicitacaoId === pendente.id));

  await pool.query(`DELETE FROM automacao_solicitacoes_aprovacao WHERE id = $1`, [pendente.id]);
  await createSolicitacao({ status: "SUPERSEDED", supersededReason: "LATE_INPUT", processed: false });
  const candidatesLateInput = await findRegenerationPendingCandidates(pool);
  assert.ok(!candidatesLateInput.some((c) => c.execucaoId === execucao.id), "SUPERSEDED por LATE_INPUT nunca é uma regeneração humana pendente");

  await pool.query(`UPDATE automacao_solicitacoes_aprovacao SET superseded_reason = 'REGENERATION', regeneration_processed_at = NOW() WHERE automacao_execucao_id = $1`, [execucao.id]);
  const candidatesProcessed = await findRegenerationPendingCandidates(pool);
  assert.ok(!candidatesProcessed.some((c) => c.execucaoId === execucao.id), "já processada nunca reaparece");
});

test("DISTRIBUTION_PENDING: só APPROVED sem needs_reprocessing", async () => {
  const empresaId = await createEmpresa("distpendente");
  const config = await createConfig(empresaId);
  const elegivel = await createExecucao(config, { status: "APPROVED" });
  const stale = await createExecucao(config, { status: "APPROVED", needsReprocessing: true });

  const candidates = await findDistributionPendingCandidates(pool);
  const ids = candidates.map((c) => c.execucaoId);
  assert.ok(ids.includes(elegivel.id));
  assert.ok(!ids.includes(stale.id), "com needs_reprocessing=true, quem decide é STALE_INPUT_PENDING, nunca a distribuição direta");
});

test("AI_PENDING e DOCUMENT_PENDING: status certo, sem needs_reprocessing", async () => {
  const empresaId = await createEmpresa("aidocpendente");
  const config = await createConfig(empresaId);
  const readyAi = await createExecucao(config, { status: "READY_FOR_GENERATION" });
  const readyDoc = await createExecucao(config, { status: "READY_FOR_DOCUMENT" });

  const aiCandidates = await findAiPendingCandidates(pool);
  assert.ok(aiCandidates.some((c) => c.execucaoId === readyAi.id));
  const docCandidates = await findDocumentPendingCandidates(pool);
  assert.ok(docCandidates.some((c) => c.execucaoId === readyDoc.id));
});

test("RETRY_PENDING: erro recuperável respeita o cooldown; erro não-recuperável nunca aparece", async () => {
  const empresaId = await createEmpresa("retrypendente");
  const config = await createConfig(empresaId);
  const now = new Date();
  const recenteDemais = await createExecucao(config, { status: "ERROR", erroCodigo: "AI_TIMEOUT", updatedAt: now });
  const jaResfriado = await createExecucao(config, { status: "ERROR", erroCodigo: "AI_TIMEOUT", updatedAt: new Date(now.getTime() - 10 * 60 * 1000) });
  const naoRecuperavel = await createExecucao(config, { status: "ERROR", erroCodigo: "AI_DISABLED", updatedAt: new Date(now.getTime() - 10 * 60 * 1000) });

  const candidates = await findRetryPendingCandidates(pool, { now, cooldownSeconds: 120 });
  const ids = candidates.map((c) => c.execucaoId);
  assert.ok(!ids.includes(recenteDemais.id), "dentro do cooldown nunca deveria ser selecionada de novo");
  assert.ok(ids.includes(jaResfriado.id), "fora do cooldown precisa ser selecionada");
  assert.ok(!ids.includes(naoRecuperavel.id), "erro não-recuperável exige ação humana, nunca aparece para retry automático");
});

test("APPROVAL_SEND_PENDING: DOCUMENT_READY sempre elegível quando nunca houve tentativa de envio", async () => {
  const empresaId = await createEmpresa("apprsendpendente");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config, { status: "DOCUMENT_READY" });

  const candidates = await findApprovalSendPendingCandidates(pool, { now: new Date(), cooldownSeconds: 120 });
  assert.ok(candidates.some((c) => c.execucaoId === execucao.id));
});

test("discoverEligibleExecutions: prioridade correta quando a MESMA execução se qualifica em mais de uma categoria; ORDER BY explícito (fairness por updated_at)", async () => {
  const empresaId = await createEmpresa("prioridade");
  const config = await createConfig(empresaId);
  const now = new Date();

  // Duas candidatas de MESMA prioridade (AI_PENDING) com updated_at diferentes -> a mais antiga vem primeiro.
  const maisAntiga = await createExecucao(config, { status: "READY_FOR_GENERATION", updatedAt: new Date(now.getTime() - 60_000) });
  const maisNova = await createExecucao(config, { status: "READY_FOR_GENERATION", updatedAt: now });

  const { scanned } = await discoverEligibleExecutions(pool, { now, batchSize: 100, retryCooldownSeconds: 120 });
  const idx = (id) => scanned.findIndex((c) => c.execucaoId === id);
  assert.ok(idx(maisAntiga.id) < idx(maisNova.id), "dentro da mesma prioridade, quem espera há mais tempo vem primeiro");
});

test("discoverEligibleExecutions: respeita batchSize (scanned pode ser maior que o lote processável)", async () => {
  const empresaId = await createEmpresa("batchsize");
  const config = await createConfig(empresaId);
  for (let i = 0; i < 5; i += 1) {
    await createExecucao(config, { status: "READY_FOR_GENERATION", dataReferencia: `2026-02-${String(10 + i).padStart(2, "0")}` });
  }

  const { scanned, batch } = await discoverEligibleExecutions(pool, { now: new Date(), batchSize: 2, retryCooldownSeconds: 120 });
  const scannedForThisConfig = scanned.filter((c) => c.automacaoConfigId === config.id);
  const batchForThisConfig = batch.filter((c) => c.automacaoConfigId === config.id);
  assert.ok(scannedForThisConfig.length >= 5);
  assert.ok(batch.length <= 2, "o lote processável nunca deveria exceder o batchSize pedido");
  assert.ok(batchForThisConfig.length <= 2);
});
