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
    assert.match(semRomaneioQuery.sql, /INNER JOIN veiculos v ON v\.id = u\.veiculo_id AND v\.empresa_id = u\.empresa_id/);
    assert.match(semRomaneioQuery.sql, /= 'transporte'/);

    const baixaAtividadeQuery = calls.find((c) => /rom_stats/.test(c.sql));
    assert.ok(baixaAtividadeQuery, "esperada query de baixa atividade");
    assert.match(baixaAtividadeQuery.sql, /INNER JOIN veiculos v ON v\.id = u\.veiculo_id AND v\.empresa_id = u\.empresa_id/);
    assert.match(baixaAtividadeQuery.sql, /= 'transporte'/);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathPeople];
    delete require.cache[pathDb];
  }
});
