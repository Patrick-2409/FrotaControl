"use strict";

/**
 * Cliente Drive v3 injetável — só expõe MÉTODOS DE DOMÍNIO (findFolder,
 * createFolder, ensureFolder, uploadFile, findFileBySourceMetadata,
 * getFileMetadata), nunca vaza detalhe de query/HTTP para quem chama.
 *
 * Implementado sobre REST + `fetch` nativo (não o pacote `googleapis`
 * completo) — só usamos meia dúzia de endpoints de `files.*`, e escrever essa
 * fatia à mão evita uma dependência gigante só para JWT/OAuth (que já vem do
 * `google-auth-library`, injetado como `authProvider`). 100% testável sem
 * rede: todo teste injeta `fetchImpl` e `authProvider` fake.
 *
 * IMPORTANTE — retries e não-idempotência: `createFolder` e `uploadFile` são
 * escritas; um timeout client-side não prova que a escrita falhou do lado do
 * Google (pode ter sido só a resposta que se perdeu). Re-tentar automaticamente
 * uma escrita ambígua arrisca duplicar pasta/arquivo. Por isso elas NUNCA usam
 * `withInternalRetry` — uma falha aqui sobe, é classificada (normalmente
 * TEMPORARY se foi rede/timeout) e cabe à camada de cima (photoStorageService,
 * via nova tentativa/claim) resolver com segurança, sempre reconciliando por
 * `findFileBySourceMetadata`/`findFolder` ANTES de tentar escrever de novo —
 * nunca reescrevendo às cegas. Leituras (`findFolder`, `findFileBySourceMetadata`,
 * `getFileMetadata`, a listagem interna) são idempotentes e podem re-tentar.
 */

