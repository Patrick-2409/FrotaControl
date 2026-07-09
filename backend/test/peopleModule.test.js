"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { z } = require("zod");

const userSchema = z.object({
  nome: z.string().trim().min(3),
  email: z.string().email().optional(),
  cpf_id: z.string().trim().min(3),
  role: z.enum(["MOTORISTA", "ADMIN_EMPRESA", "APONTADOR", "SUPER_ADMIN"]).default("MOTORISTA"),
  veiculo_id: z.coerce.number().int().positive().nullable().optional(),
  treinamentos: z
    .array(
      z.object({
        titulo: z.string().trim().min(1).max(200),
        validade: z.string().trim().optional().nullable(),
      })
    )
    .optional(),
});

test("userSchema aceita treinamentos", () => {
  const v = userSchema.parse({
    nome: "João Silva Santos",
    cpf_id: "12345678901",
    role: "MOTORISTA",
    veiculo_id: 1,
    treinamentos: [{ titulo: "NR-10", validade: "2027-01-15" }],
  });
  assert.strictEqual(v.treinamentos.length, 1);
  assert.strictEqual(v.treinamentos[0].titulo, "NR-10");
});

test("getPeopleSummary calcula risco de romaneio apenas para motoristas de transporte", async () => {
  const pathDb = require.resolve("../src/db");
  const pathPeople = require.resolve("../src/models/peopleModel");
  delete require.cache[pathPeople];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    const text = String(sql);
    calls.push({ sql: text, params });
    if (/COUNT\(\*\) FILTER \(WHERE role = 'MOTORISTA'\)/.test(text)) {
      return { rows: [{ motoristas: 2, apontadores: 0, admins: 0 }] };
    }
    if (/GROUP BY status_operacional/.test(text)) {
      return { rows: [{ status_operacional: "ativo", c: 2 }] };
    }
    if (/cnh_validade/.test(text)) {
      return { rows: [{ vencidas: 0, vencendo: 0, validas: 2 }] };
    }
    if (/FROM romaneios/.test(text) && !/NOT EXISTS/.test(text) && !/rom_stats/.test(text)) {
      return { rows: [{ c: 0 }] };
    }
    if (/FROM parte_diaria/.test(text)) {
      return { rows: [{ c: 0 }] };
    }
    if (/NOT EXISTS/.test(text)) {
      return { rows: [{ c: 1 }] };
    }
    if (/rom_stats/.test(text)) {
      return { rows: [{ c: 0 }] };
    }
    throw new Error(`consulta inesperada: ${text}`);
  };
  try {
    const { getPeopleSummary } = require("../src/models/peopleModel");
    const summary = await getPeopleSummary(7);
    assert.strictEqual(summary.motoristas_sem_romaneio_7d, 1);

    const semRomaneioQuery = calls.find((c) => /NOT EXISTS/.test(c.sql));
    assert.ok(semRomaneioQuery, "esperada query de motoristas sem romaneio");
    assert.match(semRomaneioQuery.sql, /FROM motorista_veiculos mv/);
    assert.match(semRomaneioQuery.sql, /mv\.empresa_id = u\.empresa_id/);
    assert.match(semRomaneioQuery.sql, /INNER JOIN veiculos vt ON vt\.id = uv2\.veiculo_id AND vt\.empresa_id = u\.empresa_id/);
    assert.match(semRomaneioQuery.sql, /= 'transporte'/);
    assert.match(semRomaneioQuery.sql, /FROM viagens vi/);

    const baixaAtividadeQuery = calls.find((c) => /rom_stats/.test(c.sql));
    assert.ok(baixaAtividadeQuery, "esperada query de baixa atividade");
    assert.match(baixaAtividadeQuery.sql, /FROM motorista_veiculos mv/);
    assert.match(baixaAtividadeQuery.sql, /mv\.empresa_id = u\.empresa_id/);
    assert.match(baixaAtividadeQuery.sql, /INNER JOIN veiculos vt ON vt\.id = uv2\.veiculo_id AND vt\.empresa_id = u\.empresa_id/);
    assert.match(baixaAtividadeQuery.sql, /= 'transporte'/);
    assert.match(baixaAtividadeQuery.sql, /FROM viagens vi/);

    const romaneios7dQuery = calls.find(
      (c) => /COUNT\(\*\)::int AS c/.test(c.sql) && /transport_events/.test(c.sql) && !/NOT EXISTS/.test(c.sql)
    );
    assert.ok(romaneios7dQuery, "esperada query de contagem consolidada de romaneios");
    assert.match(romaneios7dQuery.sql, /FROM romaneios r/);
    assert.match(romaneios7dQuery.sql, /FROM viagens vi/);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathPeople];
    delete require.cache[pathDb];
  }
});

