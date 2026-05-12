const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const authRoutes = require("./routes/authRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const recordRoutes = require("./routes/recordRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const companyAdminRoutes = require("./routes/companyAdminRoutes");
const exportRoutes = require("./routes/exportRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userProfileRoutes = require("./routes/userProfileRoutes");
const apontadorRoutes = require("./routes/apontadorRoutes");
const devRoutes = require("./routes/devRoutes");
const { authMiddleware, requireRole } = require("./middleware/authMiddleware");
const { errorMiddleware } = require("./middleware/errorMiddleware");
const path = require("path");
const { logInfo } = require("./services/loggerService");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const corsStrict = String(process.env.CORS_STRICT || "").toLowerCase() === "true";

if (isProduction) {
  app.set("trust proxy", 1);
}

const configuredCorsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const isPrivateHostname = (hostname) =>
  /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);

const isLoopbackHostname = (hostname) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";

const corsOriginValidator = (origin, callback) => {
  if (!origin) {
    callback(null, true);
    return;
  }

  if (configuredCorsOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  if (isProduction) {
    callback(new Error("Origin não permitida pelo CORS"));
    return;
  }

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname;
    const protocol = parsed.protocol;
    const isHttpProtocol = protocol === "http:" || protocol === "https:";

    if (isHttpProtocol && (isLoopbackHostname(hostname) || isPrivateHostname(hostname))) {
      callback(null, true);
      return;
    }
  } catch (error) {
    // ignore parse errors and reject below
  }

  callback(new Error("Origin não permitida pelo CORS"));
};

if (corsStrict && isProduction && configuredCorsOrigins.length === 0) {
  throw new Error("CORS_STRICT=true exige CORS_ORIGINS em produção.");
}

const sanitizeValue = (value) => {
  if (typeof value === "string") {
    return value.replace(/\0/g, "").trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeValue(item)])
    );
  }
  return value;
};

const sanitizeInputMiddleware = (req, res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) req.query = sanitizeValue(req.query);
  if (req.params) req.params = sanitizeValue(req.params);
  return next();
};

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Muitas requisições. Tente novamente em instantes." },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/me",
  message: { success: false, error: "Muitas tentativas de login. Aguarde e tente novamente." },
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(globalLimiter);
app.use(
  cors({
    origin: corsStrict ? corsOriginValidator : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(sanitizeInputMiddleware);
app.use(
  morgan("dev", {
    stream: {
      write: (message) => logInfo("http", { line: message.trim() }),
    },
  })
);
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.resolve(__dirname, "../uploads"))
);

app.get("/", (req, res) => {
  res.json({ success: true, message: "FrotaControl API online" });
});

app.get("/api/health", (req, res) =>
  res.json({ success: true, ok: true, message: "ok" })
);
app.use("/api/auth", authLimiter, authRoutes);
if (!isProduction) {
  app.use("/api/dev", devRoutes);
}
app.use(
  "/api/app",
  authMiddleware,
  requireRole("MOTORISTA"),
  recordRoutes
);
app.use(
  "/api/app/export",
  authMiddleware,
  requireRole("MOTORISTA"),
  exportRoutes
);
app.use(
  "/api/dashboard",
  authMiddleware,
  requireRole("ADMIN_EMPRESA", "SUPER_ADMIN"),
  dashboardRoutes
);
app.use(
  "/api/dashboard/export",
  authMiddleware,
  requireRole("ADMIN_EMPRESA", "SUPER_ADMIN"),
  exportRoutes
);
app.use(
  "/api/dashboard/vehicles",
  authMiddleware,
  requireRole("ADMIN_EMPRESA"),
  vehicleRoutes
);
app.use(
  "/api/dashboard/manage",
  authMiddleware,
  requireRole("ADMIN_EMPRESA"),
  companyAdminRoutes
);
app.use(
  "/api/apontador",
  authMiddleware,
  requireRole("APONTADOR"),
  apontadorRoutes
);
app.use(
  "/api/super-admin",
  authMiddleware,
  requireRole("SUPER_ADMIN"),
  adminRoutes
);
app.use("/api/users", authMiddleware, userProfileRoutes);

app.use((req, res) => {
  if (res.headersSent) return;
  res.status(404).json({
    success: false,
    error: "Rota não encontrada",
    message: "Rota não encontrada",
  });
});

app.use(errorMiddleware);

module.exports = { app };
