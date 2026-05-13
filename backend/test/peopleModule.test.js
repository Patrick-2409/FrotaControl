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
