const fs = require("fs/promises");
const path = require("path");
const { v2: cloudinary } = require("cloudinary");

const isCloudinaryConfigured = () =>
  Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const extensionFromMime = (mime = "") => {
  const value = String(mime).toLowerCase();
  if (value.includes("png")) return ".png";
  if (value.includes("jpeg") || value.includes("jpg")) return ".jpg";
  if (value.includes("webp")) return ".webp";
  if (value.includes("svg")) return ".svg";
  return ".png";
};

const localFallbackUpload = async ({ buffer, mimeType, category, ownerId }) => {
  const extension = extensionFromMime(mimeType);
  const uploadRoot = path.resolve(__dirname, "../../uploads");
  const subdir = category === "profile" ? "profile" : "";
  const destination = subdir ? path.join(uploadRoot, subdir) : uploadRoot;
  await fs.mkdir(destination, { recursive: true });
  const filename = `${category}-${ownerId || "entity"}-${Date.now()}${extension}`;
  const filepath = path.join(destination, filename);
  await fs.writeFile(filepath, buffer);
  return subdir ? `/uploads/${subdir}/${filename}` : `/uploads/${filename}`;
};

const uploadToCloudinary = ({ buffer, category, ownerId }) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `frotacontrol/${category}`,
        public_id: `${category}-${ownerId || "entity"}-${Date.now()}`,
        resource_type: "image",
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result?.secure_url || result?.url || null);
      }
    );
    stream.end(buffer);
  });

const savePersistentImage = async ({ buffer, mimeType, category, ownerId }) => {
  if (!buffer) {
    const err = new Error("Arquivo de imagem inválido.");
    err.status = 400;
    throw err;
  }

  if (isCloudinaryConfigured()) {
    const uploadedUrl = await uploadToCloudinary({ buffer, category, ownerId });
    if (!uploadedUrl) {
      const err = new Error("Falha ao salvar imagem no Cloudinary.");
      err.status = 500;
      throw err;
    }
    return uploadedUrl;
  }

  if (process.env.NODE_ENV === "production") {
    const err = new Error("Upload indisponível: configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET.");
    err.status = 500;
    throw err;
  }

  return localFallbackUpload({ buffer, mimeType, category, ownerId });
};

module.exports = {
  savePersistentImage,
  isCloudinaryConfigured,
};
