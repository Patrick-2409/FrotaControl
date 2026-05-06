const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { create, list, update, remove } = require("../controllers/companyController");

const router = express.Router();

router.get("/", asyncHandler(list));
router.post("/", asyncHandler(create));
router.put("/:id", asyncHandler(update));
router.delete("/:id", asyncHandler(remove));

module.exports = router;
