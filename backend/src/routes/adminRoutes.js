const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { asyncHandler } = require("../utils/asyncHandler");
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
const uploadDir = path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".png");
    cb(null, `logo-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
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
  if (req.file) req.body.logo_url = `/uploads/${req.file.filename}`;
  return createCompanyCtrl(req, res);
}));
router.put("/companies/:id", upload.single("logo"), asyncHandler(async (req, res) => {
  if (req.file) req.body.logo_url = `/uploads/${req.file.filename}`;
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
