/**
 * Fundação de dados do módulo de Automações (Bloco 1 + evolução aditiva do Bloco 2).
 *
 * Módulo NOVO e aditivo: nenhuma tabela existente do FrotaMax é alterada aqui.
 * Segue o mesmo padrão de `src/db.js::initDb()` — SQL manual via `pg`, criação
 * idempotente (`CREATE TABLE IF NOT EXISTS`, `CHECK` adicionada condicionalmente
 * via `pg_constraint`), sem ORM.
 *
 * `db.js` apenas invoca `initAutomationsSchema(pool)` ao final do `initDb()` já
 * existente — o pool é passado por parâmetro (não importado daqui) para não criar
 * nenhuma dependência circular entre este módulo e `db.js`.
 *
 * Isolamento multiempresa: toda tabela operacional carrega `empresa_id` de forma
 * direta (mesmo quando também é alcançável via `automacao_config_id`/
 * `automacao_execucao_id`), replicando o padrão já usado em `romaneios`,
 * `combustiveis` e `parte_diaria` — nunca depende de JOIN para aplicar o filtro
 * de tenant.
 *
 * Nenhum secret (token Telegram, credencial Google, chave OpenAI) é persistido
 * em nenhuma destas tabelas — isso é responsabilidade da configuração de
 * ambiente (variáveis de ambiente / secrets do Render), fora deste schema.
 */

const {
  AUTOMATION_EXECUTION_STATUSES,
  AUTOMATION_FILE_TYPES,
  AUTOMATION_APPROVAL_DECISIONS,
  AUTOMATION_RECIPIENT_TYPES,
  TELEGRAM_MESSAGE_TYPES,
} = require("./constants/automationEnums");

const sqlEnumList = (values) => values.map((v) => `'${v}'`).join(", ");

