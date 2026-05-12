const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  dashboard,
  list,
  updateRecord,
  deleteRecord,
  viagensResumo,
  custoOperacional,
  combustiveisResumo,
  postPlanejamento,
  getPlanejamentoAtualHandler,
  getViagensComparacao,
  dashboardAlertas,
} = require("../controllers/dashboardController");
const {
  relatorioRomaneio,
  relatorioProducao,
  relatorioCombustivel,
  relatorioCompleto,
} = require("../controllers/relatoriosExportController");

const router = express.Router();

router.get("/stats", asyncHandler(dashboard));
router.get("/alertas", asyncHandler(dashboardAlertas));
router.get("/planejamento/atual", asyncHandler(getPlanejamentoAtualHandler));
router.post("/planejamento", asyncHandler(postPlanejamento));
router.get("/viagens/comparacao", asyncHandler(getViagensComparacao));
router.get("/viagens/resumo", asyncHandler(viagensResumo));
router.get("/custo-operacional", asyncHandler(custoOperacional));
router.get("/combustiveis/resumo", asyncHandler(combustiveisResumo));
router.get("/relatorios/romaneio", asyncHandler(relatorioRomaneio));
router.get("/relatorios/producao", asyncHandler(relatorioProducao));
router.get("/relatorios/combustivel", asyncHandler(relatorioCombustivel));
router.get("/relatorios/completo", asyncHandler(relatorioCompleto));
router.get("/registros", asyncHandler(list));
router.put("/registros/:tipo/:id", asyncHandler(updateRecord));
router.delete("/registros/:tipo/:id", asyncHandler(deleteRecord));

module.exports = router;
