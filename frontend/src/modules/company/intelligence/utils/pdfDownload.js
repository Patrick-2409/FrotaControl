import api, { extractApiErrorMessage, getFriendlyApiErrorMessage } from "../../../../services/api";

export const PDF_DESATIVADO_MENSAGEM =
  "PDF indisponível no servidor. Verifique FRONTEND_URL e Puppeteer no backend.";

export const getFilenameFromDisposition = (contentDisposition, fallback = "inteligencia-operacional.pdf") => {
  const raw = String(contentDisposition || "");
  const utf8Match = raw.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).replace(/["']/g, "").trim() || fallback;
    } catch {
      return utf8Match[1].replace(/["']/g, "").trim() || fallback;
    }
  }
  const simpleMatch = raw.match(/filename\s*=\s*"?([^";]+)"?/i);
  return simpleMatch?.[1]?.trim() || fallback;
};

export const parseBlobErrorMessage = async (error, fallback) => {
  const maybeBlob = error?.response?.data;
  if (maybeBlob instanceof Blob) {
    try {
      const raw = await maybeBlob.text();
      const parsed = JSON.parse(raw);
      return parsed?.mensagem || parsed?.message || parsed?.error || fallback;
    } catch {
      return fallback;
    }
  }
  return getFriendlyApiErrorMessage(error) || extractApiErrorMessage(error) || fallback;
};

export const triggerPdfDownload = (url, filename) => {
  if (!url) return false;
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "inteligencia-operacional.pdf";
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch {
    return false;
  }
};

export const buildInteligenciaPdfPayload = (filters) => {
  const periodo = filters.periodo || "mes";
  const veiculoId = Number(filters.veiculoId);
  const motoristaId = Number(filters.motoristaId);
  const payload = {
    periodo,
    veiculo_id: Number.isFinite(veiculoId) && veiculoId > 0 ? veiculoId : null,
    motorista_id: Number.isFinite(motoristaId) && motoristaId > 0 ? motoristaId : null,
    tipo_analise: filters.tipoAnalise || "geral",
  };
  if (typeof window !== "undefined" && window.location?.origin) {
    payload.frontend_url = window.location.origin;
  }
  return payload;
};

const isPdfDisabledResponse = (data) =>
  data &&
  typeof data === "object" &&
  (data.ok === true || data.disabled === true) &&
  typeof (data.mensagem || data.message) === "string";

export const downloadInteligenciaPdf = async (
  filters,
  { fallbackName = "relatorio-inteligencia.pdf", timeoutMs = 180000 } = {}
) => {
  const payload = buildInteligenciaPdfPayload(filters);
  let pdfResponse;
  try {
    pdfResponse = await api.post("/inteligencia/pdf", payload, {
      responseType: "blob",
      timeout: timeoutMs,
      skipGlobalErrorToast: true,
    });
  } catch (error) {
    const message = await parseBlobErrorMessage(error, PDF_DESATIVADO_MENSAGEM);
    throw new Error(message);
  }

  const contentType = String(pdfResponse?.headers?.["content-type"] || "").toLowerCase();
  const data = pdfResponse?.data;

  if (contentType.includes("application/json") && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (isPdfDisabledResponse(parsed)) {
        return {
          disabled: true,
          mensagem: parsed.mensagem || parsed.message || PDF_DESATIVADO_MENSAGEM,
        };
      }
      throw new Error(parsed?.erro || parsed?.error || parsed?.message || "Resposta inválida ao exportar PDF.");
    } catch (err) {
      if (err instanceof Error && err.message !== "Resposta inválida ao exportar PDF.") throw err;
    }
  }

  if (contentType.includes("application/json") || isPdfDisabledResponse(data)) {
    if (isPdfDisabledResponse(data)) {
      return {
        disabled: true,
        mensagem: data.mensagem || data.message || PDF_DESATIVADO_MENSAGEM,
      };
    }
    throw new Error(data?.erro || data?.error || data?.message || "Resposta inválida ao exportar PDF.");
  }

  if (!(data instanceof Blob)) {
    throw new Error("Resposta inválida ao exportar PDF.");
  }

  if (data.size < 512) {
    throw new Error("O servidor retornou um PDF vazio ou inválido.");
  }

  const filename = getFilenameFromDisposition(pdfResponse?.headers?.["content-disposition"], fallbackName);
  const blobUrl = URL.createObjectURL(data);
  const downloaded = triggerPdfDownload(blobUrl, filename);
  if (!downloaded) {
    window.open(blobUrl, "_blank", "noopener,noreferrer");
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 300_000);
  return { disabled: false, filename, blobUrl, size: data.size };
};
