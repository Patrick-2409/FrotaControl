const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { postAiReportHandler } = require("../controllers/operationalAiController");

const router = express.Router();

router.post("/report", asyncHandler(postAiReportHandler));

module.exports = router;

