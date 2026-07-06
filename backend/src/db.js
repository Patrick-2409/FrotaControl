const { Pool } = require("pg");
const { logWarn } = require("./services/loggerService");

const connectionString = process.env.DATABASE_URL;
const databaseSslExplicit = String(process.env.DATABASE_SSL || "").toLowerCase();
const useSsl =
  databaseSslExplicit === "true" ||
  (process.env.NODE_ENV === "production" && databaseSslExplicit !== "false") ||
  /[?&]sslmode=require/i.test(String(connectionString || ""));

const pool = new Pool({
  connectionString,
  max: Math.min(50, Math.max(10, Number(process.env.PG_POOL_MAX || 25))),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

const PG_SLOW_MS = Math.max(500, Number(process.env.PG_SLOW_QUERY_MS || 5000));
(() => {
  const origQuery = pool.query.bind(pool);
  pool.query = (...args) => {
    const started = Date.now();
    const preview =
      typeof args[0] === "string"
        ? args[0].slice(0, 320)
        : args[0]?.text?.slice(0, 320) || "(prepared)";
    return origQuery(...args).finally(() => {
      const durationMs = Date.now() - started;
      if (durationMs >= PG_SLOW_MS) {
        logWarn("pg_slow_query", {
          durationMs,
          sqlPreview: String(preview).replace(/\s+/g, " ").trim(),
        });
      }
    });
  };
})();

const initDb = async () => {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'ADMIN_EMPRESA', 'MOTORISTA');
      END IF;
    END
    $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_enum e
        JOIN pg_catalog.pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'user_role' AND e.enumlabel = 'APONTADOR'
      ) THEN
        NULL;
      ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typname = 'user_role') THEN
        ALTER TYPE user_role ADD VALUE 'APONTADOR';
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS empresas (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      logo_url TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS veiculos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      codigo_operacional INTEGER,
      nome VARCHAR(120) NOT NULL,
      placa VARCHAR(20) NOT NULL,
      marca VARCHAR(120),
      modelo VARCHAR(120),
      transporta_esteril BOOLEAN,
      transporta_rocha BOOLEAN,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (empresa_id, placa)
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
      veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
      nome VARCHAR(150) NOT NULL,
      email VARCHAR(150),
      cpf_id VARCHAR(40) NOT NULL,
      senha_hash TEXT NOT NULL,
      role user_role NOT NULL DEFAULT 'MOTORISTA',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (empresa_id, cpf_id)
    );

    CREATE TABLE IF NOT EXISTS romaneios (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
      source_id VARCHAR(80) NOT NULL,
      version_of VARCHAR(80),
      data TIMESTAMP NOT NULL,
      recorded_at_client TIMESTAMP,
      tipo_transporte VARCHAR(60) NOT NULL,
      destino VARCHAR(200) NOT NULL,
      observacao TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (empresa_id, source_id)
    );

    CREATE TABLE IF NOT EXISTS combustiveis (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
      source_id VARCHAR(80) NOT NULL,
      version_of VARCHAR(80),
      data TIMESTAMP NOT NULL,
      recorded_at_client TIMESTAMP,
      litros NUMERIC(10, 2) NOT NULL,
      valor_total NUMERIC(14, 2),
      preco_por_litro NUMERIC(14, 6),
      tipo_combustivel VARCHAR(50) NOT NULL,
      horimetro NUMERIC(10,2),
      hodometro NUMERIC(10,2),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (empresa_id, source_id)
    );

    CREATE TABLE IF NOT EXISTS parte_diaria (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
      source_id VARCHAR(80) NOT NULL,
      version_of VARCHAR(80),
      data TIMESTAMP NOT NULL,
      recorded_at_client TIMESTAMP,
      contratado VARCHAR(120) NOT NULL,
      operador VARCHAR(120) NOT NULL,
      equipamento VARCHAR(120) NOT NULL,
      marca_modelo VARCHAR(120) NOT NULL,
      local VARCHAR(200) NOT NULL,
      expediente VARCHAR(120),
      periodo VARCHAR(20) NOT NULL,
      clima VARCHAR(20) NOT NULL,
      horimetro_inicio NUMERIC(10,2) NOT NULL,
      horimetro_fim NUMERIC(10,2) NOT NULL,
      total_horas NUMERIC(10,2) NOT NULL,
      hodometro_inicio NUMERIC(10,2),
      hodometro_fim NUMERIC(10,2),
      total_km NUMERIC(10,2),
      checklist JSONB NOT NULL,
      outros_descricao TEXT,
      tempo_parado VARCHAR(120),
      observacoes TEXT,
      producao TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (empresa_id, source_id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      acao VARCHAR(20) NOT NULL,
      tabela VARCHAR(50) NOT NULL,
      registro_id VARCHAR(120) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email VARCHAR(150);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS marca VARCHAR(120);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS modelo VARCHAR(120);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS capacidade_ton NUMERIC(10, 2);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS capacidade_esteril_ton NUMERIC(10, 2);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS capacidade_rocha_ton NUMERIC(10, 2);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS codigo_operacional INTEGER;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS transporta_esteril BOOLEAN;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS transporta_rocha BOOLEAN;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS usa_para_transporte BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS tipo_operacao VARCHAR(20) NOT NULL DEFAULT 'apoio';
    ALTER TABLE romaneios ADD COLUMN IF NOT EXISTS version_of VARCHAR(80);
    ALTER TABLE romaneios ADD COLUMN IF NOT EXISTS recorded_at_client TIMESTAMP;
    ALTER TABLE combustiveis ADD COLUMN IF NOT EXISTS version_of VARCHAR(80);
    ALTER TABLE combustiveis ADD COLUMN IF NOT EXISTS recorded_at_client TIMESTAMP;
    ALTER TABLE combustiveis ADD COLUMN IF NOT EXISTS valor_total NUMERIC(14, 2);
    ALTER TABLE combustiveis ADD COLUMN IF NOT EXISTS preco_por_litro NUMERIC(14, 6);
    ALTER TABLE parte_diaria ADD COLUMN IF NOT EXISTS veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL;
    ALTER TABLE parte_diaria ADD COLUMN IF NOT EXISTS version_of VARCHAR(80);
    ALTER TABLE parte_diaria ADD COLUMN IF NOT EXISTS recorded_at_client TIMESTAMP;
    ALTER TABLE parte_diaria ADD COLUMN IF NOT EXISTS expediente VARCHAR(120);
    ALTER TABLE parte_diaria ADD COLUMN IF NOT EXISTS hodometro_inicio NUMERIC(10,2);
    ALTER TABLE parte_diaria ADD COLUMN IF NOT EXISTS hodometro_fim NUMERIC(10,2);
    ALTER TABLE parte_diaria ADD COLUMN IF NOT EXISTS total_km NUMERIC(10,2);
    ALTER TABLE parte_diaria ADD COLUMN IF NOT EXISTS outros_descricao TEXT;
    ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_usuario_id_fkey;
    ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_empresa_id_cpf_id_key;
  `);

  await pool.query(`
    UPDATE empresas
    SET logo_url = REPLACE(logo_url, '\\', '/')
    WHERE logo_url LIKE '%\\%';

    UPDATE empresas
    SET logo_url = REGEXP_REPLACE(logo_url, '^.*(/uploads/.*)$', '\\1')
    WHERE logo_url ~* '/uploads/';

    UPDATE empresas
    SET logo_url = '/' || logo_url
    WHERE logo_url IS NOT NULL
      AND logo_url <> ''
      AND logo_url !~* '^https?://'
      AND logo_url NOT LIKE '/%';

    UPDATE veiculos
    SET tipo_operacao = CASE WHEN COALESCE(usa_para_transporte, false) THEN 'transporte' ELSE 'apoio' END;
  `);

  await pool.query(`
    UPDATE veiculos
    SET transporta_esteril = CASE
      WHEN COALESCE(usa_para_transporte, false) = false THEN false
      WHEN capacidade_esteril_ton IS NOT NULL OR capacidade_rocha_ton IS NOT NULL THEN capacidade_esteril_ton IS NOT NULL
      ELSE COALESCE(capacidade_ton, 0) > 0
    END
    WHERE transporta_esteril IS NULL;

    UPDATE veiculos
    SET transporta_rocha = CASE
      WHEN COALESCE(usa_para_transporte, false) = false THEN false
      WHEN capacidade_esteril_ton IS NOT NULL OR capacidade_rocha_ton IS NOT NULL THEN capacidade_rocha_ton IS NOT NULL
      ELSE COALESCE(capacidade_ton, 0) > 0
    END
    WHERE transporta_rocha IS NULL;

    UPDATE veiculos
    SET capacidade_esteril_ton = NULL
    WHERE transporta_esteril IS FALSE;

    UPDATE veiculos
    SET capacidade_rocha_ton = NULL
    WHERE transporta_rocha IS FALSE;
  `);

  await pool.query(`
    WITH ranked AS (
      SELECT
        v.id,
        COALESCE((
          SELECT MAX(v2.codigo_operacional)
          FROM veiculos v2
          WHERE v2.empresa_id = v.empresa_id
        ), 0)
        + ROW_NUMBER() OVER (PARTITION BY v.empresa_id ORDER BY v.created_at ASC, v.id ASC)::int AS codigo
      FROM veiculos v
      WHERE v.codigo_operacional IS NULL
    )
    UPDATE veiculos v
    SET codigo_operacional = ranked.codigo
    FROM ranked
    WHERE ranked.id = v.id;
  `);

  await pool.query(`
    ALTER TABLE usuarios ALTER COLUMN empresa_id DROP NOT NULL;
    ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
    ALTER TABLE usuarios ALTER COLUMN role DROP DEFAULT;
  `);

  await pool.query(`
    ALTER TABLE usuarios
      ALTER COLUMN role TYPE user_role
      USING (
        CASE
          WHEN role::text IN ('admin', 'gestor', 'ADMIN_EMPRESA') THEN 'ADMIN_EMPRESA'::user_role
          WHEN role::text = 'SUPER_ADMIN' THEN 'SUPER_ADMIN'::user_role
          WHEN role::text = 'MOTORISTA' THEN 'MOTORISTA'::user_role
          WHEN role::text = 'APONTADOR' THEN 'APONTADOR'::user_role
          ELSE 'MOTORISTA'::user_role
        END
      );
    ALTER TABLE usuarios ALTER COLUMN role SET DEFAULT 'MOTORISTA';
  `);

  await pool.query(`
    UPDATE usuarios
    SET empresa_id = NULL, veiculo_id = NULL
    WHERE role = 'SUPER_ADMIN';

    ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_scope_check;
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_role_scope_check CHECK (
        (role = 'SUPER_ADMIN' AND empresa_id IS NULL)
        OR (role IN ('ADMIN_EMPRESA', 'MOTORISTA', 'APONTADOR') AND empresa_id IS NOT NULL)
      );
  `);

  await pool.query(`
    DROP INDEX IF EXISTS ux_usuarios_login_admin_email;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_login_admin_email
      ON usuarios (LOWER(email))
      WHERE role IN ('ADMIN_EMPRESA', 'SUPER_ADMIN', 'APONTADOR') AND email IS NOT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_usuarios_cpf_id ON usuarios (cpf_id);
    CREATE INDEX IF NOT EXISTS idx_usuarios_admin_cpf ON usuarios (cpf_id) WHERE role IN ('ADMIN_EMPRESA', 'SUPER_ADMIN', 'APONTADOR');
    CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_id ON usuarios (empresa_id);
    CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_cpf ON usuarios (empresa_id, cpf_id);
    CREATE INDEX IF NOT EXISTS idx_usuarios_email_lower ON usuarios (LOWER(COALESCE(email, '')));
    DROP INDEX IF EXISTS ux_usuarios_login_motorista_cpf;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_empresa_motorista_cpf
      ON usuarios (empresa_id, cpf_id)
      WHERE role = 'MOTORISTA';
    CREATE INDEX IF NOT EXISTS idx_veiculos_empresa_id ON veiculos (empresa_id);
    CREATE INDEX IF NOT EXISTS idx_veiculos_empresa_created ON veiculos (empresa_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_veiculos_empresa_codigo_operacional
      ON veiculos (empresa_id, codigo_operacional)
      WHERE codigo_operacional IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_usuarios_veiculo_empresa ON usuarios (veiculo_id, empresa_id)
      WHERE veiculo_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS motorista_veiculos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      motorista_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      is_principal BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (empresa_id, motorista_id, veiculo_id)
    );
    INSERT INTO motorista_veiculos (empresa_id, motorista_id, veiculo_id, is_principal)
    SELECT u.empresa_id, u.id, u.veiculo_id, true
    FROM usuarios u
    INNER JOIN veiculos v ON v.id = u.veiculo_id AND v.empresa_id = u.empresa_id
    WHERE u.role = 'MOTORISTA'
      AND u.empresa_id IS NOT NULL
      AND u.veiculo_id IS NOT NULL
    ON CONFLICT (empresa_id, motorista_id, veiculo_id)
    DO UPDATE SET is_principal = motorista_veiculos.is_principal OR EXCLUDED.is_principal;
    CREATE INDEX IF NOT EXISTS idx_motorista_veiculos_motorista
      ON motorista_veiculos (empresa_id, motorista_id);
    CREATE INDEX IF NOT EXISTS idx_motorista_veiculos_veiculo
      ON motorista_veiculos (empresa_id, veiculo_id);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_motorista_veiculos_principal
      ON motorista_veiculos (empresa_id, motorista_id)
      WHERE is_principal = true;
    CREATE INDEX IF NOT EXISTS idx_romaneios_veiculo_empresa_data ON romaneios (veiculo_id, empresa_id, data DESC);
    CREATE INDEX IF NOT EXISTS idx_combustiveis_veiculo_empresa_data ON combustiveis (veiculo_id, empresa_id, data DESC);
    CREATE INDEX IF NOT EXISTS idx_parte_diaria_veiculo_empresa_data ON parte_diaria (veiculo_id, empresa_id, data DESC);
    CREATE INDEX IF NOT EXISTS idx_romaneios_empresa_data ON romaneios (empresa_id, data DESC);
    CREATE INDEX IF NOT EXISTS idx_romaneios_usuario_empresa_data ON romaneios (usuario_id, empresa_id, data DESC);
    CREATE INDEX IF NOT EXISTS idx_parte_diaria_usuario_empresa_data ON parte_diaria (usuario_id, empresa_id, data DESC);
    CREATE INDEX IF NOT EXISTS idx_combustiveis_empresa_data ON combustiveis (empresa_id, data DESC);
    CREATE INDEX IF NOT EXISTS idx_parte_diaria_empresa_data ON parte_diaria (empresa_id, data DESC);

    CREATE TABLE IF NOT EXISTS viagens (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      motorista_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      apontador_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('esteril', 'rocha')),
      marcacao TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE viagens ADD COLUMN IF NOT EXISTS apontador_id INTEGER;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'viagens_apontador_id_fkey'
      ) THEN
        ALTER TABLE viagens
          ADD CONSTRAINT viagens_apontador_id_fkey
          FOREIGN KEY (apontador_id) REFERENCES usuarios(id) ON DELETE SET NULL;
      END IF;
    END
    $$;
    CREATE INDEX IF NOT EXISTS idx_viagens_empresa_marcacao ON viagens (empresa_id, marcacao DESC);
    CREATE INDEX IF NOT EXISTS idx_viagens_empresa_apontador_marcacao
      ON viagens (empresa_id, apontador_id, marcacao DESC)
      WHERE apontador_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS planejamento_semanal (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      data_inicio DATE NOT NULL,
      data_fim DATE NOT NULL,
      meta_esteril_ton NUMERIC(12, 2) NOT NULL DEFAULT 0,
      meta_rocha_ton NUMERIC(12, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (data_inicio <= data_fim),
      CHECK (meta_esteril_ton >= 0 AND meta_rocha_ton >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_planejamento_empresa_datas ON planejamento_semanal (empresa_id, data_inicio, data_fim);

    CREATE TABLE IF NOT EXISTS operational_alert_events (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      alert_key VARCHAR(190) NOT NULL,
      severity VARCHAR(16) NOT NULL,
      category VARCHAR(40) NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT true,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (empresa_id, alert_key)
    );
    CREATE INDEX IF NOT EXISTS idx_op_alert_empresa_active ON operational_alert_events (empresa_id, is_active, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS operational_alert_reads (
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      alert_key VARCHAR(190) NOT NULL,
      read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (usuario_id, alert_key)
    );
    CREATE INDEX IF NOT EXISTS idx_op_alert_reads_usuario ON operational_alert_reads (usuario_id, read_at DESC);
  `);

  await pool.query(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cnh_validade DATE;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS doc_revisao_validade DATE;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS manutencao_agendar_ate DATE;
  `);

  await pool.query(`
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS tipo VARCHAR(80);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS categoria VARCHAR(80);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS ano INTEGER;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS renavam VARCHAR(32);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS chassi VARCHAR(48);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS combustivel_principal VARCHAR(50);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS capacidade_litros NUMERIC(12, 2);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS horimetro_atual NUMERIC(14, 2);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS hodometro_atual NUMERIC(14, 2);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS status_operacional VARCHAR(24) NOT NULL DEFAULT 'ativo';
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS doc_licenciamento_validade DATE;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS doc_seguro_validade DATE;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS doc_inspecao_validade DATE;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS fleet_telemetry_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_veiculos_empresa_status ON veiculos (empresa_id, status_operacional);
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'veiculos_status_operacional_chk'
      ) THEN
        ALTER TABLE veiculos
          ADD CONSTRAINT veiculos_status_operacional_chk
          CHECK (status_operacional IN ('ativo', 'manutencao', 'indisponivel', 'parado', 'operacao'));
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS veiculo_manutencoes (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('preventiva', 'corretiva')),
      titulo VARCHAR(200) NOT NULL,
      descricao TEXT,
      custo NUMERIC(14, 2),
      data_servico DATE NOT NULL,
      odometro_snapshot NUMERIC(14, 2),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_veiculo_manut_empresa ON veiculo_manutencoes (empresa_id, data_servico DESC);
    CREATE INDEX IF NOT EXISTS idx_veiculo_manut_veiculo ON veiculo_manutencoes (veiculo_id, data_servico DESC);
  `);

  await pool.query(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS funcao VARCHAR(120);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cnh_categoria VARCHAR(20);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cnh_numero VARCHAR(40);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS treinamentos JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS observacoes TEXT;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS equipamento_vinculo VARCHAR(200);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS operacao_escopo VARCHAR(200);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS status_operacional VARCHAR(20) NOT NULL DEFAULT 'ativo';
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS conta_status VARCHAR(20) NOT NULL DEFAULT 'ativo';
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_conta_status_chk'
      ) THEN
        ALTER TABLE usuarios
          ADD CONSTRAINT usuarios_conta_status_chk
          CHECK (conta_status IN ('ativo', 'inativo'));
      END IF;
    END
    $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_status_operacional_pessoa_chk'
      ) THEN
        ALTER TABLE usuarios
          ADD CONSTRAINT usuarios_status_operacional_pessoa_chk
          CHECK (status_operacional IN ('ativo', 'afastado', 'suspenso'));
      END IF;
    END
    $$;
  `);
};

module.exports = {
  pool,
  initDb,
};
