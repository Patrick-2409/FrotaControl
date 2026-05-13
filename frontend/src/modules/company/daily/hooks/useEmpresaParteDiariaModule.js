import { useCallback, useEffect, useMemo, useState } from "react";
import api, { extractApiErrorMessage } from "../../../../services/api";
import useDebouncedValue from "../../../../hooks/useDebouncedValue";
import { readSessionJson, writeSessionJson } from "../../shared/sessionFilters";
import {
  countChecklistPendencias,
  fmtHoras,
  parseOperationalDate,
} from "../services/parteDiariaFormatters";

const todayAsInput = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const PAGE_LIMIT = 20;
const SNAPSHOT_LIMIT = 100;
const SESSION_KEY = "filters:daily";

/**
 * @param {{ enabled?: boolean }} [options]
 */
export function useEmpresaParteDiariaModule(options = {}) {
  const { enabled = true } = options;
  const saved = useMemo(() => readSessionJson(SESSION_KEY, null), []);

  const [rows, setRows] = useState([]);
  const [filtro, setFiltro] = useState(() => ({
    data: saved?.data ?? todayAsInput(),
    data_inicio: saved?.data_inicio ?? "",
    data_fim: saved?.data_fim ?? "",
    mes: saved?.mes ?? "",
    motorista: saved?.motorista ?? "",
    periodo: saved?.periodo ?? "dia",
  }));
  const [equipamentoBusca, setEquipamentoBusca] = useState(() => saved?.equipamentoBusca ?? "");
  const [statusLocal, setStatusLocal] = useState(() => saved?.statusLocal ?? "todos");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [snapshotRows, setSnapshotRows] = useState([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const debouncedMotorista = useDebouncedValue(filtro.motorista, 400);
  const debouncedEquipamento = useDebouncedValue(equipamentoBusca, 350);

  useEffect(() => {
    writeSessionJson(SESSION_KEY, {
      ...filtro,
      equipamentoBusca,
      statusLocal,
    });
  }, [filtro, equipamentoBusca, statusLocal]);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setLoadError(null);
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
      setLoadError(extractApiErrorMessage(err) || "Falha ao carregar parte diária.");
      setRows([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [enabled, debouncedMotorista, filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo, page]);

  const loadSnapshot = useCallback(async () => {
    if (!enabled) return;
    setSnapshotLoading(true);
    try {
      const params = {
        page: 1,
        limit: SNAPSHOT_LIMIT,
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
      setSnapshotRows(data.items || []);
    } catch {
      setSnapshotRows([]);
    } finally {
      setSnapshotLoading(false);
    }
  }, [enabled, debouncedMotorista, filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    setPage(1);
  }, [filtro.periodo, filtro.data, filtro.data_inicio, filtro.data_fim, filtro.mes]);

  const displayRows = useMemo(() => {
    const q = debouncedEquipamento.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter((r) => {
        const eq = String(r.equipamento || "").toLowerCase();
        const loc = String(r.local || "").toLowerCase();
        return eq.includes(q) || loc.includes(q);
      });
    }
    if (statusLocal === "todos") return list;
    return list.filter((r) => {
      const { pendencias, semItens } = countChecklistPendencias(r.checklist);
      const hasOcorr = Boolean(String(r.observacoes || "").trim() || String(r.tempo_parado || "").trim());
      if (statusLocal === "checklist") return !semItens && pendencias > 0;
      if (statusLocal === "ocorrencias") return hasOcorr;
      if (statusLocal === "regular") {
        return !hasOcorr && pendencias === 0;
      }
      return true;
    });
  }, [rows, debouncedEquipamento, statusLocal]);

  const clearFilters = useCallback(() => {
    setPage(1);
    setEquipamentoBusca("");
    setStatusLocal("todos");
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
    const source = displayRows;
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

    for (const r of source) {
      const th = Number(r.total_horas);
      if (Number.isFinite(th) && th > 0) horasVals.push(th);

      const hi = Number(r.horimetro_inicio);
      const hf = Number(r.horimetro_fim);
      if (Number.isFinite(hi) && Number.isFinite(hf) && hf >= hi) {
        horimetroDeltaSum += hf - hi;
        horimetroDeltaCount += 1;
      }

      const { pendencias, semItens } = countChecklistPendencias(r.checklist);
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
      source.length === 0
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
  }, [displayRows]);

  const ocorrenciasPreview = useMemo(() => {
    const out = [];
    for (const r of displayRows) {
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
  }, [displayRows]);

  const snapshotInsights = useMemo(() => {
    const source = snapshotRows;
    let sumHoras = 0;
    let countHoras = 0;
    const byDay = new Map();
    const byMot = new Map();
    const byMotCount = new Map();
    for (const r of source) {
      const th = Number(r.total_horas);
      if (Number.isFinite(th) && th > 0) {
        sumHoras += th;
        countHoras += 1;
      }
      const dayKey = String(r.data || "").slice(0, 10);
      if (dayKey) byDay.set(dayKey, (byDay.get(dayKey) || 0) + 1);
      const m = String(r.motorista || "—").trim() || "—";
      const addH = Number.isFinite(th) && th > 0 ? th : 0;
      byMot.set(m, (byMot.get(m) || 0) + addH);
      byMotCount.set(m, (byMotCount.get(m) || 0) + 1);
    }
    const daySeries = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, count]) => ({ dia, count }));
    const rankingHours = [...byMot.entries()]
      .filter(([, horas]) => horas > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([motorista, horas]) => ({ motorista, horas, registros: byMotCount.get(motorista) || 0 }));
    const rankingByReg = [...byMotCount.entries()]
      .filter(([mot, cnt]) => (byMot.get(mot) || 0) === 0 && cnt > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([motorista, registros]) => ({ motorista, horas: 0, registros }));
    const ranking = [...rankingHours, ...rankingByReg].slice(0, 12);
    const mediaHorasSnapshot = countHoras > 0 ? sumHoras / countHoras : null;
    return { daySeries, ranking, mediaHorasSnapshot, amostra: source.length };
  }, [snapshotRows]);

  const clearLoadError = useCallback(() => setLoadError(null), []);

  const refetch = useCallback(async () => {
    await load();
    await loadSnapshot();
  }, [load, loadSnapshot]);

  return useMemo(
    () => ({
      filtro,
      setFiltro,
      equipamentoBusca,
      setEquipamentoBusca,
      statusLocal,
      setStatusLocal,
      clearFilters,
      page,
      setPage,
      totalPages,
      total,
      rows,
      displayRows,
      loading,
      loadError,
      clearLoadError,
      aggregates,
      ocorrenciasPreview,
      pageLimit: PAGE_LIMIT,
      refetch,
      snapshotRows,
      snapshotLoading,
      snapshotInsights,
    }),
    [
      filtro,
      equipamentoBusca,
      statusLocal,
      clearFilters,
      page,
      totalPages,
      total,
      rows,
      displayRows,
      loading,
      loadError,
      clearLoadError,
      aggregates,
      ocorrenciasPreview,
      refetch,
      snapshotRows,
      snapshotLoading,
      snapshotInsights,
    ]
  );
}
