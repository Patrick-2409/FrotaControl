import { useCallback, useState } from "react";
import api from "../services/api";
import { emitToast } from "../services/uiEvents";
import { formatDateForFilename } from "../utils/managerRecordsOperational";

const notifyReportsHubExport = (label) => {
  try {
    window.dispatchEvent(new CustomEvent("fc:reports-export", { detail: { label: String(label || "").slice(0, 120) } }));
  } catch {
    /* noop */
  }
};

async function messageFromExportError(err, fallback) {
  let msg = err.response?.data?.message || fallback;
  if (err?.response?.data instanceof Blob) {
    try {
      const raw = await err.response.data.text();
      const parsed = JSON.parse(raw);
      msg = parsed?.message || parsed?.error || msg;
    } catch {
      /* noop */
    }
  }
  return msg;
}

/**
 * Exportação em lote (Excel/PDF/CSV) com os mesmos parâmetros que `/dashboard/registros`.
 */
export function useOperationalExport(filtro, debouncedMotorista) {
  const [exporting, setExporting] = useState("");

  const buildExportQueryParams = useCallback(() => {
    const params = {
      motorista: debouncedMotorista?.trim() || undefined,
      modelo: "porto",
    };
    if (filtro.periodo === "dia") params.data = filtro.data?.trim() || undefined;
    if (filtro.periodo === "mes") params.mes = filtro.mes?.trim() || undefined;
    if (filtro.periodo === "intervalo") {
      params.data_inicio = filtro.data_inicio?.trim() || undefined;
      params.data_fim = filtro.data_fim?.trim() || undefined;
    }
    return params;
  }, [debouncedMotorista, filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo]);

  const download = useCallback(
    async (tipo) => {
      setExporting(tipo);
      try {
        const params = {
          ...buildExportQueryParams(),
          tipo: filtro.tipo?.trim() || undefined,
        };
        const { data } = await api.get(`/dashboard/export/${tipo}`, {
          responseType: "blob",
          params,
        });
        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        const activityTag = (filtro.tipo || "todas-atividades").replaceAll("_", "-");
        const suffix =
          filtro.periodo === "dia"
            ? formatDateForFilename(filtro.data || "")
            : filtro.periodo === "mes"
              ? formatDateForFilename(`${filtro.mes || ""}-01`)
              : `${formatDateForFilename(filtro.data_inicio || "")}_${formatDateForFilename(filtro.data_fim || "")}`;
        a.download =
          tipo === "excel" ? `relatorio_${activityTag}_${suffix}.xlsx` : `relatorio_${activityTag}_${suffix}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        emitToast(`Arquivo ${tipo.toUpperCase()} exportado.`);
        notifyReportsHubExport(`Fichas ${tipo.toUpperCase()} — ${activityTag}`);
      } catch (err) {
        const msg = await messageFromExportError(err, `Falha ao gerar ${tipo.toUpperCase()}.`);
        emitToast(msg, "error");
      } finally {
        setExporting("");
      }
    },
    [buildExportQueryParams, filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo, filtro.tipo]
  );

  const downloadCsv = useCallback(async () => {
    setExporting("csv");
    try {
      const params = {
        ...buildExportQueryParams(),
        tipo: filtro.tipo?.trim() || undefined,
      };
      const { data } = await api.get("/dashboard/export/csv", {
        responseType: "blob",
        params,
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      const activityTag = (filtro.tipo || "todas-atividades").replaceAll("_", "-");
      const suffix =
        filtro.periodo === "dia"
          ? formatDateForFilename(filtro.data || "")
          : filtro.periodo === "mes"
            ? formatDateForFilename(`${filtro.mes || ""}-01`)
            : `${formatDateForFilename(filtro.data_inicio || "")}_${formatDateForFilename(filtro.data_fim || "")}`;
      a.download = `relatorio_${activityTag}_${suffix}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      emitToast("Arquivo CSV exportado.");
      notifyReportsHubExport(`Fichas CSV — ${activityTag}`);
    } catch (err) {
      const msg = await messageFromExportError(err, "Falha ao gerar CSV.");
      emitToast(msg, "error");
    } finally {
      setExporting("");
    }
  }, [buildExportQueryParams, filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo, filtro.tipo]);

  return { exporting, download, downloadCsv, buildExportQueryParams };
}
