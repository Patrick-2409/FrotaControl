const express = require("express");
const { asyncHandler } = require("../../../utils/asyncHandler");
const ctrl = require("../controllers/automationConfigController");

const router = express.Router();

// Montado em app.js sob /api/automations, atrás de authMiddleware +
// requireAccountActive + requireRole("ADMIN_EMPRESA", "SUPER_ADMIN") — MOTORISTA
// e APONTADOR não têm acesso a nenhuma rota deste módulo (aplicado uma única vez
// no app.use, igual ao restante do FrotaMax).

router.get("/catalog", asyncHandler(ctrl.getCatalog));

router.get("/configs", asyncHandler(ctrl.listConfigs));
router.post("/configs", asyncHandler(ctrl.createConfig));
router.get("/configs/:id", asyncHandler(ctrl.getConfig));
router.put("/configs/:id", asyncHandler(ctrl.updateConfig));
router.patch("/configs/:id/status", asyncHandler(ctrl.updateConfigStatus));
router.delete("/configs/:id", asyncHandler(ctrl.deleteConfig));

router.get("/configs/:id/approvers", asyncHandler(ctrl.listApprovers));
router.post("/configs/:id/approvers", asyncHandler(ctrl.createApprover));
router.patch("/configs/:id/approvers/:approverId", asyncHandler(ctrl.updateApprover));
router.delete("/configs/:id/approvers/:approverId", asyncHandler(ctrl.deleteApprover));

router.get("/configs/:id/recipients", asyncHandler(ctrl.listRecipients));
router.post("/configs/:id/recipients", asyncHandler(ctrl.createRecipient));
router.patch("/configs/:id/recipients/:recipientId", asyncHandler(ctrl.updateRecipient));
router.delete("/configs/:id/recipients/:recipientId", asyncHandler(ctrl.deleteRecipient));

module.exports = router;
