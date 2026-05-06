const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { dashboard, list, updateRecord, deleteRecord } = require("../controllers/dashboardController");

const router = express.Router();

router.get("/stats", asyncHandler(dashboard));
router.get("/registros", asyncHandler(list));
router.put("/registros/:tipo/:id", asyncHandler(updateRecord));
router.delete("/registros/:tipo/:id", asyncHandler(deleteRecord));

module.exports = router;
