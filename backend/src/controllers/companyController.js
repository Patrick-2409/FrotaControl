const { z } = require("zod");
const {
  createCompany,
  listCompanies,
  updateCompany,
  deleteCompany,
} = require("../models/companyModel");

const schema = z.object({
  nome: z.string().min(2),
  logo_url: z.string().url().optional(),
});

const create = async (req, res) => {
  const data = schema.parse(req.body);
  const company = await createCompany(data);
  return res.status(201).json(company);
};

const list = async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const search = String(req.query.search || "");
  const result = await listCompanies({ page, limit, search });
  return res.json({
    ...result,
    page,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
};

const update = async (req, res) => {
  const data = schema.parse(req.body);
  const company = await updateCompany(Number(req.params.id), data);
  return res.json(company);
};

const remove = async (req, res) => {
  await deleteCompany(Number(req.params.id));
  return res.status(204).send();
};

module.exports = {
  create,
  list,
  update,
  remove,
};