test("getPeopleSummary usa fallback quando schema de pessoas ainda esta em migracao", async () => {
  const pathDb = require.resolve("../src/db");
  const pathQt = require.resolve("../src/utils/queryTimed");
  const pathPeople = require.resolve("../src/models/peopleModel");
  delete require.cache[pathQt];
  delete require.cache[pathPeople];
  const db = require("../src/db");
  const orig = db.pool.query;
  db.pool.query = async (sql) => {
    const text = String(sql);
    if (/GROUP BY status_operacional/.test(text)) {
      const err = new Error('column "status_operacional" does not exist');
      err.code = "42703";
      throw err;
    }
    if (/COUNT\(\*\) FILTER \(WHERE role = 'MOTORISTA'\)/.test(text)) {
      return { rows: [{ motoristas: 2, apontadores: 1, admins: 1 }] };
    }
    if (/FROM romaneios/.test(text)) return { rows: [{ c: 4 }] };
    if (/FROM parte_diaria/.test(text)) return { rows: [{ c: 3 }] };
    if (/cnh_validade/.test(text)) return { rows: [{ vencidas: 0, vencendo: 0, validas: 0 }] };
    return { rows: [{ c: 0 }] };
  };
  try {
    const { getPeopleSummary } = require("../src/models/peopleModel");
    const summary = await getPeopleSummary(7);
    assert.strictEqual(summary.motoristas, 2);
    assert.strictEqual(summary.apontadores, 1);
    assert.strictEqual(summary.admins_empresa, 1);
    assert.deepStrictEqual(summary.por_status, { ativo: 3 });
    assert.strictEqual(summary.romaneios_7d, 4);
    assert.strictEqual(summary.parte_diaria_7d, 3);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathPeople];
    delete require.cache[pathQt];
    delete require.cache[pathDb];
  }
});

test("getPeopleProductivity usa fallback quando motorista_veiculos ainda nao existe", async () => {
  const pathDb = require.resolve("../src/db");
  const pathQt = require.resolve("../src/utils/queryTimed");
  const pathPeople = require.resolve("../src/models/peopleModel");
  delete require.cache[pathQt];
  delete require.cache[pathPeople];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql) => {
    const text = String(sql);
    calls.push(text);
    if (/LEFT JOIN LATERAL/.test(text)) {
      const err = new Error('relation "motorista_veiculos" does not exist');
      err.code = "42P01";
      throw err;
    }
    return {
      rows: [
        {
          id: 10,
          nome: "Motorista A",
          role: "MOTORISTA",
          veiculo_id: 20,
          romaneios: 2,
          partes_diaria: 1,
        },
      ],
    };
  };
  try {
    const { getPeopleProductivity } = require("../src/models/peopleModel");
    const rows = await getPeopleProductivity(7, { days: 30, limit: 10, with_7d: true });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].nome, "Motorista A");
    assert.ok(calls.length >= 2, "esperada tentativa completa seguida de fallback");
    assert.ok(calls.some((sql) => /FROM viagens vi/.test(sql)), "esperada agregacao de viagens no ranking");
  } finally {
    db.pool.query = orig;
    delete require.cache[pathPeople];
    delete require.cache[pathQt];
    delete require.cache[pathDb];
  }
});
