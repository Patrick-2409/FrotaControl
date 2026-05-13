/**
 * CSV UTF-8 para exportação de registros (mesmo conjunto de dados que Excel/PDF em lote).
 * BOM para compatibilidade com Excel em Windows.
 */

const csvEscape = (value) => {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const COLUMNS = [
  ["tipo", (r) => r.tipo],
  ["id", (r) => r.id],
  ["source_id", (r) => r.source_id],
  ["motorista", (r) => r.motorista],
  ["data", (r) => r.data],
  ["recorded_at_client", (r) => r.recorded_at_client],
  ["veiculo", (r) => r.veiculo],
  ["placa", (r) => r.placa],
  ["destino", (r) => r.destino],
  ["tipo_transporte", (r) => r.tipo_transporte],
  ["observacao", (r) => r.observacao],
  ["litros", (r) => r.litros],
  ["tipo_combustivel", (r) => r.tipo_combustivel],
  ["horimetro", (r) => r.horimetro],
  ["hodometro", (r) => r.hodometro],
  ["contratado", (r) => r.contratado],
  ["operador", (r) => r.operador],
  ["equipamento", (r) => r.equipamento],
  ["marca_modelo", (r) => r.marca_modelo],
  ["local", (r) => r.local],
  ["periodo", (r) => r.periodo],
  ["clima", (r) => r.clima],
  ["total_horas", (r) => r.total_horas],
  ["horimetro_inicio", (r) => r.horimetro_inicio],
  ["horimetro_fim", (r) => r.horimetro_fim],
  ["hodometro_inicio", (r) => r.hodometro_inicio],
  ["hodometro_fim", (r) => r.hodometro_fim],
  ["total_km", (r) => r.total_km],
  ["checklist_resumo", (r) => r.checklist_resumo],
  ["outros_descricao", (r) => r.outros_descricao],
  ["tempo_parado", (r) => r.tempo_parado],
  ["observacoes", (r) => r.observacoes],
  ["producao", (r) => r.producao],
];

/**
 * @param {object[]} rows
 * @param {string} companyName
 * @returns {string}
 */
function buildRegistrosCsvContent(rows, companyName) {
  const safeName = String(companyName || "Empresa")
    .replace(/\r?\n/g, " ")
    .slice(0, 240);
  const headerLine = `# FrotaControl | Empresa: ${safeName}`;
  const head = COLUMNS.map(([key]) => key).join(",");
  const body = (rows || []).map((row) => COLUMNS.map(([, pick]) => csvEscape(pick(row))).join(",")).join("\r\n");
  return `\ufeff${headerLine}\r\n${head}\r\n${body}\r\n`;
}

module.exports = {
  buildRegistrosCsvContent,
  csvEscape,
};
