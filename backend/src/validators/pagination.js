const { z } = require("zod");

/** Limite máximo de itens por página nas listagens (proteção contra valores absurdos; não restringir volumes operacionais legítimos). */
const MAX_LIST_LIMIT = 1_000_000;

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(1_000_000).optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIST_LIMIT).optional(),
});

/**
 * Extrai page/limit normalizados a partir de req.query (ou objeto semelhante).
 * @returns {{ page: number, limit: number }}
 */
function parsePaginationQuery(query, defaults = { page: 1, limit: 20 }) {
  const parsed = paginationQuerySchema.safeParse(query || {});
  const q = parsed.success ? parsed.data : {};
  const page = q.page && q.page > 0 ? q.page : defaults.page;
  const limit = q.limit && q.limit > 0 ? q.limit : defaults.limit;
  return { page, limit };
}

module.exports = {
  MAX_LIST_LIMIT,
  paginationQuerySchema,
  parsePaginationQuery,
};
