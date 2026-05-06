export const emitToast = (message, type = "success") => {
  window.dispatchEvent(new CustomEvent("fc:toast", { detail: { message, type } }));
};

export const emitWarningToast = (message) => {
  emitToast(message, "warning");
};
