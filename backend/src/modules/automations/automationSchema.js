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
  AUTOMATION_STORAGE_STATUSES,
  AUTOMATION_SNAPSHOT_REASONS,
  AUTOMATION_EXECUTION_ERROR_CODES,
  AUTOMATION_INTELLIGENCE_STATUSES,
  AUTOMATION_AI_ERROR_CODES,
  AUTOMATION_DOCUMENT_STATUSES,
  AUTOMATION_DOCUMENT_GENERATOR_TYPES,
  AUTOMATION_DOCUMENT_ERROR_CODES,
} = require("./constants/automationEnums");

const sqlEnumList = (values) => values.map((v) => `'${v}'`).join(", ");

const runSchemaStatements = async (pool) => {
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

  // Evolução aditiva do Bloco 3 (captura Telegram) — telegram_mensagens ganha
  // os campos necessários para persistir o subconjunto relevante do update da
  // Bot API. Nenhuma tabela antiga do FrotaMax é tocada; nenhum destes campos
  // é secret.
  //   - data_referencia: dia do D.O. já calculado (message.date + timezone da
  //     config) — nunca recalculado a partir da hora do servidor depois.
  //   - telegram_username: @usuário, quando disponível (nome/first+last_name
  //     já cobertos por autor_nome, existente desde o Bloco 1).
  //   - telegram_file_unique_id: identificador estável do arquivo (diferente
  //     de telegram_file_id, que pode variar entre bots) — útil para o Bloco 4.
  //   - media_group_id: preserva pertencimento a um álbum, sem tentar montá-lo
  //     neste bloco.
  //   - foto_largura/foto_altura/foto_tamanho_bytes: metadados da variante de
  //     foto selecionada (a maior), nunca o arquivo em si — download fica para
  //     o Bloco 4.
  await pool.query(`
    ALTER TABLE telegram_mensagens ADD COLUMN IF NOT EXISTS data_referencia DATE;
    ALTER TABLE telegram_mensagens ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(190);
    ALTER TABLE telegram_mensagens ADD COLUMN IF NOT EXISTS telegram_file_unique_id VARCHAR(190);
    ALTER TABLE telegram_mensagens ADD COLUMN IF NOT EXISTS media_group_id VARCHAR(190);
    ALTER TABLE telegram_mensagens ADD COLUMN IF NOT EXISTS foto_largura INTEGER;
    ALTER TABLE telegram_mensagens ADD COLUMN IF NOT EXISTS foto_altura INTEGER;
    ALTER TABLE telegram_mensagens ADD COLUMN IF NOT EXISTS foto_tamanho_bytes BIGINT;
  `);

  // Evolução aditiva do Bloco 4 (download de fotos + armazenamento no Drive).
  //
  //   - telegram_mensagens.storage_status/attempts/last_error/last_attempt_at/
  //     completed_at: máquina de estados do armazenamento de UMA mensagem PHOTO
  //     (NULL para TEXT/DOCUMENT/OUTRO — "não aplicável", nunca processado).
  //     A gravação do webhook (Bloco 3, telegramWebhookService.js) passa a
  //     inserir storage_status = 'PENDING' apenas quando tipo = 'PHOTO'; nenhum
  //     outro campo/comportamento do Bloco 3 muda.
  //   - automacao_arquivos.telegram_mensagem_id: liga o arquivo definitivo
  //     (tipo PHOTO) à mensagem Telegram que o originou. Nullable porque
  //     EXCEL/PDF (blocos futuros) não têm origem numa mensagem do Telegram.
  //   - automacao_configs.google_drive_pasta_diarios_id: cache da pasta
  //     "Diários de Obra" dentro da pasta raiz da config — é a mesma pasta
  //     para TODAS as execuções (dias) de uma config, então fica no nível de
  //     config em vez de ser recriada/revalidada a cada dia em
  //     automacao_execucoes (que já guarda ano/mês/dia/fotos por ser
  //     específico de cada execução, desde o Bloco 1).
  await pool.query(`
    ALTER TABLE telegram_mensagens ADD COLUMN IF NOT EXISTS storage_status VARCHAR(20);
    ALTER TABLE telegram_mensagens ADD COLUMN IF NOT EXISTS storage_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE telegram_mensagens ADD COLUMN IF NOT EXISTS storage_last_error TEXT;
    ALTER TABLE telegram_mensagens ADD COLUMN IF NOT EXISTS storage_last_attempt_at TIMESTAMPTZ;
    ALTER TABLE telegram_mensagens ADD COLUMN IF NOT EXISTS storage_completed_at TIMESTAMPTZ;

    ALTER TABLE automacao_arquivos ADD COLUMN IF NOT EXISTS telegram_mensagem_id INTEGER
      REFERENCES telegram_mensagens(id) ON DELETE SET NULL;

    ALTER TABLE automacao_configs ADD COLUMN IF NOT EXISTS google_drive_pasta_diarios_id VARCHAR(190);
  `);

  // Evolução aditiva do Bloco 5 (motor de fechamento diário). Duas colunas
  // PRÉ-EXISTENTES do Bloco 1 ganham semântica concreta pela primeira vez
  // (nunca foram lidas/escritas por nenhum código até agora — confirmado
  // antes de reaproveitar):
  //   - automacao_execucoes.versao: NÃO é reaproveitada (seu default
  //     NOT NULL 1 colidiria com "1 = ainda sem snapshot"), por isso o
  //     Bloco 5 usa uma coluna nova (`snapshot_version`, nullable) em vez
  //     dela — mantém `versao` como está, sem lhe dar um significado
  //     ambíguo.
  //   - automacao_execucoes.processado_em: agora significa "quando o
  //     fechamento diário concluiu" (closing_completed_at conceitual) —
  //     nullable, sem valor-default, reaproveitamento seguro.
  //   - automacao_execucoes.erro_mensagem: agora também usado pelo motor de
  //     fechamento para o texto do erro recuperável/inesperado.
  //
  // automacao_execucao_snapshots é tabela NOVA (histórico completo, nunca
  // sobrescrito) — cada fechamento ou reprocessamento (rebuild) grava uma
  // linha nova, nunca UPDATE em cima da anterior. automacao_execucoes só
  // aponta para a versão CORRENTE via current_snapshot_id.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automacao_execucao_snapshots (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      automacao_execucao_id INTEGER NOT NULL REFERENCES automacao_execucoes(id) ON DELETE CASCADE,
      versao INTEGER NOT NULL,
      snapshot JSONB NOT NULL,
      snapshot_hash VARCHAR(64) NOT NULL,
      metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
      reason VARCHAR(30) NOT NULL DEFAULT 'INITIAL_CLOSING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (automacao_execucao_id, versao)
    );
  `);

  await pool.query(`
    ALTER TABLE automacao_execucoes ADD COLUMN IF NOT EXISTS snapshot_version INTEGER;
    ALTER TABLE automacao_execucoes ADD COLUMN IF NOT EXISTS needs_reprocessing BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE automacao_execucoes ADD COLUMN IF NOT EXISTS has_late_inputs BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE automacao_execucoes ADD COLUMN IF NOT EXISTS closing_started_at TIMESTAMPTZ;
    ALTER TABLE automacao_execucoes ADD COLUMN IF NOT EXISTS closing_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE automacao_execucoes ADD COLUMN IF NOT EXISTS erro_codigo VARCHAR(60);
    -- current_snapshot_id só pode ser adicionada DEPOIS que a tabela de
    -- snapshots acima existe (referência para frente não é possível).
    ALTER TABLE automacao_execucoes ADD COLUMN IF NOT EXISTS current_snapshot_id INTEGER
      REFERENCES automacao_execucao_snapshots(id) ON DELETE SET NULL;
  `);

  // Evolução aditiva do Bloco 6 (estruturação inteligente por IA).
  //
  //   - automacao_execucao_inteligencias: histórico de TENTATIVAS de
  //     estruturação por (execução, snapshot) — nunca sobrescrito; um
  //     "force rebuild" incrementa `versao`, um retry comum de uma tentativa
  //     FAILED reaproveita a MESMA linha (UPDATE, não INSERT — ver
  //     automationAiService.js). UNIQUE(execucao, snapshot, versao) é a
  //     mesma proteção estrutural do Bloco 5 aplicada aqui.
  //   - automacao_arquivo_analises: cache de análise visual POR FOTO — uma
  //     foto imutável analisada com o mesmo (model, prompt_version) nunca
  //     precisa ser reanalisada num rebuild futuro (Seção 26/27).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automacao_execucao_inteligencias (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      automacao_execucao_id INTEGER NOT NULL REFERENCES automacao_execucoes(id) ON DELETE CASCADE,
      snapshot_id INTEGER NOT NULL REFERENCES automacao_execucao_snapshots(id) ON DELETE CASCADE,
      versao INTEGER NOT NULL DEFAULT 1,
      prompt_version VARCHAR(20) NOT NULL,
      model VARCHAR(80) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
      structured_output JSONB,
      input_hash VARCHAR(64),
      output_hash VARCHAR(64),
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      erro_codigo VARCHAR(60),
      erro_mensagem TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (automacao_execucao_id, snapshot_id, versao)
    );

    CREATE TABLE IF NOT EXISTS automacao_arquivo_analises (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      automacao_arquivo_id INTEGER NOT NULL REFERENCES automacao_arquivos(id) ON DELETE CASCADE,
      model VARCHAR(80) NOT NULL,
      prompt_version VARCHAR(20) NOT NULL,
      analysis JSONB NOT NULL,
      analysis_hash VARCHAR(64) NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (automacao_arquivo_id, model, prompt_version)
    );
  `);

  // Evolução aditiva do Bloco 7B (geração versionada do Diário de Obra em
  // Excel/PDF).
  //
  //   - automacao_execucao_documentos: histórico de GERAÇÕES de documento por
  //     (execução, snapshot, inteligência, template) — nunca sobrescrito;
  //     mesma disciplina de versionamento dos Blocos 5/6. UNIQUE inclui
  //     `generator_id` de propósito: uma troca de gerador (ex.: v1 -> v2 de
  //     código) para o MESMO template/versão ainda deve poder coexistir como
  //     histórico distinto, nunca colidir silenciosamente.
  //   - automacao_templates ganha metadados (template_hash, generator_id,
  //     tipo, source_filename, metadata) — o BINÁRIO do xlsx/pdf de
  //     referência NUNCA é armazenado no banco, só o hash e o nome do
  //     arquivo de origem (auditoria do Bloco 7A).
  //   - automacao_arquivos ganha um vínculo OPCIONAL para o documento que o
  //     gerou — só se aplica a arquivos tipo EXCEL/PDF produzidos por este
  //     motor; PHOTO nunca tem este vínculo preenchido.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automacao_execucao_documentos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      automacao_execucao_id INTEGER NOT NULL REFERENCES automacao_execucoes(id) ON DELETE CASCADE,
      snapshot_id INTEGER NOT NULL REFERENCES automacao_execucao_snapshots(id) ON DELETE CASCADE,
      intelligence_id INTEGER NOT NULL REFERENCES automacao_execucao_inteligencias(id) ON DELETE CASCADE,
      automacao_template_id INTEGER NOT NULL REFERENCES automacao_templates(id) ON DELETE RESTRICT,
      versao INTEGER NOT NULL DEFAULT 1,
      generator_id VARCHAR(60) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
      input_hash VARCHAR(64),
      excel_hash VARCHAR(64),
      pdf_hash VARCHAR(64),
      excel_arquivo_id INTEGER REFERENCES automacao_arquivos(id) ON DELETE SET NULL,
      pdf_arquivo_id INTEGER REFERENCES automacao_arquivos(id) ON DELETE SET NULL,
      erro_codigo VARCHAR(60),
      erro_mensagem TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (automacao_execucao_id, snapshot_id, intelligence_id, automacao_template_id, generator_id, versao)
    );
  `);

  await pool.query(`
    ALTER TABLE automacao_templates ADD COLUMN IF NOT EXISTS template_hash VARCHAR(64);
    ALTER TABLE automacao_templates ADD COLUMN IF NOT EXISTS generator_id VARCHAR(60);
    ALTER TABLE automacao_templates ADD COLUMN IF NOT EXISTS tipo VARCHAR(30);
    ALTER TABLE automacao_templates ADD COLUMN IF NOT EXISTS source_filename VARCHAR(255);
    ALTER TABLE automacao_templates ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE automacao_arquivos ADD COLUMN IF NOT EXISTS automacao_documento_id INTEGER
      REFERENCES automacao_execucao_documentos(id) ON DELETE SET NULL;
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
    -- Bloco 3: busca por dia do D.O. dentro de uma execução/config específica.
    CREATE INDEX IF NOT EXISTS idx_telegram_mensagens_config_data_referencia
      ON telegram_mensagens (automacao_config_id, data_referencia);
    -- Resolução de config ativa por chat do Telegram — caminho mais quente do webhook.
    CREATE INDEX IF NOT EXISTS idx_automacao_configs_telegram_chat_ativo
      ON automacao_configs (telegram_chat_id)
      WHERE ativo = true AND deleted_at IS NULL AND telegram_chat_id IS NOT NULL;

    -- Bloco 4: fila de fotos pendentes/retentáveis de armazenamento — índice
    -- parcial (só cobre as linhas que a claim query de fato varre).
    CREATE INDEX IF NOT EXISTS idx_telegram_mensagens_storage_pendente
      ON telegram_mensagens (automacao_config_id, created_at)
      WHERE storage_status IN ('PENDING', 'PROCESSING');

    -- No máximo 1 automacao_arquivos (PHOTO) por mensagem Telegram de origem —
    -- é a proteção de idempotência que permite reconciliar upload+insert sem
    -- duplicar arquivo se o processo morrer entre os dois passos (ver
    -- photoStorageService.js).
    CREATE UNIQUE INDEX IF NOT EXISTS ux_automacao_arquivos_telegram_mensagem
      ON automacao_arquivos (telegram_mensagem_id)
      WHERE telegram_mensagem_id IS NOT NULL;

    -- Bloco 5: histórico de snapshots por execução, mais recente primeiro.
    CREATE INDEX IF NOT EXISTS idx_automacao_execucao_snapshots_execucao
      ON automacao_execucao_snapshots (automacao_execucao_id, versao DESC);
    CREATE INDEX IF NOT EXISTS idx_automacao_execucao_snapshots_empresa
      ON automacao_execucao_snapshots (empresa_id);

    -- Bloco 5: candidatas a reprocessamento (fila pequena, filtro parcial).
    CREATE INDEX IF NOT EXISTS idx_automacao_execucoes_needs_reprocessing
      ON automacao_execucoes (automacao_config_id)
      WHERE needs_reprocessing = true;

    -- Bloco 6: histórico de inteligência por execução/empresa, mais recente primeiro.
    CREATE INDEX IF NOT EXISTS idx_automacao_execucao_inteligencias_execucao
      ON automacao_execucao_inteligencias (automacao_execucao_id, versao DESC);
    CREATE INDEX IF NOT EXISTS idx_automacao_execucao_inteligencias_empresa
      ON automacao_execucao_inteligencias (empresa_id);
    CREATE INDEX IF NOT EXISTS idx_automacao_execucao_inteligencias_snapshot
      ON automacao_execucao_inteligencias (snapshot_id);

    -- Bloco 6: cache de análise visual por arquivo — lookup direto por
    -- (arquivo, model, prompt_version) é exatamente a UNIQUE já criada acima
    -- (Postgres cria automaticamente um índice para ela); só o índice por
    -- empresa é adicional.
    CREATE INDEX IF NOT EXISTS idx_automacao_arquivo_analises_empresa
      ON automacao_arquivo_analises (empresa_id);

    -- Bloco 7B: histórico de documentos por execução/empresa, mais recente primeiro.
    CREATE INDEX IF NOT EXISTS idx_automacao_execucao_documentos_execucao
      ON automacao_execucao_documentos (automacao_execucao_id, versao DESC);
    CREATE INDEX IF NOT EXISTS idx_automacao_execucao_documentos_empresa
      ON automacao_execucao_documentos (empresa_id);
    CREATE INDEX IF NOT EXISTS idx_automacao_execucao_documentos_snapshot
      ON automacao_execucao_documentos (snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_automacao_execucao_documentos_intelligence
      ON automacao_execucao_documentos (intelligence_id);

    CREATE INDEX IF NOT EXISTS idx_automacao_arquivos_documento
      ON automacao_arquivos (automacao_documento_id)
      WHERE automacao_documento_id IS NOT NULL;
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
    {
      // NULL (mensagens não-PHOTO) satisfaz `IN (...)` normalmente no Postgres
      // — a CHECK só falha em FALSE, nunca em NULL — então nenhum valor
      // "N/A" precisa entrar em AUTOMATION_STORAGE_STATUSES.
      name: "telegram_mensagens_storage_status_chk",
      table: "telegram_mensagens",
      expression: `storage_status IN (${sqlEnumList(AUTOMATION_STORAGE_STATUSES)})`,
    },
    {
      name: "automacao_execucao_snapshots_reason_chk",
      table: "automacao_execucao_snapshots",
      expression: `reason IN (${sqlEnumList(AUTOMATION_SNAPSHOT_REASONS)})`,
    },
    {
      // NULL = sem erro, ou erro sem código específico (guardado só em
      // erro_mensagem) — mesmo raciocínio de NULL-passa-CHECK do storage_status
      // acima. União de fechamento (Bloco 5) + IA (Bloco 6): a coluna é
      // compartilhada entre os dois subsistemas, nunca ambígua na prática
      // porque os valores em si não se repetem entre as duas listas.
      name: "automacao_execucoes_erro_codigo_chk",
      table: "automacao_execucoes",
      expression: `erro_codigo IN (${sqlEnumList(AUTOMATION_EXECUTION_ERROR_CODES)})`,
    },
    {
      name: "automacao_execucao_inteligencias_status_chk",
      table: "automacao_execucao_inteligencias",
      expression: `status IN (${sqlEnumList(AUTOMATION_INTELLIGENCE_STATUSES)})`,
    },
    {
      name: "automacao_execucao_inteligencias_erro_codigo_chk",
      table: "automacao_execucao_inteligencias",
      expression: `erro_codigo IN (${sqlEnumList(AUTOMATION_AI_ERROR_CODES)})`,
    },
    {
      name: "automacao_execucao_documentos_status_chk",
      table: "automacao_execucao_documentos",
      expression: `status IN (${sqlEnumList(AUTOMATION_DOCUMENT_STATUSES)})`,
    },
    {
      name: "automacao_execucao_documentos_erro_codigo_chk",
      table: "automacao_execucao_documentos",
      expression: `erro_codigo IN (${sqlEnumList(AUTOMATION_DOCUMENT_ERROR_CODES)})`,
    },
    {
      name: "automacao_templates_tipo_chk",
      table: "automacao_templates",
      expression: `tipo IS NULL OR tipo IN (${sqlEnumList(AUTOMATION_DOCUMENT_GENERATOR_TYPES)})`,
    },
  ];

  // DROP + ADD (nunca só "cria se não existir"): a DEFINIÇÃO de uma CHECK
  // pode mudar entre blocos (aconteceu agora — READY_FOR_GENERATION entrou
  // em AUTOMATION_EXECUTION_STATUSES) e o nome da constraint permanece o
  // mesmo. Um "IF NOT EXISTS" por nome, como este código fazia até o Bloco
  // 4, deixaria a definição ANTIGA presa para sempre depois da primeira
  // vez — bug real encontrado e corrigido neste bloco. DROP+ADD de uma CHECK
  // é barato (metadado de catálogo, sem reescrever a tabela) e sempre
  // idempotente em relação ao RESULTADO final, então repetir em todo boot é
  // seguro. Isto só roda quando `isSchemaFullyMigrated` já decidiu que o
  // schema precisa de fato ser (re)aplicado — nunca no caminho comum.
  for (const check of checks) {
    await pool.query(`ALTER TABLE ${check.table} DROP CONSTRAINT IF EXISTS ${check.name};`);
    await pool.query(`ALTER TABLE ${check.table} ADD CONSTRAINT ${check.name} CHECK (${check.expression});`);
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

  // Seed do template v1 (Bloco 7B) — estrutural da plataforma (um "layout
  // disponível" para a automação diario_obra), não dado de cliente. O layout
  // em si foi AUDITADO a partir do arquivo de referência do Bloco 7A
  // (PPFlora_DO_07-09-2026_TESTE_R01.xlsx — hash abaixo), mas nenhum dado do
  // PPFlora (projeto, local, cliente) é gravado aqui — isso é sempre
  // `automacao_configs`, cadastrado manualmente. `ON CONFLICT (codigo) DO
  // NOTHING` garante idempotência (testado em documentTemplateSeed.test.js).
  await pool.query(`
    INSERT INTO automacao_templates (automacao_id, codigo, versao, nome, schema_campos, template_hash, generator_id, tipo, source_filename)
    SELECT id, 'diario_obra_ppflora', 1, 'Diário de Obra — modelo v1 (auditoria Bloco 7A)', '{}'::jsonb,
           'ca7ffdf2af3ab73f4f4012ee6c2053c60ccc6bf4ffdb6626009811a22d589f18', 'diario_obra_ppflora_v1', 'EXCEL_PDF_HIBRIDO',
           'PPFlora_DO_07-09-2026_TESTE_R01.xlsx'
    FROM automacoes WHERE codigo = 'diario_obra'
    ON CONFLICT (codigo) DO NOTHING;
  `);
};

