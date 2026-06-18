const express = require("express");
const multer = require("multer");
const { asyncHandler } = require("../utils/asyncHandler");
const { savePersistentImage } = require("../services/uploadStorageService");
const {
  createCompanyCtrl,
  listCompaniesCtrl,
  updateCompanyCtrl,
  deleteCompanyCtrl,
  createUserCtrl,
  listUsersCtrl,
  updateUserCtrl,
  deleteUserCtrl,
  patchUserContaStatusCtrl,
  createVehicleCtrl,
  listVehiclesCtrl,
  updateVehicleCtrl,
  deleteVehicleCtrl,
  listAdminAuditLogsCtrl,
  getOverviewCtrl,
  companyDetailsCtrl,
  globalSearchCtrl,
  getSuperAdminUserCtrl,
  resetUserPasswordCtrl,
} = require("../controllers/adminController");

const router = express.Router();
const requireSuperAdminRoute = (req, res, next) => {
  if (req.user?.role !== "SUPER_ADMIN") {
    return res.status(403).json({
      success: false,
      error: "Acesso restrito ao super administrador.",
      message: "Acesso restrito ao super administrador.",
    });
  }
  return next();
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Upload inválido: envie apenas imagens PNG, JPEG ou WebP"));
    }
    cb(null, true);
  },
});

router.get("/companies", requireSuperAdminRoute, asyncHandler(listCompaniesCtrl));
router.get("/companies/:id/details", requireSuperAdminRoute, asyncHandler(companyDetailsCtrl));
router.post("/companies", requireSuperAdminRoute, upload.single("logo"), asyncHandler(async (req, res) => {
  if (req.file) {
    req.body.logo_url = await savePersistentImage({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      category: "companies",
      ownerId: req.user?.sub,
    });
  }
  return createCompanyCtrl(req, res);
}));
router.put("/companies/:id", requireSuperAdminRoute, upload.single("logo"), asyncHandler(async (req, res) => {
  if (req.file) {
    req.body.logo_url = await savePersistentImage({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      category: "companies",
      ownerId: req.params?.id || req.user?.sub,
    });
  }
  return updateCompanyCtrl(req, res);
}));
router.delete("/companies/:id", requireSuperAdminRoute, asyncHandler(deleteCompanyCtrl));
router.get("/overview", requireSuperAdminRoute, asyncHandler(getOverviewCtrl));
router.get("/audit-logs", requireSuperAdminRoute, asyncHandler(listAdminAuditLogsCtrl));
router.get("/search", requireSuperAdminRoute, asyncHandler(globalSearchCtrl));

router.get("/users", asyncHandler(listUsersCtrl));
router.get("/users/:id", requireSuperAdminRoute, asyncHandler(getSuperAdminUserCtrl));
router.post("/users", asyncHandler(createUserCtrl));
router.put("/users/:id", asyncHandler(updateUserCtrl));
router.patch("/users/:id/conta-status", asyncHandler(patchUserContaStatusCtrl));
router.delete("/users/:id", asyncHandler(deleteUserCtrl));
router.post("/users/:id/reset-password", requireSuperAdminRoute, asyncHandler(resetUserPasswordCtrl));

router.get("/vehicles", asyncHandler(listVehiclesCtrl));
router.post("/vehicles", asyncHandler(createVehicleCtrl));
router.put("/vehicles/:id", asyncHandler(updateVehicleCtrl));
router.delete("/vehicles/:id", asyncHandler(deleteVehicleCtrl));

module.exports = router;
