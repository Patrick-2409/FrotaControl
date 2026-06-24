const { test } = require("node:test");
const assert = require("node:assert/strict");

const createRes = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  send(payload) {
    this.body = payload;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

test("exportPdf gera PDF operacional com escopo da empresa", async () => {
  const controllerPath = require.resolve("../src/controllers/exportController");
  const recordModelPath = require.resolve("../src/models/recordModel");
  const companyModelPath = require.resolve("../src/models/companyModel");

  delete require.cache[controllerPath];
  const recordModel = require(recordModelPath);
  const companyModel = require(companyModelPath);
  const originalListManagerRecords = recordModel.listManagerRecords;
  const originalGetCompanyById = companyModel.getCompanyById;
  const calls = [];

  recordModel.listManagerRecords = async (args) => {
    calls.push(args);
    if (args.limit === 1) return { total: 1, items: [] };
    return {
      total: 1,
      items: [
        {
          tipo: "combustivel",
          source_id: "source-123456",
          data: "2026-06-24T10:00:00",
          motorista: "Joao",
          veiculo: "Caminhao A",
          placa: "ABC-1234",
          litros: 50,
          valor_total: 350,
          tipo_combustivel: "diesel",
        },
      ],
    };
  };
  companyModel.getCompanyById = async (id) => ({ id, nome: "ACME", logo_url: null });

  try {
    delete require.cache[controllerPath];
    const { exportPdf } = require(controllerPath);
    const req = {
      user: { role: "ADMIN_EMPRESA", empresa_id: 7, sub: 99 },
      query: { data: "2026-06-24", tipo: "combustivel" },
      body: {},
      originalUrl: "/api/dashboard/export/pdf",
      url: "/api/dashboard/export/pdf",
      headers: {},
      protocol: "https",
      get: () => "api.example.com",
    };
    const res = createRes();

    await exportPdf(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "application/pdf");
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.subarray(0, 4).toString("latin1"), "%PDF");
    assert.equal(calls[0].empresa_id, 7);
    assert.equal(calls[1].empresa_id, 7);
  } finally {
    recordModel.listManagerRecords = originalListManagerRecords;
    companyModel.getCompanyById = originalGetCompanyById;
    delete require.cache[controllerPath];
  }
});
