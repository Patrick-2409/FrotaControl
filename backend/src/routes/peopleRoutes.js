const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { getSummary, getProductivity } = require("../controllers/peopleController");

const router = express.Router();

router.get("/summary", asyncHandler(getSummary));
router.get("/productivity", asyncHandler(getProductivity));

module.exports = router;