const initAutomationsSchema = async (pool) => {
  // 1) Tabelas, na ordem que respeita as foreign keys.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automacoes (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(60) NOT NULL UNIQUE,
      nome VARCHAR(150) NOT NULL,
      descricao TEXT,
      ativo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS automacao_templates (
      id SERIAL PRIMARY KEY,
      automacao_id INTEGER NOT NULL REFERENCES automacoes(id) ON DELETE CASCADE,
      codigo VARCHAR(80) NOT NULL UNIQUE,
      versao INTEGER NOT NULL DEFAULT 1,
      nome VARCHAR(150) NOT NULL,
      schema_campos JSONB NOT NULL DEFAULT '{}'::jsonb,
      ativo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (automacao_id, versao)
    );

    CREATE TABLE IF NOT EXISTS automacao_configs (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      automacao_id INTEGER NOT NULL REFERENCES automacoes(id) ON DELETE RESTRICT,
      automacao_template_id INTEGER REFERENCES automacao_templates(id) ON DELETE SET NULL,
      nome VARCHAR(150) NOT NULL,
      label VARCHAR(150),
      projeto_nome VARCHAR(150),
      ativo BOOLEAN NOT NULL DEFAULT true,
      timezone VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
      horario_fechamento TIME,
      telegram_chat_id BIGINT,
      google_drive_pasta_raiz_id VARCHAR(190),
      usa_ia BOOLEAN NOT NULL DEFAULT true,
      configuracao JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS automacao_execucoes (
      id SERIAL PRIMARY KEY,
      automacao_config_id INTEGER NOT NULL REFERENCES automacao_configs(id) ON DELETE CASCADE,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      data_referencia DATE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'COLLECTING',
      versao INTEGER NOT NULL DEFAULT 1,
      drive_folder_ano_id VARCHAR(190),
      drive_folder_mes_id VARCHAR(190),
      drive_folder_dia_id VARCHAR(190),
      drive_folder_fotos_id VARCHAR(190),
      mensagens_capturadas INTEGER NOT NULL DEFAULT 0,
      fotos_capturadas INTEGER NOT NULL DEFAULT 0,
      processado_em TIMESTAMPTZ,
      aprovado_em TIMESTAMPTZ,
      enviado_em TIMESTAMPTZ,
      erro_mensagem TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (automacao_config_id, data_referencia)
    );

    CREATE TABLE IF NOT EXISTS automacao_aprovadores (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      automacao_config_id INTEGER NOT NULL REFERENCES automacao_configs(id) ON DELETE CASCADE,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      nome VARCHAR(150),
      telegram_user_id BIGINT,
      ativo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS automacao_eventos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      automacao_config_id INTEGER REFERENCES automacao_configs(id) ON DELETE CASCADE,
      automacao_execucao_id INTEGER REFERENCES automacao_execucoes(id) ON DELETE CASCADE,
      tipo_evento VARCHAR(80) NOT NULL,
      origem VARCHAR(30) NOT NULL DEFAULT 'SISTEMA',
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      dados JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS automacao_arquivos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      automacao_execucao_id INTEGER NOT NULL REFERENCES automacao_execucoes(id) ON DELETE CASCADE,
      tipo VARCHAR(20) NOT NULL,
      versao INTEGER NOT NULL DEFAULT 1,
      nome_arquivo VARCHAR(255),
      mime_type VARCHAR(120),
      tamanho_bytes BIGINT,
      drive_file_id VARCHAR(190),
      drive_folder_id VARCHAR(190),
      telegram_file_id VARCHAR(190),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_current BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS automacao_aprovacoes (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      automacao_execucao_id INTEGER NOT NULL REFERENCES automacao_execucoes(id) ON DELETE CASCADE,
      automacao_aprovador_id INTEGER REFERENCES automacao_aprovadores(id) ON DELETE SET NULL,
      decisao VARCHAR(20) NOT NULL,
      versao_arquivo INTEGER,
      telegram_user_id BIGINT,
      telegram_callback_id VARCHAR(190),
      observacao TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS automacao_destinatarios (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      automacao_config_id INTEGER NOT NULL REFERENCES automacao_configs(id) ON DELETE CASCADE,
      tipo VARCHAR(10) NOT NULL DEFAULT 'TO',
      nome VARCHAR(150),
      email VARCHAR(180) NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS telegram_mensagens (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      automacao_config_id INTEGER NOT NULL REFERENCES automacao_configs(id) ON DELETE CASCADE,
      automacao_execucao_id INTEGER REFERENCES automacao_execucoes(id) ON DELETE SET NULL,
      chat_id BIGINT NOT NULL,
      message_id BIGINT NOT NULL,
      update_id BIGINT,
      telegram_user_id BIGINT,
      autor_nome VARCHAR(150),
      data_hora_original TIMESTAMPTZ,
      tipo VARCHAR(20) NOT NULL DEFAULT 'TEXT',
      texto TEXT,
      caption TEXT,
      telegram_file_id VARCHAR(190),
      dados_adicionais JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (automacao_config_id, chat_id, message_id)
    );
  `);

  // 1.5) Colunas adicionadas de forma aditiva ao próprio módulo (Bloco 2) — nunca
  // toca tabela antiga do FrotaMax, apenas evolui as tabelas criadas no Bloco 1,
  // com ALTER ... ADD COLUMN IF NOT EXISTS (idempotente, mesmo padrão de db.js).
  //
  // Decisão: soft delete em automacao_configs (`deleted_at`). DELETE físico é
  // perigoso porque automacao_execucoes/automacao_eventos/automacao_arquivos
  // referenciam automacao_config_id com ON DELETE CASCADE — apagar a config de
  // verdade apagaria em cascata qualquer histórico futuro de execuções. Ainda não
  // existem execuções reais neste bloco, mas a política é definida agora para
  // nunca precisar de retrabalho quando existirem. O endpoint DELETE do Bloco 2
  // sempre marca `deleted_at = NOW()` (nunca `DELETE FROM automacao_configs`), e
  // toda leitura/listagem filtra `deleted_at IS NULL` por padrão.
  await pool.query(`
    ALTER TABLE automacao_configs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `);

  // 2) Índices de apoio a consulta (todos por empresa_id e/ou chave de acesso mais comum).
  // Nota: mantidos SEM cláusula WHERE deleted_at IS NULL de propósito — como
  // `CREATE INDEX IF NOT EXISTS` não altera a definição de um índice já existente
  // (o Bloco 1 já criou estes 3 sem filtro parcial), adicionar o filtro aqui seria
  // silenciosamente ignorado em qualquer banco que já rodou o Bloco 1, criando
  // uma definição divergente entre ambientes "antigos" e "novos". O filtro
  // `deleted_at IS NULL` é sempre aplicado explicitamente nas queries do model
  // (automationConfigModel.js) — o índice normal ainda acelera o `empresa_id =`
  // da mesma forma, só sem a otimização marginal de excluir linhas soft-deleted.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_automacao_templates_automacao ON automacao_templates (automacao_id);

    CREATE INDEX IF NOT EXISTS idx_automacao_configs_empresa ON automacao_configs (empresa_id);
    CREATE INDEX IF NOT EXISTS idx_automacao_configs_automacao ON automacao_configs (automacao_id);
    CREATE INDEX IF NOT EXISTS idx_automacao_configs_empresa_ativo ON automacao_configs (empresa_id, ativo);
    -- Índice novo (nome inédito, sem conflito com os do Bloco 1) para a listagem
    -- padrão do painel, que sempre exclui soft-deleted.
    CREATE INDEX IF NOT EXISTS idx_automacao_configs_empresa_not_deleted
      ON automacao_configs (empresa_id, created_at DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_automacao_execucoes_empresa ON automacao_execucoes (empresa_id);
    CREATE INDEX IF NOT EXISTS idx_automacao_execucoes_config_data ON automacao_execucoes (automacao_config_id, data_referencia DESC);
    CREATE INDEX IF NOT EXISTS idx_automacao_execucoes_status ON automacao_execucoes (status);

    CREATE INDEX IF NOT EXISTS idx_automacao_aprovadores_config ON automacao_aprovadores (automacao_config_id, ativo);
    CREATE INDEX IF NOT EXISTS idx_automacao_aprovadores_empresa ON automacao_aprovadores (empresa_id);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_automacao_aprovadores_config_telegram
      ON automacao_aprovadores (automacao_config_id, telegram_user_id)
      WHERE telegram_user_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_automacao_eventos_execucao ON automacao_eventos (automacao_execucao_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_automacao_eventos_empresa ON automacao_eventos (empresa_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_automacao_eventos_tipo ON automacao_eventos (tipo_evento);

    CREATE INDEX IF NOT EXISTS idx_automacao_arquivos_execucao ON automacao_arquivos (automacao_execucao_id, tipo, versao DESC);
    CREATE INDEX IF NOT EXISTS idx_automacao_arquivos_empresa ON automacao_arquivos (empresa_id);
    -- No máximo 1 versão vigente por (execução, tipo) — mas só para tipos "documento"
    -- (EXCEL/PDF). PHOTO fica de fora de propósito: cada foto é uma mensagem distinta
    -- do Telegram, não uma "versão" de um mesmo arquivo, então várias fotos current=true
    -- na mesma execução são esperadas e corretas.
    CREATE UNIQUE INDEX IF NOT EXISTS ux_automacao_arquivos_current_documento
      ON automacao_arquivos (automacao_execucao_id, tipo)
      WHERE is_current = true AND tipo IN ('EXCEL', 'PDF');

    CREATE INDEX IF NOT EXISTS idx_automacao_aprovacoes_execucao ON automacao_aprovacoes (automacao_execucao_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_automacao_aprovacoes_empresa ON automacao_aprovacoes (empresa_id);

    CREATE INDEX IF NOT EXISTS idx_automacao_destinatarios_config ON automacao_destinatarios (automacao_config_id, ativo);
    CREATE INDEX IF NOT EXISTS idx_automacao_destinatarios_empresa ON automacao_destinatarios (empresa_id);

    -- Dedup de mensagens do Telegram no CONTEXTO da configuração (ver UNIQUE na
    -- criação da tabela): chat_id sozinho não basta como chave de negócio porque
    -- futuramente o MESMO grupo pode alimentar mais de uma automacao_config (ex.:
    -- Diário de Obra e um Relatório de Segurança lendo o mesmo grupo). Deduplicar
    -- por (automacao_config_id, chat_id, message_id) responde à pergunta certa —
    -- "esta automação já processou esta mensagem?" — em vez de "esta mensagem já
    -- existe alguma vez no sistema?", que bloquearia esse cenário futuro.
    CREATE INDEX IF NOT EXISTS idx_telegram_mensagens_execucao ON telegram_mensagens (automacao_execucao_id);
    CREATE INDEX IF NOT EXISTS idx_telegram_mensagens_config_data ON telegram_mensagens (automacao_config_id, data_hora_original DESC);
    CREATE INDEX IF NOT EXISTS idx_telegram_mensagens_empresa ON telegram_mensagens (empresa_id);
  `);

  // 3) CHECK constraints de domínio (padrão já usado em veiculos_status_operacional_chk /
  // usuarios_conta_status_chk) — valores centralizados em constants/automationEnums.js.
  const checks = [
    {
      name: "automacao_execucoes_status_chk",
      table: "automacao_execucoes",
      expression: `status IN (${sqlEnumList(AUTOMATION_EXECUTION_STATUSES)})`,
    },
    {
      name: "automacao_arquivos_tipo_chk",
      table: "automacao_arquivos",
      expression: `tipo IN (${sqlEnumList(AUTOMATION_FILE_TYPES)})`,
    },
    {
      name: "automacao_aprovacoes_decisao_chk",
      table: "automacao_aprovacoes",
      expression: `decisao IN (${sqlEnumList(AUTOMATION_APPROVAL_DECISIONS)})`,
    },
    {
      name: "automacao_destinatarios_tipo_chk",
      table: "automacao_destinatarios",
      expression: `tipo IN (${sqlEnumList(AUTOMATION_RECIPIENT_TYPES)})`,
    },
    {
      name: "telegram_mensagens_tipo_chk",
      table: "telegram_mensagens",
      expression: `tipo IN (${sqlEnumList(TELEGRAM_MESSAGE_TYPES)})`,
    },
  ];

  for (const check of checks) {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${check.name}') THEN
          ALTER TABLE ${check.table}
            ADD CONSTRAINT ${check.name}
            CHECK (${check.expression});
        END IF;
      END
      $$;
    `);
  }

  // 4) Catálogo estrutural inicial (Bloco 2) — dado ESTRUTURAL da plataforma
  // (um "tipo de automação" disponível), não dado de cliente: nunca inclui
  // PPFlora, gestores, chat IDs, aprovadores, horários ou pasta de Drive, que
  // são configuração (automacao_configs), sempre cadastrada manualmente pelo
  // usuário do painel. `ON CONFLICT (codigo) DO NOTHING` garante idempotência —
  // testado em automationCatalogSeed.test.js (não duplica em restart).
  await pool.query(`
    INSERT INTO automacoes (codigo, nome, descricao)
    VALUES ('diario_obra', 'Diário de Obra', 'Geração automatizada de Diário de Obra a partir de registros diários de uma configuração (ex.: grupo de Telegram de uma obra).')
    ON CONFLICT (codigo) DO NOTHING;
  `);
};

module.exports = { initAutomationsSchema };
