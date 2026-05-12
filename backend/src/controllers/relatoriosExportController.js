const { exportExcel, exportPdf } = require("./exportController");

/**
 * Relatórios no layout Porto (Excel/PDF): reutiliza exportController com `tipo` fixo por rota.
 * Query: format=excel|pdf + mesmos filtros de período que /dashboard/export (data, mes, data_inicio, data_fim, motorista).
 */
const mergeQueryForPreset = (query, preset) => {
  const next = { ...query };
  delete next.format;
  if (preset === "completo") {
    delete next.tipo;
  } else if (preset === "producao") {
    next.tipo = "parte_diaria";
  } else {
    next.tipo = preset;
  }
  return next;
};

const runRelatorioPreset = async (req, res, preset) => {
  const format = String(req.query.format || "").trim().toLowerCase();
  if (format !== "excel" && format !== "pdf") {
    return res.status(400).json({
      success: false,
      error: "Parâmetro format obrigatório.",
      message: "Use format=excel ou format=pdf.",
    });
  }
  const mergedQuery = mergeQueryForPreset(req.query, preset);
  const forwardReq = Object.assign(Object.create(Object.getPrototypeOf(req)), req, {
    query: mergedQuery,
  });
  if (format === "pdf") {
    return exportPdf(forwardReq, res);
  }
  return exportExcel(forwardReq, res);
};

const relatorioRomaneio = (req, res) => runRelatorioPreset(req, res, "romaneio");
const relatorioProducao = (req, res) => runRelatorioPreset(req, res, "producao");
const relatorioCombustivel = (req, res) => runRelatorioPreset(req, res, "combustivel");
const relatorioCompleto = (req, res) => runRelatorioPreset(req, res, "completo");

module.exports = {
  relatorioRomaneio,
  relatorioProducao,
  relatorioCombustivel,
  relatorioCompleto,
};
