const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  profileImageUpload,
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  uploadProfileImage,
} = require("../controllers/userProfileController");

const router = express.Router();

router.get("/me", asyncHandler(getMyProfile));
router.put("/me", asyncHandler(updateMyProfile));
router.post("/change-password", asyncHandler(changeMyPassword));
router.post(
  "/upload-profile-image",
  profileImageUpload.single("profile_image"),
  asyncHandler(uploadProfileImage)
);

module.exports = router;
