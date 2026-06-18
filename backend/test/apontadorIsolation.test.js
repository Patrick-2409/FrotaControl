"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  insertViagem,
  countViagensHojeApontadorSaoPaulo,
  listRecentViagensHojeApontadorSaoPaulo,
  deleteViagemApontadorMatch,
  deleteViagensApontadorDiaAtualSaoPaulo,
} = require("../src/models/viagemModel");

const createDb = (responses = []) => {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return responses.shift() || { rows: [], rowCount: 0 };
    },
  };
};

test("insertViagem grava apontador_id junto da viagem", async () => {
  const db = createDb([
    {
      rows: [
        {
          id: 10,
          empresa_id: 1,
          veiculo_id: 2,
          motorista_id: 3,
          apontador_id: 4,
          tipo: "esteril",
          marcacao: new Date("2026-06-18T12:00:00.000Z"),
        },
      ],
    },
  ]);

  const row = await insertViagem(
    {
      empresa_id: 1,
      veiculo_id: 2,
      motorista_id: 3,
      apontador_id: 4,
      tipo: "esteril",
      marcacao: new Date("2026-06-18T12:00:00.000Z"),
    },
    db
  );

  assert.match(db.calls[0].sql, /apontador_id/);
  assert.deepStrictEqual(db.calls[0].params.slice(0, 4), [1, 2, 3, 4]);
  assert.strictEqual(row.apontador_id, 4);
});

test("contagem do apontador filtra por empresa_id e apontador_id", async () => {
  const db = createDb([
    {
      rows: [{ esteril: 2, rocha: 1, ton_esteril: 10, ton_rocha: 5 }],
    },
  ]);

  const result = await countViagensHojeApontadorSaoPaulo(7, 9, db);

  assert.match(db.calls[0].sql, /vi\.empresa_id = \$1/);
  assert.match(db.calls[0].sql, /vi\.apontador_id = \$2/);
  assert.deepStrictEqual(db.calls[0].params, [7, 9]);
  assert.deepStrictEqual(result, {
    esteril: 2,
    rocha: 1,
    ton_esteril: 10,
    ton_rocha: 5,
    ton_total: 15,
  });
});

test("ultimos lancamentos do apontador nao listam viagens de outro perfil", async () => {
  const db = createDb([{ rows: [{ id: 1, tipo: "rocha", marcacao: new Date() }] }]);

  await listRecentViagensHojeApontadorSaoPaulo(7, 9, 5, db);

  assert.match(db.calls[0].sql, /empresa_id = \$1/);
  assert.match(db.calls[0].sql, /apontador_id = \$2/);
  assert.deepStrictEqual(db.calls[0].params, [7, 9, 5]);
});

test("desfazer viagem por id exige apontador_id", async () => {
  const db = createDb([{ rows: [{ id: 42 }] }]);

  const deleted = await deleteViagemApontadorMatch(
    {
      empresa_id: 7,
      apontador_id: 9,
      veiculo_id: 11,
      motorista_id: 13,
      tipo: "rocha",
      timestamp_ms: 1770000000000,
      viagem_id: 42,
    },
    db
  );

  assert.match(db.calls[0].sql, /apontador_id = \$3/);
  assert.deepStrictEqual(db.calls[0].params, [42, 7, 9, 11, 13, "rocha"]);
  assert.deepStrictEqual(deleted, { id: 42 });
});

test("reset do dia apaga somente viagens do apontador autenticado", async () => {
  const db = createDb([{ rows: [], rowCount: 3 }]);

  const removed = await deleteViagensApontadorDiaAtualSaoPaulo({ empresa_id: 7, apontador_id: 9 }, db);

  assert.match(db.calls[0].sql, /empresa_id = \$1/);
  assert.match(db.calls[0].sql, /apontador_id = \$2/);
  assert.deepStrictEqual(db.calls[0].params, [7, 9]);
  assert.strictEqual(removed, 3);
});
