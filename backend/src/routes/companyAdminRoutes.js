const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  createUserCtrl,
  listUsersCtrl,
  updateUserCtrl,
  deleteUserCtrl,
  patchUserContaStatusCtrl,
  createVehicleCtrl,
  listVehiclesCtrl,
  updateVehicleCtrl,
  deleteVehicleCtrl,
} = require("../controllers/adminController");

const router = express.Router();

router.get("/users", asyncHandler(listUsersCtrl));
router.post("/users", asyncHandler(createUserCtrl));
router.put("/users/:id", asyncHandler(updateUserCtrl));
router.patch("/users/:id/conta-status", asyncHandler(patchUserContaStatusCtrl));
router.delete("/users/:id", asyncHandler(deleteUserCtrl));

router.get("/vehicles", asyncHandler(listVehiclesCtrl));
router.post("/vehicles", asyncHandler(createVehicleCtrl));
router.put("/vehicles/:id", asyncHandler(updateVehicleCtrl));
router.delete("/vehicles/:id", asyncHandler(deleteVehicleCtrl));

module.exports = router;
