const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { exportExcel, exportPdf, exportCsv } = require("../controllers/exportController");

const router = express.Router();

router.get("/excel", asyncHandler(exportExcel));
router.get("/pdf", asyncHandler(exportPdf));
router.get("/csv", asyncHandler(exportCsv));

module.exports = router;
