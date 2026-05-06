const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { exportExcel, exportPdf } = require("../controllers/exportController");

const router = express.Router();

router.get("/excel", asyncHandler(exportExcel));
router.get("/pdf", asyncHandler(exportPdf));

module.exports = router;
