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
  createVehicleCtrl,
  listVehiclesCtrl,
  updateVehicleCtrl,
  deleteVehicleCtrl,
  getOverviewCtrl,
  companyDetailsCtrl,
  globalSearchCtrl,
  resetUserPasswordCtrl,
} = require("../controllers/adminController");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Upload inválido: envie apenas imagens PNG/JPG/WEBP/SVG"));
    }
    cb(null, true);
  },
});

router.get("/companies", asyncHandler(listCompaniesCtrl));
router.get("/companies/:id/details", asyncHandler(companyDetailsCtrl));
router.post("/companies", upload.single("logo"), asyncHandler(async (req, res) => {
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
router.put("/companies/:id", upload.single("logo"), asyncHandler(async (req, res) => {
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
router.delete("/companies/:id", asyncHandler(deleteCompanyCtrl));
router.get("/overview", asyncHandler(getOverviewCtrl));
router.get("/search", asyncHandler(globalSearchCtrl));

router.get("/users", asyncHandler(listUsersCtrl));
router.post("/users", asyncHandler(createUserCtrl));
router.put("/users/:id", asyncHandler(updateUserCtrl));
router.delete("/users/:id", asyncHandler(deleteUserCtrl));
router.post("/users/:id/reset-password", asyncHandler(resetUserPasswordCtrl));

router.get("/vehicles", asyncHandler(listVehiclesCtrl));
router.post("/vehicles", asyncHandler(createVehicleCtrl));
router.put("/vehicles/:id", asyncHandler(updateVehicleCtrl));
router.delete("/vehicles/:id", asyncHandler(deleteVehicleCtrl));

module.exports = router;
