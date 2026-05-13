/**
 * Serviço de domínio — combustível (métricas e agregações de resumo).
 */
const recordModel = require("../models/recordModel");

module.exports = {
  getCombustiveisResumoMetrics: recordModel.getCombustiveisResumoMetrics,
  getCombustiveisValorTotalSoma: recordModel.getCombustiveisValorTotalSoma,
};
