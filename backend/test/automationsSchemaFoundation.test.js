"use strict";

/**
 * Testes de fundação do módulo de Automações (Bloco 1).
 *
 * Diferente da maioria dos testes do projeto (que mockam `db.pool.query` para
 * testar lógica de aplicação sem tocar banco), estes testes validam CONSTRAINTS
 * REAIS de banco (UNIQUE, CHECK, FK) — isso só é possível contra um Postgres de
 * verdade, nunca com mock. Rodam contra `DATABASE_URL` do `.env` local (Postgres
 * do docker-compose, isolado de produção). Todo dado criado usa identificadores
 * únicos (timestamp) e é removido no `after` via `DELETE FROM empresas` (que
 * cascateia por FK para todas as tabelas do módulo) — nunca toca dado pré-existente.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const {
  AUTOMATION_EXECUTION_STATUSES,
  AUTOMATION_FILE_TYPES,
} = require("../src/modules/automations/constants/automationEnums");

const RUN_TAG = `automtest-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const createdEmpresaIds = [];
const createdAutomacaoIds = [];

async function createEmpresa(nome) {
  const { rows } = await pool.query(
    `INSERT INTO empresas (nome) VALUES ($1) RETURNING id`,
    [`${RUN_TAG}-${nome}`]
  );
  createdEmpresaIds.push(rows[0].id);
  return rows[0].id;
}

async function createAutomacao(codigo) {
  const { rows } = await pool.query(
    `INSERT INTO automacoes (codigo, nome) VALUES ($1, $2) RETURNING id`,
    [`${RUN_TAG}-${codigo}`, `Automação de teste ${codigo}`]
  );
  createdAutomacaoIds.push(rows[0].id);
  return rows[0].id;
}

async function createConfig(empresaId, automacaoId, overrides = {}) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, label, projeto_nome)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      empresaId,
      automacaoId,
      overrides.nome || `${RUN_TAG}-config`,
      overrides.label || null,
      overrides.projeto_nome || null,
    ]
  );
  return rows[0].id;
}

test.before(async () => {
  // Idempotência é o primeiro fato validado: já rodou em src/db.js::initDb() no
  // startup normal da app, mas chamamos de novo aqui de propósito para provar
  // que múltiplas chamadas nunca falham nem duplicam objetos.
  await initAutomationsSchema(pool);
  await initAutomationsSchema(pool);
});

test.after(async () => {
  // ON DELETE CASCADE em toda a árvore operacional cuida da limpeza a partir da
  // empresa; automacoes (catálogo global, sem empresa_id) é limpo à parte.
  if (createdEmpresaIds.length) {
    await pool.query(`DELETE FROM empresas WHERE id = ANY($1::int[])`, [createdEmpresaIds]);
  }
  if (createdAutomacaoIds.length) {
    await pool.query(`DELETE FROM automacoes WHERE id = ANY($1::int[])`, [createdAutomacaoIds]);
  }
  await pool.end();
});

test("initAutomationsSchema é idempotente e não derruba o initDb existente", async () => {
  // Já executado 2x em before(); aqui só confirmamos que as tabelas existem.
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [[
      "automacoes",
      "automacao_templates",
      "automacao_configs",
      "automacao_execucoes",
      "automacao_eventos",
      "automacao_arquivos",
      "automacao_aprovacoes",
      "automacao_destinatarios",
      "automacao_aprovadores",
      "telegram_mensagens",
    ]]
  );
  assert.equal(rows.length, 10, "todas as 10 tabelas do módulo devem existir");
});

test("constantes de status em JS batem com a CHECK constraint do banco", async () => {
  const { rows } = await pool.query(
    `SELECT pg_get_constraintdef(oid) AS def
     FROM pg_constraint WHERE conname = 'automacao_execucoes_status_chk'`
  );
  assert.equal(rows.length, 1);
  for (const status of AUTOMATION_EXECUTION_STATUSES) {
    assert.ok(rows[0].def.includes(status), `status ${status} deveria estar na CHECK constraint`);
  }
});

test("execução diária duplicada é bloqueada por UNIQUE(automacao_config_id, data_referencia)", async () => {
  const empresaId = await createEmpresa("execucao-dup");
  const automacaoId = await createAutomacao("diario-obra-dup");
  const configId = await createConfig(empresaId, automacaoId);

  await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia)
     VALUES ($1, $2, '2026-09-11')`,
    [configId, empresaId]
  );

  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia)
         VALUES ($1, $2, '2026-09-11')`,
        [configId, empresaId]
      ),
    (err) => {
      assert.equal(err.code, "23505", "deve ser violação de unique_violation");
      return true;
    }
  );

  // Data diferente para a mesma config: deve funcionar normalmente.
  await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia)
     VALUES ($1, $2, '2026-09-12')`,
    [configId, empresaId]
  );
});

test("status fora do domínio conhecido é rejeitado pela CHECK constraint", async () => {
  const empresaId = await createEmpresa("status-invalido");
  const automacaoId = await createAutomacao("diario-obra-status");
  const configId = await createConfig(empresaId, automacaoId);

  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia, status)
         VALUES ($1, $2, '2026-09-11', 'ESTADO_INEXISTENTE')`,
        [configId, empresaId]
      ),
    (err) => {
      assert.equal(err.code, "23514", "deve ser violação de check_violation");
      return true;
    }
  );
});

test("múltiplas configurações da mesma automação coexistem na mesma empresa (Obra A / Obra B)", async () => {
  const empresaId = await createEmpresa("multi-config");
  const automacaoId = await createAutomacao("diario-obra-multi");

  const configObraA = await createConfig(empresaId, automacaoId, { projeto_nome: "Obra A" });
  const configObraB = await createConfig(empresaId, automacaoId, { projeto_nome: "Obra B" });

  assert.notEqual(configObraA, configObraB);

  const { rows } = await pool.query(
    `SELECT id, projeto_nome FROM automacao_configs WHERE empresa_id = $1 ORDER BY id`,
    [empresaId]
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.projeto_nome).sort(),
    ["Obra A", "Obra B"]
  );
});

test("isolamento por empresa: filtro por empresa_id nunca retorna dado de outra empresa", async () => {
  const empresaA = await createEmpresa("isolamento-a");
  const empresaB = await createEmpresa("isolamento-b");
  const automacaoId = await createAutomacao("diario-obra-isolamento");

  await createConfig(empresaA, automacaoId, { nome: "config-empresa-a" });
  await createConfig(empresaB, automacaoId, { nome: "config-empresa-b" });

  const { rows: rowsA } = await pool.query(
    `SELECT nome FROM automacao_configs WHERE empresa_id = $1`,
    [empresaA]
  );
  const { rows: rowsB } = await pool.query(
    `SELECT nome FROM automacao_configs WHERE empresa_id = $1`,
    [empresaB]
  );

  assert.ok(rowsA.every((r) => r.nome === "config-empresa-a"));
  assert.ok(rowsB.every((r) => r.nome === "config-empresa-b"));
  assert.equal(rowsA.some((r) => r.nome === "config-empresa-b"), false);
});

test("foreign key impede automacao_config órfã (empresa inexistente)", async () => {
  const automacaoId = await createAutomacao("diario-obra-fk");
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO automacao_configs (empresa_id, automacao_id, nome) VALUES ($1, $2, 'orfa')`,
        [999999999, automacaoId]
      ),
    (err) => {
      assert.equal(err.code, "23503", "deve ser violação de foreign_key_violation");
      return true;
    }
  );
});

test("apagar empresa cascateia para automacao_configs e automacao_execucoes (nunca deixa órfão)", async () => {
  const empresaId = await createEmpresa("cascade");
  const automacaoId = await createAutomacao("diario-obra-cascade");
  const configId = await createConfig(empresaId, automacaoId);
  const { rows } = await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia)
     VALUES ($1, $2, '2026-09-11') RETURNING id`,
    [configId, empresaId]
  );
  const execucaoId = rows[0].id;

  await pool.query(`DELETE FROM empresas WHERE id = $1`, [empresaId]);
  createdEmpresaIds.splice(createdEmpresaIds.indexOf(empresaId), 1); // já removida, evita erro no after()

  const { rows: configRows } = await pool.query(
    `SELECT id FROM automacao_configs WHERE id = $1`,
    [configId]
  );
  const { rows: execRows } = await pool.query(
    `SELECT id FROM automacao_execucoes WHERE id = $1`,
    [execucaoId]
  );
  assert.equal(configRows.length, 0);
  assert.equal(execRows.length, 0);
});

test("versionamento de arquivos: apenas 1 EXCEL e 1 PDF vigentes por execução, mas várias fotos coexistem", async () => {
  const empresaId = await createEmpresa("arquivos-versao");
  const automacaoId = await createAutomacao("diario-obra-arquivos");
  const configId = await createConfig(empresaId, automacaoId);
  const { rows } = await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia)
     VALUES ($1, $2, '2026-09-11') RETURNING id`,
    [configId, empresaId]
  );
  const execucaoId = rows[0].id;

  assert.ok(AUTOMATION_FILE_TYPES.includes("EXCEL"));
  assert.ok(AUTOMATION_FILE_TYPES.includes("PDF"));
  assert.ok(AUTOMATION_FILE_TYPES.includes("PHOTO"));

  // Duas fotos "current" simultâneas — sempre permitido.
  await pool.query(
    `INSERT INTO automacao_arquivos (empresa_id, automacao_execucao_id, tipo, versao, is_current)
     VALUES ($1, $2, 'PHOTO', 1, true), ($1, $2, 'PHOTO', 1, true)`,
    [empresaId, execucaoId]
  );

  // Versão 1 do Excel, vigente.
  await pool.query(
    `INSERT INTO automacao_arquivos (empresa_id, automacao_execucao_id, tipo, versao, is_current)
     VALUES ($1, $2, 'EXCEL', 1, true)`,
    [empresaId, execucaoId]
  );

  // Segunda tentativa de Excel vigente na MESMA execução deve ser rejeitada
  // pelo índice único parcial (regenerar deveria antes marcar a versão anterior
  // como is_current=false — isso é responsabilidade do motor, num bloco futuro).
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO automacao_arquivos (empresa_id, automacao_execucao_id, tipo, versao, is_current)
         VALUES ($1, $2, 'EXCEL', 2, true)`,
        [empresaId, execucaoId]
      ),
    (err) => {
      assert.equal(err.code, "23505");
      return true;
    }
  );

  // Nova versão como NÃO vigente: permitido — histórico preservado sem sobrescrever.
  await pool.query(
    `INSERT INTO automacao_arquivos (empresa_id, automacao_execucao_id, tipo, versao, is_current)
     VALUES ($1, $2, 'EXCEL', 2, false)`,
    [empresaId, execucaoId]
  );

  const { rows: excelRows } = await pool.query(
    `SELECT versao, is_current FROM automacao_arquivos
     WHERE automacao_execucao_id = $1 AND tipo = 'EXCEL' ORDER BY versao`,
    [execucaoId]
  );
  assert.deepEqual(
    excelRows.map((r) => [r.versao, r.is_current]),
    [
      [1, true],
      [2, false],
    ]
  );

  const { rows: photoRows } = await pool.query(
    `SELECT is_current FROM automacao_arquivos WHERE automacao_execucao_id = $1 AND tipo = 'PHOTO'`,
    [execucaoId]
  );
  assert.equal(photoRows.length, 2);
  assert.ok(photoRows.every((r) => r.is_current === true));
});

test("deduplicação de mensagem Telegram é por (automacao_config_id, chat_id, message_id)", async () => {
  const empresaId = await createEmpresa("telegram-dedup");
  const automacaoId = await createAutomacao("diario-obra-telegram");
  const configA = await createConfig(empresaId, automacaoId, { nome: "config-telegram-a" });
  const configB = await createConfig(empresaId, automacaoId, { nome: "config-telegram-b" });

  const chatId = 123456789;
  const messageId = 42;

  await pool.query(
    `INSERT INTO telegram_mensagens (empresa_id, automacao_config_id, chat_id, message_id, tipo, texto)
     VALUES ($1, $2, $3, $4, 'TEXT', 'primeira captura')`,
    [empresaId, configA, chatId, messageId]
  );

  // Mesmo chat_id + message_id, MESMA config: webhook duplicado do Telegram —
  // deve ser rejeitado pela UNIQUE.
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO telegram_mensagens (empresa_id, automacao_config_id, chat_id, message_id, tipo, texto)
         VALUES ($1, $2, $3, $4, 'TEXT', 'reenvio do webhook')`,
        [empresaId, configA, chatId, messageId]
      ),
    (err) => {
      assert.equal(err.code, "23505");
      return true;
    }
  );

  // Mesmo chat_id + message_id, config DIFERENTE: cenário futuro em que o mesmo
  // grupo alimenta duas automações — deve ser permitido (chave inclui o contexto
  // da configuração, não é global).
  await pool.query(
    `INSERT INTO telegram_mensagens (empresa_id, automacao_config_id, chat_id, message_id, tipo, texto)
     VALUES ($1, $2, $3, $4, 'TEXT', 'mesma mensagem, outra automação')`,
    [empresaId, configB, chatId, messageId]
  );

  const { rows } = await pool.query(
    `SELECT automacao_config_id FROM telegram_mensagens WHERE chat_id = $1 AND message_id = $2 ORDER BY automacao_config_id`,
    [chatId, messageId]
  );
  assert.deepEqual(rows.map((r) => r.automacao_config_id).sort((a, b) => a - b), [configA, configB].sort((a, b) => a - b));
});

test("automacao_templates permite versionamento (diario_obra_v1, diario_obra_v2)", async () => {
  const automacaoId = await createAutomacao("diario-obra-template");

  const { rows: v1 } = await pool.query(
    `INSERT INTO automacao_templates (automacao_id, codigo, versao, nome)
     VALUES ($1, $2, 1, 'Diário de Obra v1') RETURNING id`,
    [automacaoId, `${RUN_TAG}-diario_obra_v1`]
  );
  const { rows: v2 } = await pool.query(
    `INSERT INTO automacao_templates (automacao_id, codigo, versao, nome)
     VALUES ($1, $2, 2, 'Diário de Obra v2') RETURNING id`,
    [automacaoId, `${RUN_TAG}-diario_obra_v2`]
  );
  assert.notEqual(v1[0].id, v2[0].id);

  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO automacao_templates (automacao_id, codigo, versao, nome)
         VALUES ($1, $2, 1, 'Diário de Obra v1 duplicado')`,
        [automacaoId, `${RUN_TAG}-diario_obra_v1_dup`]
      ),
    (err) => {
      assert.equal(err.code, "23505", "UNIQUE(automacao_id, versao) deve impedir versao repetida");
      return true;
    }
  );
});

test("automacao_aprovadores nunca é global: sempre exige empresa_id e automacao_config_id", async () => {
  const empresaId = await createEmpresa("aprovador-escopo");
  const automacaoId = await createAutomacao("diario-obra-aprovador");
  const configId = await createConfig(empresaId, automacaoId);

  await assert.rejects(
    () => pool.query(`INSERT INTO automacao_aprovadores (nome) VALUES ('sem empresa nem config')`),
    /null value in column "empresa_id"|violates not-null constraint/i
  );

  const { rows } = await pool.query(
    `INSERT INTO automacao_aprovadores (empresa_id, automacao_config_id, nome, telegram_user_id)
     VALUES ($1, $2, 'Aprovador Teste', 555) RETURNING id`,
    [empresaId, configId]
  );
  assert.ok(rows[0].id);

  // Mesmo telegram_user_id, mesma config: cadastro duplicado deve ser rejeitado.
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO automacao_aprovadores (empresa_id, automacao_config_id, nome, telegram_user_id)
         VALUES ($1, $2, 'Aprovador Duplicado', 555)`,
        [empresaId, configId]
      ),
    (err) => {
      assert.equal(err.code, "23505");
      return true;
    }
  );
});

test("automacao_destinatarios não hardcoda gestor: nome/email vêm só de configuração explícita", async () => {
  const empresaId = await createEmpresa("destinatarios");
  const automacaoId = await createAutomacao("diario-obra-destinatarios");
  const configId = await createConfig(empresaId, automacaoId);

  const { rows } = await pool.query(
    `INSERT INTO automacao_destinatarios (empresa_id, automacao_config_id, tipo, nome, email)
     VALUES ($1, $2, 'TO', 'Gestor Teste', 'gestor-teste@example.com') RETURNING id`,
    [empresaId, configId]
  );
  assert.ok(rows[0].id);

  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO automacao_destinatarios (empresa_id, automacao_config_id, tipo, nome, email)
         VALUES ($1, $2, 'INVALIDO', 'X', 'x@example.com')`,
        [empresaId, configId]
      ),
    (err) => {
      assert.equal(err.code, "23514");
      return true;
    }
  );
});
