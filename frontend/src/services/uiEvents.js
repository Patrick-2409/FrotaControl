/**
 * @param {string} message
 * @param {"success"|"error"|"warning"} [type]
 * @param {object} [extras] — ex.: `{ durationMs: 5000, actionLabel: "Desfazer", onAction: () => void }`
 */
export const emitToast = (message, type = "success", extras) => {
  const more = extras && typeof extras === "object" ? extras : {};
  window.dispatchEvent(new CustomEvent("fc:toast", { detail: { message, type, ...more } }));
};

export const emitWarningToast = (message) => {
  emitToast(message, "warning");
};
