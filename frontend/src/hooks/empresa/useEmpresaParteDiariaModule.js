import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import useDebouncedValue from "../useDebouncedValue";
import { emitToast } from "../../services/uiEvents";
import {
  countChecklistPendencias,
  fmtHoras,
  parseOperationalDate,
} from "../../pages/empresa/parteDiaria/parteDiariaFormatters";

const todayAsInput = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const PAGE_LIMIT = 20;

export function useEmpresaParteDiariaModule() {
  const [rows, setRows] = useState([]);
  const [filtro, setFiltro] = useState({
    data: todayAsInput(),
    data_inicio: "",
    data_fim: "",
    mes: "",
    motorista: "",
    periodo: "dia",
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const debouncedMotorista = useDebouncedValue(filtro.motorista);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: PAGE_LIMIT,
        tipo: "parte_diaria",
      };
      if (filtro.periodo === "dia" && filtro.data?.trim()) params.data = filtro.data.trim();
      if (filtro.periodo === "mes" && filtro.mes?.trim()) params.mes = filtro.mes.trim();
      if (filtro.periodo === "intervalo") {
        if (filtro.data_inicio?.trim()) params.data_inicio = filtro.data_inicio.trim();
        if (filtro.data_fim?.trim()) params.data_fim = filtro.data_fim.trim();
      }
      if (debouncedMotorista?.trim()) params.motorista = debouncedMotorista.trim();

      const { data } = await api.get("/dashboard/registros", { params });
      setRows(data.items || []);
      const tp = Math.max(1, data.totalPages || 1);
      setTotalPages(tp);
      setTotal(Number(data.total ?? 0));
      if (page > tp) setPage(tp);
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao carregar parte diária.", "error");
      setRows([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedMotorista, filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filtro.periodo, filtro.data, filtro.data_inicio, filtro.data_fim, filtro.mes]);

  const clearFilters = useCallback(() => {
    setPage(1);
    setFiltro({
      data: todayAsInput(),
      data_inicio: "",
      data_fim: "",
      mes: "",
      motorista: "",
      periodo: "dia",
    });
  }, []);

  const aggregates = useMemo(() => {
    const horasVals = [];
    let horimetroDeltaSum = 0;
    let horimetroDeltaCount = 0;
    let checklistRegistrosOk = 0;
    let checklistRegistrosPendencia = 0;
    let checklistRegistrosSemItens = 0;
    let totalPendenciasItens = 0;
    let comObservacaoOuParada = 0;
    let comClima = 0;
    let comProducao = 0;
    let maxUpdated = null;

    for (const r of rows) {
      const th = Number(r.total_horas);
      if (Number.isFinite(th) && th > 0) horasVals.push(th);

      const hi = Number(r.horimetro_inicio);
      const hf = Number(r.horimetro_fim);
      if (Number.isFinite(hi) && Number.isFinite(hf) && hf >= hi) {
        horimetroDeltaSum += hf - hi;
        horimetroDeltaCount += 1;
      }

      const { itens, pendencias, semItens } = countChecklistPendencias(r.checklist);
      if (semItens) checklistRegistrosSemItens += 1;
      else if (pendencias > 0) {
        checklistRegistrosPendencia += 1;
        totalPendenciasItens += pendencias;
      } else checklistRegistrosOk += 1;

      if (String(r.observacoes || "").trim() || String(r.tempo_parado || "").trim()) comObservacaoOuParada += 1;
      if (String(r.clima || "").trim()) comClima += 1;
      if (String(r.producao || "").trim()) comProducao += 1;

      const u = parseOperationalDate(r.updated_at);
      if (u && (!maxUpdated || u > maxUpdated)) maxUpdated = u;
    }

    const mediaHoras =
      horasVals.length > 0 ? horasVals.reduce((a, b) => a + b, 0) / horasVals.length : null;
    const maxHoras = horasVals.length ? Math.max(...horasVals) : null;
    const mediaDeltaHorimetro =
      horimetroDeltaCount > 0 ? horimetroDeltaSum / horimetroDeltaCount : null;

    const statusOperacional =
      rows.length === 0
        ? "sem_dados"
        : checklistRegistrosPendencia > 0
          ? "atencao_checklist"
          : comObservacaoOuParada > 0
            ? "ocorrencias_texto"
            : "regular";

    return {
      mediaHoras,
      maxHoras,
      mediaDeltaHorimetro,
      horimetroDeltaCount,
      checklistRegistrosOk,
      checklistRegistrosPendencia,
      checklistRegistrosSemItens,
      totalPendenciasItens,
      comObservacaoOuParada,
      comClima,
      comProducao,
      ultimaAtualizacao: maxUpdated,
      statusOperacional,
      fmtMediaHoras: mediaHoras == null ? "—" : fmtHoras(mediaHoras),
      fmtMaxHoras: maxHoras == null ? "—" : fmtHoras(maxHoras),
      fmtMediaDelta: mediaDeltaHorimetro == null ? "—" : fmtHoras(mediaDeltaHorimetro),
    };
  }, [rows]);

  const ocorrenciasPreview = useMemo(() => {
    const out = [];
    for (const r of rows) {
      const obs = String(r.observacoes || "").trim();
      const tp = String(r.tempo_parado || "").trim();
      if (!obs && !tp) continue;
      out.push({
        id: r.id,
        motorista: r.motorista || "—",
        data: r.data,
        observacoes: obs,
        tempo_parado: tp,
      });
      if (out.length >= 12) break;
    }
    return out;
  }, [rows]);

  return {
    filtro,
    setFiltro,
    clearFilters,
    page,
    setPage,
    totalPages,
    total,
    rows,
    loading,
    aggregates,
    ocorrenciasPreview,
    pageLimit: PAGE_LIMIT,
    refetch: load,
  };
}
