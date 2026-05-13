/**
 * Serviço de domínio — operações diárias e painel executivo (listagens, edição, KPIs agregados).
 * Os KPIs em `dashboardStats` cruzam módulos; evolução futura: dividir por bounded context.
 */
const recordModel = require("../models/recordModel");

module.exports = {
  dashboardStats: recordModel.dashboardStats,
  listManagerRecords: recordModel.listManagerRecords,
  updateManagerRecord: recordModel.updateManagerRecord,
  deleteManagerRecord: recordModel.deleteManagerRecord,
};
