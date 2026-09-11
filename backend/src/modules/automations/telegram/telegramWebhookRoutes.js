const express = require("express");
const rateLimit = require("express-rate-limit");
const { asyncHandler } = require("../../../utils/asyncHandler");
const { handleWebhook } = require("./telegramWebhookController");

const router = express.Router();

/**
 * Limiter próprio, mais generoso que o globalLimiter (100 req/min) da API —
 * um álbum de fotos gera várias mensagens/updates em sequência rápida, e o
 * webhook fica isolado do globalLimiter por montagem em app.js (ver
 * comentário lá). Este limiter é a segunda camada de proteção (defesa em
 * profundidade), não a única — nunca compartilha contador com o resto da API.
 */
const telegramWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Muitas requisições." },
});

router.post("/", telegramWebhookLimiter, asyncHandler(handleWebhook));

module.exports = router;
