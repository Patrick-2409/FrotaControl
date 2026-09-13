import { useCallback, useEffect, useState } from "react";
import * as automationsApi from "../utils/automationsApi";
import { automationsErrorMessage } from "../utils/automationsApi";

export function useEmpresaAutomations() {
  const [catalog, setCatalog] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [catalogData, configsData] = await Promise.all([
        automationsApi.fetchCatalog(),
        automationsApi.fetchConfigs(),
      ]);
      setCatalog(catalogData);
      setConfigs(configsData);
    } catch (err) {
      setError(automationsErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const withBusy = useCallback(async (fn) => {
    setActionBusy(true);
    try {
      return await fn();
    } finally {
      setActionBusy(false);
    }
  }, []);

  const createConfig = useCallback((payload) => withBusy(() => automationsApi.createConfig(payload)), [withBusy]);
  const updateConfig = useCallback((id, payload) => withBusy(() => automationsApi.updateConfig(id, payload)), [withBusy]);
  const toggleStatus = useCallback(
    (id, ativo) => withBusy(() => automationsApi.updateConfigStatus(id, ativo)),
    [withBusy]
  );
  const removeConfig = useCallback((id) => withBusy(() => automationsApi.deleteConfig(id)), [withBusy]);
  const fetchConfigDetail = useCallback((id) => automationsApi.fetchConfig(id), []);

  const addApprover = useCallback(
    (configId, payload) => withBusy(() => automationsApi.createApprover(configId, payload)),
    [withBusy]
  );
  const editApprover = useCallback(
    (configId, approverId, payload) => withBusy(() => automationsApi.updateApprover(configId, approverId, payload)),
    [withBusy]
  );
  const removeApprover = useCallback(
    (configId, approverId) => withBusy(() => automationsApi.deleteApprover(configId, approverId)),
    [withBusy]
  );

  const addRecipient = useCallback(
    (configId, payload) => withBusy(() => automationsApi.createRecipient(configId, payload)),
    [withBusy]
  );
  const editRecipient = useCallback(
    (configId, recipientId, payload) => withBusy(() => automationsApi.updateRecipient(configId, recipientId, payload)),
    [withBusy]
  );
  const removeRecipient = useCallback(
    (configId, recipientId) => withBusy(() => automationsApi.deleteRecipient(configId, recipientId)),
    [withBusy]
  );

  return {
    catalog,
    configs,
    loading,
    error,
    actionBusy,
    reload: load,
    createConfig,
    updateConfig,
    toggleStatus,
    removeConfig,
    fetchConfigDetail,
    addApprover,
    editApprover,
    removeApprover,
    addRecipient,
    editRecipient,
    removeRecipient,
  };
}
