import api, { extractApiErrorMessage, getFriendlyApiErrorMessage } from "../../../../services/api";

export const AUTOMATIONS_LOAD_ERROR = "Erro ao carregar automações";

export function automationsErrorMessage(err, fallback = AUTOMATIONS_LOAD_ERROR) {
  const friendly = getFriendlyApiErrorMessage(err);
  if (!err?.response) return fallback;
  return friendly || extractApiErrorMessage(err) || fallback;
}

export const fetchCatalog = () => api.get("/automations/catalog").then((r) => r.data.data);

export const fetchConfigs = () => api.get("/automations/configs").then((r) => r.data.data);

export const fetchConfig = (id) => api.get(`/automations/configs/${id}`).then((r) => r.data.data);

export const createConfig = (payload) => api.post("/automations/configs", payload).then((r) => r.data.data);

export const updateConfig = (id, payload) => api.put(`/automations/configs/${id}`, payload).then((r) => r.data.data);

export const updateConfigStatus = (id, ativo) =>
  api.patch(`/automations/configs/${id}/status`, { ativo }).then((r) => r.data.data);

export const deleteConfig = (id) => api.delete(`/automations/configs/${id}`);

export const createApprover = (configId, payload) =>
  api.post(`/automations/configs/${configId}/approvers`, payload).then((r) => r.data.data);

export const updateApprover = (configId, approverId, payload) =>
  api.patch(`/automations/configs/${configId}/approvers/${approverId}`, payload).then((r) => r.data.data);

export const deleteApprover = (configId, approverId) =>
  api.delete(`/automations/configs/${configId}/approvers/${approverId}`);

export const createRecipient = (configId, payload) =>
  api.post(`/automations/configs/${configId}/recipients`, payload).then((r) => r.data.data);

export const updateRecipient = (configId, recipientId, payload) =>
  api.patch(`/automations/configs/${configId}/recipients/${recipientId}`, payload).then((r) => r.data.data);

export const deleteRecipient = (configId, recipientId) =>
  api.delete(`/automations/configs/${configId}/recipients/${recipientId}`);
