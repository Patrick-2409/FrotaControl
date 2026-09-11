/**
 * HTTP handler do webhook Telegram (Bloco 3).
 *
 * Esta rota é PÚBLICA por natureza (o Telegram não tem JWT do FrotaMax) —
 * ver app.js para a montagem antes de authMiddleware/globalLimiter/
 * express.json()/sanitizeInputMiddleware. `req.body` chega aqui como Buffer
 * bruto (express.raw), nunca pré-parseado, para que `parseTelegramJson`
 * controle a precisão dos inteiros grandes.
 */

const { logWarn, logError } = require("../../../services/loggerService");
const { isValidWebhookSecret } = require("./telegramSecret");
const { parseTelegramJson } = require("./telegramUpdateParser");
const { processTelegramUpdate } = require("./telegramWebhookService");

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

const handleWebhook = async (req, res) => {
  const providedSecret = req.headers[SECRET_HEADER];
  if (!isValidWebhookSecret(providedSecret, process.env.TELEGRAM_WEBHOOK_SECRET)) {
    // Nunca revela o secret esperado nem se um valor foi enviado — apenas rejeita.
    logWarn("telegram_webhook_invalid_secret", { hasHeader: Boolean(providedSecret) });
    return res.status(401).json({ success: false, error: "Não autorizado." });
  }

  let update;
  try {
    update = parseTelegramJson(req.body);
  } catch (err) {
    // Corpo ilegível nunca é um erro de infraestrutura — responder 200 evita
    // que o Telegram reenvie eternamente um payload que nunca vai ficar válido.
    logWarn("telegram_webhook_invalid_json", { message: err.message });
    return res.status(200).json({ success: true, handled: false });
  }

  try {
    const result = await processTelegramUpdate(update);
    return res.status(200).json({ success: true, handled: result.handled });
  } catch (err) {
    // Falha real (ex.: banco indisponível) — status que autoriza o Telegram a
    // tentar novamente mais tarde; nunca mascarado como 200.
    logError("telegram_webhook_processing_failed", { message: err.message, code: err.code });
    return res.status(503).json({ success: false, error: "Falha temporária ao processar." });
  }
};

module.exports = { handleWebhook };