const SCHEMA_INIT_LOCK_KEY = "automationsSchema_init_v1";

/**
 * Checagem barata (só catálogo do sistema, nunca toca as tabelas de dados)
 * que serve de proxy para "o schema já está no estado-alvo do bloco mais
 * recente": marcadores do Bloco 4 (CHECK de storage_status + índice único de
 * arquivo por mensagem), do Bloco 5 (tabela de snapshots + CHECK de status já
 * contendo READY_FOR_GENERATION) e do Bloco 6 (tabela de inteligências +
 * CHECK de status já contendo AI_PROCESSING) — os marcadores de CHECK são o
 * que força reaplicação em qualquer banco de um bloco anterior, já que o
 * NOME da constraint de status não muda entre blocos, só a definição. Uma
 * consulta a `pg_constraint`/`pg_indexes`/`pg_tables` só precisa de
 * AccessShareLock no catálogo — nunca conflita com DML concorrente nas
 * tabelas do módulo.
 */
async function isSchemaFullyMigrated(pool) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'telegram_mensagens_storage_status_chk') AS c1,
       (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'ux_automacao_arquivos_telegram_mensagem') AS c2,
       (SELECT COUNT(*) FROM pg_tables WHERE tablename = 'automacao_execucao_snapshots') AS c3,
       (SELECT COUNT(*) FROM pg_constraint
          WHERE conname = 'automacao_execucoes_status_chk'
            AND pg_get_constraintdef(oid) LIKE '%READY_FOR_GENERATION%') AS c4,
       (SELECT COUNT(*) FROM pg_tables WHERE tablename = 'automacao_execucao_inteligencias') AS c5,
       (SELECT COUNT(*) FROM pg_constraint
          WHERE conname = 'automacao_execucoes_status_chk'
            AND pg_get_constraintdef(oid) LIKE '%AI_PROCESSING%') AS c6,
       (SELECT COUNT(*) FROM pg_tables WHERE tablename = 'automacao_execucao_documentos') AS c7,
       (SELECT COUNT(*) FROM pg_constraint
          WHERE conname = 'automacao_execucoes_status_chk'
            AND pg_get_constraintdef(oid) LIKE '%DOCUMENT_READY%') AS c8`
  );
  const r = rows[0];
  return (
    Number(r.c1) > 0 &&
    Number(r.c2) > 0 &&
    Number(r.c3) > 0 &&
    Number(r.c4) > 0 &&
    Number(r.c5) > 0 &&
    Number(r.c6) > 0 &&
    Number(r.c7) > 0 &&
    Number(r.c8) > 0
  );
}

/**
 * Serialização entre processos, introduzida no Bloco 4. Cada arquivo de
 * teste chama `initAutomationsSchema(pool)` no próprio `test.before` (padrão
 * já usado desde o Bloco 1), e `node --test` roda ~30 arquivos em paralelo
 * contra o MESMO Postgres local.
 *
 * Descoberta ao investigar um deadlock (40P01) real: o problema não é (só)
 * DDL-vs-DDL — é DDL-vs-DML entre PROCESSOS DIFERENTES. A FK nova do Bloco 4
 * (`automacao_arquivos.telegram_mensagem_id REFERENCES telegram_mensagens`)
 * é o primeiro ALTER deste schema que precisa de lock em DUAS tabelas ao
 * mesmo tempo (Postgres precisa travar a tabela referenciada para validar a
 * FK) — então um `ALTER TABLE` rodando num processo pode formar um ciclo de
 * espera com uma query comum (INSERT/SELECT) de OUTRO processo que já
 * terminou sua própria inicialização e está no meio de um teste mexendo
 * nas duas mesmas tabelas (exatamente o que photoStorageService.test.js faz
 * o tempo todo). Um advisory lock só ao redor do DDL não evita isso, porque
 * nada obriga os testes (DML) de um processo já migrado a esperar por ele.
 *
 * A correção de verdade é fazer o caminho comum — schema já migrado, que é
 * praticamente sempre o caso depois que o primeiro processo termina — nunca
 * chegar perto de um `ALTER TABLE`: `isSchemaFullyMigrated` decide isso com
 * uma leitura de catálogo (sem lock de tabela) ANTES de sequer pedir o
 * advisory lock. Só o processo (quase sempre único, na prática) que
 * encontra o schema ainda não migrado paga o custo do DDL com lock; todos os
 * demais — inclusive os que chegam depois, esperando o advisory lock — se
 * re-checam ao acordar e saem sem tocar em nenhum ALTER. O retry em 40P01
 * continua como cinto-de-segurança adicional para a janela ainda mais rara
 * em que dois processos genuinamente descobrem juntos que precisam migrar.
 */
async function initAutomationsSchema(pool, attempt = 0) {
  if (await isSchemaFullyMigrated(pool).catch(() => false)) return;

  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [SCHEMA_INIT_LOCK_KEY]);
    try {
      if (await isSchemaFullyMigrated(pool).catch(() => false)) return;
      await runSchemaStatements(pool);
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [SCHEMA_INIT_LOCK_KEY]).catch(() => {});
    }
  } catch (err) {
    if (err?.code === "40P01" && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      return initAutomationsSchema(pool, attempt + 1);
    }
    throw err;
  } finally {
    lockClient.release();
  }
}

module.exports = { initAutomationsSchema };