const { StorageError } = require("./errorClassification");
const { withInternalRetry } = require("./internalRetry");
const { getGoogleDriveTimeoutMs } = require("./automationStorageConfig");

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function createGoogleDriveClient({
  authProvider,
  fetchImpl = fetch,
  sharedDriveId = null,
  timeoutMs = getGoogleDriveTimeoutMs(),
  retries = 2,
} = {}) {
  if (!authProvider || typeof authProvider.getAuthHeaders !== "function") {
    throw new StorageError("googleDriveClient requer um authProvider injetado com getAuthHeaders().", {
      code: "CONFIGURACAO_INCOMPLETA",
      storageErrorClass: "DEFINITIVE",
    });
  }

  const driveScopeParams = sharedDriveId
    ? { supportsAllDrives: "true", includeItemsFromAllDrives: "true", corpora: "drive", driveId: sharedDriveId }
    : { supportsAllDrives: "true", includeItemsFromAllDrives: "true" };

  async function request(path, { method = "GET", query = {}, body, headersExtra = {}, base = DRIVE_API_BASE } = {}) {
    const authHeaders = await authProvider.getAuthHeaders();
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url.toString(), { method, headers: { ...authHeaders, ...headersExtra }, body, signal: controller.signal });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new StorageError("Timeout ao comunicar com o Google Drive.", {
          code: "GOOGLE_DRIVE_TIMEOUT",
          storageErrorClass: "TEMPORARY",
          cause: err,
        });
      }
      throw new StorageError(`Falha de rede ao comunicar com o Google Drive: ${err.message}`, {
        code: "GOOGLE_DRIVE_NETWORK_ERROR",
        storageErrorClass: "TEMPORARY",
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function parseJsonOrThrow(response, action) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      /* corpo vazio/ilegível — body permanece null, erro usa só o status */
    }
    if (!response.ok) {
      const message = body?.error?.message || `HTTP ${response.status}`;
      const err = new StorageError(`Google Drive ${action} falhou: ${message}`, {
        code: response.status === 401 || response.status === 403 ? "PERMISSAO_NEGADA" : undefined,
      });
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function listChildrenByName({ parentId, name, mimeType }) {
    return withInternalRetry(
      async () => {
        const qParts = [`'${escapeDriveQueryValue(parentId)}' in parents`, `name = '${escapeDriveQueryValue(name)}'`, "trashed = false"];
        if (mimeType) qParts.push(`mimeType = '${escapeDriveQueryValue(mimeType)}'`);
        const response = await request("/files", {
          query: { q: qParts.join(" and "), fields: "files(id,name,appProperties)", ...driveScopeParams },
        });
        const body = await parseJsonOrThrow(response, "files.list");
        return body?.files || [];
      },
      { retries }
    );
  }

  async function findFolder({ parentId, name }) {
    const files = await listChildrenByName({ parentId, name, mimeType: FOLDER_MIME_TYPE });
    return files[0] || null;
  }

  /** Escrita — sem retry automático (ver nota do topo do arquivo). */
  async function createFolder({ parentId, name, appProperties }) {
    const response = await request("/files", {
      method: "POST",
      query: { fields: "id,name,appProperties", ...driveScopeParams },
      headersExtra: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE, parents: [parentId], appProperties: appProperties || undefined }),
    });
    return parseJsonOrThrow(response, "files.create (pasta)");
  }

  /**
   * Busca por nome; cria só se não achar. Não é atômico por si só — quem
   * chama (folderProvisioningService) é responsável por serializar chamadas
   * concorrentes para o MESMO (parentId, name) com advisory lock.
   */
  async function ensureFolder({ parentId, name, appProperties }) {
    const existing = await findFolder({ parentId, name });
    if (existing) return { ...existing, wasCreated: false };
    const created = await createFolder({ parentId, name, appProperties });
    return { ...created, wasCreated: true };
  }

  /** Busca um arquivo (não-pasta) por appProperties — base da reconciliação de upload idempotente. */
  async function findFileBySourceMetadata({ parentId, appProperties }) {
    return withInternalRetry(
      async () => {
        const qParts = [`'${escapeDriveQueryValue(parentId)}' in parents`, "trashed = false"];
        for (const [key, value] of Object.entries(appProperties || {})) {
          qParts.push(`appProperties has { key='${escapeDriveQueryValue(key)}' and value='${escapeDriveQueryValue(value)}' }`);
        }
        const response = await request("/files", {
          query: { q: qParts.join(" and "), fields: "files(id,name,appProperties,size,mimeType)", ...driveScopeParams },
        });
        const body = await parseJsonOrThrow(response, "files.list (reconciliação)");
        return (body?.files || [])[0] || null;
      },
      { retries }
    );
  }

  async function getFileMetadata({ fileId }) {
    return withInternalRetry(
      async () => {
        const response = await request(`/files/${encodeURIComponent(fileId)}`, {
          query: { fields: "id,name,appProperties,size,mimeType,parents", ...driveScopeParams },
        });
        return parseJsonOrThrow(response, "files.get");
      },
      { retries }
    );
  }

  /**
   * Upload multipart simples (metadata + mídia numa única requisição) —
   * suficiente para fotos de até dezenas de MB; nunca resumable (não há
   * necessidade para o volume esperado). Escrita — sem retry automático.
   */
  async function uploadFile({ parentId, name, mimeType, buffer, appProperties }) {
    const boundary = `frotamax-automations-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const metadata = JSON.stringify({ name, parents: [parentId], appProperties: appProperties || undefined });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`, "utf8"),
      Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, "utf8"),
      buffer,
      Buffer.from(`\r\n--${boundary}--`, "utf8"),
    ]);
    const response = await request("/files", {
      base: DRIVE_UPLOAD_BASE,
      method: "POST",
      query: { uploadType: "multipart", fields: "id,name,appProperties,size,mimeType", ...driveScopeParams },
      headersExtra: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    return parseJsonOrThrow(response, "files.create (upload)");
  }

  return { findFolder, createFolder, ensureFolder, uploadFile, findFileBySourceMetadata, getFileMetadata };
}

module.exports = { createGoogleDriveClient, FOLDER_MIME_TYPE };
