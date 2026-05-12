import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import useDebouncedValue from "../hooks/useDebouncedValue";
import PaginationControls from "../components/PaginationControls";
import SkeletonRows from "../components/SkeletonRows";
import { emitToast } from "../services/uiEvents";
import { InlineSpinner } from "../components/LoadingState";
import { inputClass } from "../components/FormField";
import EmptyState from "../components/EmptyState";

const todayAsInput = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const formatMonthLabel = (yearMonthKey) => {
  const [year, month] = String(yearMonthKey || "").split("-");
  if (!year || !month) return "Mês não informado";
  const parsed = new Date(`${year}-${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Mês não informado";
  return parsed.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};
const typeLabelMap = {
  "": "Todas as atividades",
  romaneio: "Romaneio",
  combustivel: "Combustível",
  parte_diaria: "Parte diária",
};
const OPERATION_TIMEZONE = "America/Sao_Paulo";
const parseOperationalDate = (rawValue) => {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;
  // Formatos sem timezone devem ser interpretados como horário operacional local.
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
  const candidate = hasTimezone ? normalized : `${normalized}-03:00`;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const toDatePartsInTz = (value) => {
  const parsed = parseOperationalDate(value);
  if (!parsed) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) return null;
  return `${y}-${m}-${d}`;
};
const formatDayLabel = (dayKey) => {
  if (!dayKey || dayKey === "sem-data") return "Data não informada";
  const instant = parseOperationalDate(`${dayKey}T12:00:00`);
  if (!instant) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATION_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(instant);
};
/** Instantâneo do informativo (geração no app ou última alteração no servidor), para pastas / downloads — não confundir com `data` operacional do lançamento. */
const getFolderAnchorRaw = (row) => row?.recorded_at_client || row?.updated_at || row?.data;
const formatDateForFilename = (isoDate) => {
  const raw = String(isoDate || "").trim();
  if (!raw) return "sem-data";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split("-");
    return `${dd}-${mm}-${yyyy}`;
  }
  return raw.replace(/[/:]/g, "-");
};
const normalizeTypeTag = (value) => String(value || "atividade").replaceAll("_", "-");
const normalizeSearchText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const formatOperationalData = (row) => {
  const raw = row?.data;
  if (!raw) return "-";
  const parsed = parseOperationalDate(raw);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATION_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
};
const formatRecordedAt = (row) => {
  const raw = row?.recorded_at_client || row?.updated_at;
  if (!raw) return "-";
  const parsed = parseOperationalDate(raw);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATION_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
};

const RELATORIOS_PORTO = [
  { id: "romaneio", title: "Romaneio", subtitle: "Transporte — ficha Porto" },
  { id: "producao", title: "Produção", subtitle: "Parte diária — ficha Porto" },
  { id: "combustivel", title: "Combustível", subtitle: "Abastecimento — ficha Porto" },
  { id: "completo", title: "Completo", subtitle: "Romaneio, combustível e parte diária" },
];

export default function ManagerRecordsPage() {
  const [rows, setRows] = useState([]);
  const [filtro, setFiltro] = useState({
    data: todayAsInput(),
    data_inicio: "",
    data_fim: "",
    mes: "",
    motorista: "",
    tipo: "",
    periodo: "dia",
  });
  const [openDays, setOpenDays] = useState({});
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [localTreeSearch, setLocalTreeSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const debouncedMotorista = useDebouncedValue(filtro.motorista);
  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        filtro.tipo ||
          debouncedMotorista?.trim() ||
          (filtro.periodo === "dia" && filtro.data) ||
          (filtro.periodo === "mes" && filtro.mes) ||
          (filtro.periodo === "intervalo" && (filtro.data_inicio || filtro.data_fim))
      ),
    [debouncedMotorista, filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo, filtro.tipo]
  );
  const activePeriodLabel = useMemo(() => {
    if (filtro.periodo === "dia") return filtro.data ? `Dia: ${filtro.data}` : "Dia não definido";
    if (filtro.periodo === "mes") return filtro.mes ? `Mês: ${filtro.mes}` : "Mês não definido";
    if (filtro.periodo === "intervalo") {
      if (filtro.data_inicio && filtro.data_fim) return `Período: ${filtro.data_inicio} até ${filtro.data_fim}`;
      if (filtro.data_inicio) return `Início: ${filtro.data_inicio}`;
      if (filtro.data_fim) return `Fim: ${filtro.data_fim}`;
      return "Período não definido";
    }
    return "Período não definido";
  }, [filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo]);
  const clearFilters = () => {
    setPage(1);
    setFiltro({
      data: todayAsInput(),
      data_inicio: "",
      data_fim: "",
      mes: "",
      motorista: "",
      tipo: "",
      periodo: "dia",
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 15,
      };
      if (filtro.periodo === "dia" && filtro.data?.trim()) params.data = filtro.data.trim();
      if (filtro.periodo === "mes" && filtro.mes?.trim()) params.mes = filtro.mes.trim();
      if (filtro.periodo === "intervalo") {
        if (filtro.data_inicio?.trim()) params.data_inicio = filtro.data_inicio.trim();
        if (filtro.data_fim?.trim()) params.data_fim = filtro.data_fim.trim();
      }
      if (debouncedMotorista?.trim()) params.motorista = debouncedMotorista.trim();
      if (filtro.tipo?.trim()) params.tipo = filtro.tipo.trim();

      const { data } = await api.get("/dashboard/registros", {
        params,
      });
      setRows(data.items || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao carregar registros.", "error");
    } finally {
      setLoading(false);
    }
  }, [debouncedMotorista, filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo, filtro.tipo, page]);

  useEffect(() => {
    load();
  }, [load]);

  const buildExportQueryParams = useCallback(() => {
    const params = {
      motorista: debouncedMotorista?.trim() || undefined,
    };
    if (filtro.periodo === "dia") params.data = filtro.data?.trim() || undefined;
    if (filtro.periodo === "mes") params.mes = filtro.mes?.trim() || undefined;
    if (filtro.periodo === "intervalo") {
      params.data_inicio = filtro.data_inicio?.trim() || undefined;
      params.data_fim = filtro.data_fim?.trim() || undefined;
    }
    return params;
  }, [debouncedMotorista, filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo]);

  const download = async (tipo) => {
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
        tipo === "excel"
          ? `relatorio_${activityTag}_${suffix}.xlsx`
          : `relatorio_${activityTag}_${suffix}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      emitToast(`Arquivo ${tipo.toUpperCase()} exportado.`);
    } catch (err) {
      let errorMessage = err.response?.data?.message || `Falha ao gerar ${tipo.toUpperCase()}.`;
      if (err?.response?.data instanceof Blob) {
        try {
          const raw = await err.response.data.text();
          const parsed = JSON.parse(raw);
          errorMessage = parsed?.message || parsed?.error || errorMessage;
        } catch {
          // fallback padrao
        }
      }
      emitToast(errorMessage, "error");
    } finally {
      setExporting("");
    }
  };

  const downloadRelatorioPorto = async (preset, format) => {
    const key = `rel-${preset}-${format}`;
    setExporting(key);
    try {
      const params = { ...buildExportQueryParams(), format };
      const { data } = await api.get(`/dashboard/relatorios/${preset}`, {
        responseType: "blob",
        params,
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      const suffix =
        filtro.periodo === "dia"
          ? formatDateForFilename(filtro.data || "")
          : filtro.periodo === "mes"
          ? formatDateForFilename(`${filtro.mes || ""}-01`)
          : `${formatDateForFilename(filtro.data_inicio || "")}_${formatDateForFilename(filtro.data_fim || "")}`;
      a.download =
        format === "excel"
          ? `relatorio-porto_${preset}_${suffix}.xlsx`
          : `relatorio-porto_${preset}_${suffix}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      emitToast(`${preset === "completo" ? "Relatório completo" : "Relatório"} exportado (${format.toUpperCase()}).`);
    } catch (err) {
      let errorMessage = err.response?.data?.message || `Falha ao gerar relatório ${preset}.`;
      if (err?.response?.data instanceof Blob) {
        try {
          const raw = await err.response.data.text();
          const parsed = JSON.parse(raw);
          errorMessage = parsed?.message || parsed?.error || errorMessage;
        } catch {
          // fallback
        }
      }
      emitToast(errorMessage, "error");
    } finally {
      setExporting("");
    }
  };

  const downloadSingle = async (format, row) => {
    const exportingKey = `${format}:${row?.source_id || row?.id}`;
    setExporting(exportingKey);
    try {
      const params = {
        tipo: row?.tipo,
        source_id: row?.source_id,
      };
      const { data } = await api.get(`/dashboard/export/${format}`, {
        responseType: "blob",
        params,
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      const anchorRaw = getFolderAnchorRaw(row);
      const fileDay = anchorRaw ? toDatePartsInTz(anchorRaw) : null;
      const fileDate = formatDateForFilename(fileDay || String(anchorRaw || "").trim().slice(0, 10));
      const activityTag = normalizeTypeTag(row?.tipo);
      a.download =
        format === "excel"
          ? `relatorio_${activityTag}_${fileDate}.xlsx`
          : `relatorio_${activityTag}_${fileDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      emitToast(`Relatório ${format.toUpperCase()} individual exportado.`);
    } catch (err) {
      let errorMessage = err.response?.data?.message || `Falha ao gerar ${format.toUpperCase()} individual.`;
      if (err?.response?.data instanceof Blob) {
        try {
          const raw = await err.response.data.text();
          const parsed = JSON.parse(raw);
          errorMessage = parsed?.message || parsed?.error || errorMessage;
        } catch {
          // fallback padrao
        }
      }
      emitToast(errorMessage, "error");
    } finally {
      setExporting("");
    }
  };

  const rowsView = useMemo(() => rows, [rows]);
  const groupedRows = useMemo(
    () => ({
      romaneio: rowsView.filter((r) => r.tipo === "romaneio"),
      combustivel: rowsView.filter((r) => r.tipo === "combustivel"),
      parte_diaria: rowsView.filter((r) => r.tipo === "parte_diaria"),
    }),
    [rowsView]
  );
  const groupedByTypeYearMonthDay = useMemo(() => {
    const build = (items = [], type) => {
      const yearMap = new Map();
      for (const row of items) {
        const dateRef = getFolderAnchorRaw(row);
        const dayKey = dateRef ? toDatePartsInTz(dateRef) : null;
        const resolvedDayKey = dayKey || "sem-data";
        const [yearPart, monthPart] = resolvedDayKey === "sem-data"
          ? ["sem-data", "sem-data"]
          : resolvedDayKey.split("-");
        const monthKey = resolvedDayKey === "sem-data" ? "sem-data" : `${yearPart}-${monthPart}`;
        const yearKey = resolvedDayKey === "sem-data" ? "sem-data" : yearPart;

        if (!yearMap.has(yearKey)) yearMap.set(yearKey, new Map());
        const monthMap = yearMap.get(yearKey);
        if (!monthMap.has(monthKey)) monthMap.set(monthKey, new Map());
        const dayMap = monthMap.get(monthKey);
        if (!dayMap.has(resolvedDayKey)) dayMap.set(resolvedDayKey, []);
        dayMap.get(resolvedDayKey).push(row);
      }
      const sortedYears = Array.from(yearMap.entries()).sort((a, b) => {
        if (a[0] === "sem-data") return 1;
        if (b[0] === "sem-data") return -1;
        return b[0].localeCompare(a[0]);
      });
      return sortedYears.map(([yearKey, monthMap]) => {
        const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => {
          if (a[0] === "sem-data") return 1;
          if (b[0] === "sem-data") return -1;
          return b[0].localeCompare(a[0]);
        });
        const months = sortedMonths.map(([monthKey, dayMap]) => {
          const sortedDays = Array.from(dayMap.entries()).sort((a, b) => {
            if (a[0] === "sem-data") return 1;
            if (b[0] === "sem-data") return -1;
            return b[0].localeCompare(a[0]);
          });
          const days = sortedDays.map(([dayKey, itemsByDay]) => ({
            dayKey,
            folderKey: `${type}:year:${yearKey}:month:${monthKey}:day:${dayKey}`,
            dayLabel: formatDayLabel(dayKey),
            items: itemsByDay,
          }));
          const monthCount = days.reduce((acc, day) => acc + day.items.length, 0);
          return {
            monthKey,
            folderKey: `${type}:year:${yearKey}:month:${monthKey}`,
            monthLabel: monthKey === "sem-data" ? "Mês não informado" : formatMonthLabel(monthKey),
            count: monthCount,
            days,
          };
        });
        const yearCount = months.reduce((acc, month) => acc + month.count, 0);
        return {
          yearKey,
          folderKey: `${type}:year:${yearKey}`,
          yearLabel: yearKey === "sem-data" ? "Ano não informado" : `Ano ${yearKey}`,
          count: yearCount,
          months,
        };
      });
    };
    return {
      romaneio: build(groupedRows.romaneio, "romaneio"),
      combustivel: build(groupedRows.combustivel, "combustivel"),
      parte_diaria: build(groupedRows.parte_diaria, "parte_diaria"),
    };
  }, [groupedRows]);

  useEffect(() => {
    setOpenDays((prev) => {
      const next = { ...prev };
      for (const section of Object.values(groupedByTypeYearMonthDay)) {
        for (const yearGroup of section) {
          if (typeof next[yearGroup.folderKey] !== "boolean") next[yearGroup.folderKey] = false;
          for (const monthGroup of yearGroup.months) {
            if (typeof next[monthGroup.folderKey] !== "boolean") next[monthGroup.folderKey] = false;
            for (const dayGroup of monthGroup.days) {
              if (typeof next[dayGroup.folderKey] !== "boolean") next[dayGroup.folderKey] = false;
            }
          }
        }
      }
      return next;
    });
  }, [groupedByTypeYearMonthDay]);

  const getBadgeClass = (tipo) => {
    if (tipo === "romaneio") return "bg-blue-500/20 text-blue-200 border-blue-400/40";
    if (tipo === "combustivel") return "bg-emerald-500/20 text-emerald-200 border-emerald-400/40";
    return "bg-amber-500/20 text-amber-100 border-amber-300/40";
  };

  const openEdit = (row) => {
    setEditing({
      id: row.id,
      tipo: row.tipo,
      data: row.data?.slice(0, 16) || "",
      destino: row.destino || "",
      litros: row.litros || "",
      tipo_combustivel: row.tipo_combustivel || "",
      total_horas: row.total_horas || "",
      observacoes: "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const payload =
        editing.tipo === "romaneio"
          ? { data: editing.data, destino: editing.destino }
          : editing.tipo === "combustivel"
          ? {
              data: editing.data,
              litros: Number(editing.litros),
              tipo_combustivel: editing.tipo_combustivel,
            }
          : {
              data: editing.data,
              total_horas: Number(editing.total_horas),
              observacoes: editing.observacoes,
            };
      await api.put(`/dashboard/registros/${editing.tipo}/${editing.id}`, payload);
      emitToast("Registro atualizado com sucesso.");
      setEditing(null);
      await load();
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao atualizar registro.", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/dashboard/registros/${deleting.tipo}/${deleting.id}`);
      emitToast("Registro excluído com sucesso.");
      setDeleting(null);
      await load();
    } catch (err) {
      emitToast(err.response?.data?.message || "Falha ao excluir registro.", "error");
    }
  };

  const renderSection = (title, type, fieldsRenderer) => {
    const items = groupedRows[type];
    const yearGroups = groupedByTypeYearMonthDay[type] || [];
    const searchTerm = normalizeSearchText(localTreeSearch).trim();
    const rowMatchesSearch = (row) => {
      if (!searchTerm) return true;
      const haystack = normalizeSearchText(
        [
          row?.motorista,
          row?.veiculo,
          row?.placa,
          row?.destino,
          row?.observacao,
          row?.tipo_transporte,
          row?.tipo_combustivel,
          row?.equipamento,
          row?.marca_modelo,
          row?.local,
          row?.contratado,
          row?.operador,
        ]
          .filter(Boolean)
          .join(" ")
      );
      return haystack.includes(searchTerm);
    };
    const filteredYearGroups = yearGroups
      .map((yearGroup) => {
        const months = yearGroup.months
          .map((monthGroup) => {
            const days = monthGroup.days
              .map((dayGroup) => ({
                ...dayGroup,
                items: dayGroup.items.filter(rowMatchesSearch),
              }))
              .filter((dayGroup) => dayGroup.items.length > 0);
            if (!days.length) return null;
            return {
              ...monthGroup,
              days,
              count: days.reduce((acc, day) => acc + day.items.length, 0),
            };
          })
          .filter(Boolean);
        if (!months.length) return null;
        return {
          ...yearGroup,
          months,
          count: months.reduce((acc, month) => acc + month.count, 0),
        };
      })
      .filter(Boolean);
    const sectionVisibleCount = filteredYearGroups.reduce((acc, year) => acc + year.count, 0);
    const sectionFolderKeys = filteredYearGroups.flatMap((yearGroup) => [
      yearGroup.folderKey,
      ...yearGroup.months.flatMap((monthGroup) => [
        monthGroup.folderKey,
        ...monthGroup.days.map((dayGroup) => dayGroup.folderKey),
      ]),
    ]);
    const visibleYears = filteredYearGroups.map((yearGroup) => yearGroup.yearLabel);
    const visibleMonths = Array.from(
      new Set(
        filteredYearGroups.flatMap((yearGroup) =>
          yearGroup.months.map((monthGroup) => monthGroup.monthLabel)
        )
      )
    );
    return (
      <section className="fc-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getBadgeClass(type)}`}>
            {sectionVisibleCount} registro(s)
          </span>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setOpenDays((prev) => {
                const next = { ...prev };
                for (const key of sectionFolderKeys) next[key] = true;
                return next;
              })
            }
            className="fc-btn rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
          >
            Expandir tudo
          </button>
          <button
            type="button"
            onClick={() =>
              setOpenDays((prev) => {
                const next = { ...prev };
                for (const key of sectionFolderKeys) next[key] = false;
                return next;
              })
            }
            className="fc-btn rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
          >
            Recolher tudo
          </button>
          {visibleYears.slice(0, 3).map((yearLabel) => (
            <span
              key={`${type}-year-chip-${yearLabel}`}
              className="rounded-full border border-blue-400/35 bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-100"
            >
              {yearLabel}
            </span>
          ))}
          {visibleMonths.slice(0, 4).map((monthLabel) => (
            <span
              key={`${type}-month-chip-${monthLabel}`}
              className="rounded-full border border-violet-400/35 bg-violet-500/10 px-2 py-1 text-[11px] font-semibold text-violet-100 capitalize"
            >
              {monthLabel}
            </span>
          ))}
        </div>
        {!items.length && (
          <p className="text-sm text-slate-400">Sem registros deste tipo para os filtros atuais.</p>
        )}
        {!!items.length && !filteredYearGroups.length && (
          <p className="text-sm text-slate-400">Nenhum registro deste tipo corresponde à busca local.</p>
        )}
        <div className="fc-activity-scroll space-y-3 pr-1">
          {filteredYearGroups.map((yearGroup) => (
            <section key={yearGroup.folderKey} className="rounded-xl border border-slate-800/90 bg-slate-950/40 p-2">
              <button
                type="button"
                onClick={() => setOpenDays((prev) => ({ ...prev, [yearGroup.folderKey]: !prev[yearGroup.folderKey] }))}
                className="flex w-full items-center justify-between rounded-lg border border-slate-700/90 bg-slate-900/80 px-3 py-2 text-left"
              >
                <span className="text-sm font-semibold text-slate-100">🗂️ {yearGroup.yearLabel}</span>
                <span className="text-xs text-slate-300">
                  {yearGroup.count} registro(s) • {openDays[yearGroup.folderKey] ? "Ocultar" : "Abrir"}
                </span>
              </button>
              {openDays[yearGroup.folderKey] && (
                <div className="mt-2 space-y-2 border-l-2 border-slate-800 pl-3">
                  {yearGroup.months.map((monthGroup) => (
                    <section key={monthGroup.folderKey} className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-2">
                      <button
                        type="button"
                        onClick={() => setOpenDays((prev) => ({ ...prev, [monthGroup.folderKey]: !prev[monthGroup.folderKey] }))}
                        className="flex w-full items-center justify-between rounded-md border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-left"
                      >
                        <span className="text-xs font-semibold capitalize text-slate-100">📂 {monthGroup.monthLabel}</span>
                        <span className="text-[11px] text-slate-300">
                          {monthGroup.count} registro(s) • {openDays[monthGroup.folderKey] ? "Ocultar" : "Abrir"}
                        </span>
                      </button>
                      {openDays[monthGroup.folderKey] && (
                        <div className="mt-2 space-y-2 border-l-2 border-slate-800 pl-3">
                          {monthGroup.days.map((dayGroup) => (
                            <section key={dayGroup.folderKey} className="rounded-md border border-slate-800/70 bg-slate-950/55 p-2">
                              <button
                                type="button"
                                onClick={() => setOpenDays((prev) => ({ ...prev, [dayGroup.folderKey]: !prev[dayGroup.folderKey] }))}
                                className="flex w-full items-center justify-between rounded-md border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-left"
                              >
                                <span className="text-xs font-semibold capitalize text-slate-100">📁 {dayGroup.dayLabel}</span>
                                <span className="text-[11px] text-slate-300">
                                  {dayGroup.items.length} registro(s) • {openDays[dayGroup.folderKey] ? "Ocultar" : "Abrir"}
                                </span>
                              </button>
                              {openDays[dayGroup.folderKey] && (
                                <div className="mt-2 space-y-2 border-l-2 border-slate-800 pl-3">
                                  {dayGroup.items.map((row) => (
                                    <article key={`${type}-${row.id}`} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <p className="text-sm font-medium text-slate-100">{row.motorista}</p>
                                          <p className="text-xs text-slate-400">{formatRecordedAt(row)}</p>
                                        </div>
                                        <div className="flex gap-2">
                                          <button type="button" onClick={() => openEdit(row)} className="fc-btn rounded-lg border border-blue-500 px-3 py-1 text-xs text-blue-200">
                                            Editar
                                          </button>
                                          <button type="button" onClick={() => setDeleting({ tipo: row.tipo, id: row.id })} className="fc-btn rounded-lg border border-red-500 px-3 py-1 text-xs text-red-200">
                                            Excluir
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => downloadSingle("pdf", row)}
                                            className="fc-btn rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-200"
                                          >
                                            {exporting === `pdf:${row?.source_id || row?.id}` ? "PDF..." : "PDF"}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => downloadSingle("excel", row)}
                                            className="fc-btn rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-200"
                                          >
                                            {exporting === `excel:${row?.source_id || row?.id}` ? "Excel..." : "Excel"}
                                          </button>
                                        </div>
                                      </div>
                                      {fieldsRenderer(row)}
                                    </article>
                                  ))}
                                </div>
                              )}
                            </section>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <div className="fc-card mb-3 space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            ["dia", "Por dia"],
            ["mes", "Por mês"],
            ["intervalo", "Por período"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setPage(1);
                setFiltro((prev) => ({ ...prev, periodo: value }));
              }}
              className={`fc-btn rounded-lg border px-3 py-2 text-xs ${
                filtro.periodo === value
                  ? "border-blue-500 bg-blue-500/20 text-blue-100"
                  : "border-slate-700 text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          {filtro.periodo === "dia" && (
            <input
              type="date"
              placeholder="Data"
              className={inputClass}
              value={filtro.data}
              onChange={(e) => {
                setPage(1);
                setFiltro((prev) => ({ ...prev, data: e.target.value }));
              }}
            />
          )}
          {filtro.periodo === "mes" && (
            <input
              type="month"
              placeholder="Mês"
              className={inputClass}
              value={filtro.mes}
              onChange={(e) => {
                setPage(1);
                setFiltro((prev) => ({ ...prev, mes: e.target.value }));
              }}
            />
          )}
          {filtro.periodo === "intervalo" && (
            <>
              <input
                type="date"
                placeholder="Data inicial"
                className={inputClass}
                value={filtro.data_inicio}
                onChange={(e) => {
                  setPage(1);
                  setFiltro((prev) => ({ ...prev, data_inicio: e.target.value }));
                }}
              />
              <input
                type="date"
                placeholder="Data final"
                className={inputClass}
                value={filtro.data_fim}
                onChange={(e) => {
                  setPage(1);
                  setFiltro((prev) => ({ ...prev, data_fim: e.target.value }));
                }}
              />
            </>
          )}
          <input placeholder="Motorista" className={inputClass} value={filtro.motorista} onChange={(e) => { setPage(1); setFiltro((prev) => ({ ...prev, motorista: e.target.value })); }} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:col-span-2">
          {[["", "Todos"], ["romaneio", "Romaneio"], ["combustivel", "Combustível"], ["parte_diaria", "Parte diária"]].map(([tipo, label]) => (
            <button
              key={`tipo-${tipo || "todos"}`}
              type="button"
              onClick={() => { setPage(1); setFiltro((f) => ({ ...f, tipo })); }}
              className={`fc-btn rounded-lg border px-3 py-2 text-xs ${filtro.tipo === tipo ? "border-blue-500 bg-blue-500/20 text-blue-100" : "border-slate-700 text-slate-300"}`}
            >
              {label}
            </button>
          ))}
          </div>
          <button onClick={load} className="fc-btn rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold">Filtrar</button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <input
            placeholder="Busca local na árvore (motorista, placa, destino...)"
            className={inputClass}
            value={localTreeSearch}
            onChange={(e) => setLocalTreeSearch(e.target.value)}
          />
          {localTreeSearch.trim() && (
            <button
              type="button"
              onClick={() => setLocalTreeSearch("")}
              className="fc-btn rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200"
            >
              Limpar busca local
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <article className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
            <p className="text-[11px] uppercase tracking-wide text-blue-200/90">Período ativo</p>
            <p className="mt-1 text-sm font-semibold text-blue-100">{activePeriodLabel}</p>
          </article>
          <article className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <p className="text-[11px] uppercase tracking-wide text-emerald-200/90">Atividade ativa</p>
            <p className="mt-1 text-sm font-semibold text-emerald-100">
              {typeLabelMap[filtro.tipo] || "Todas as atividades"}
            </p>
          </article>
          <article className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
            <p className="text-[11px] uppercase tracking-wide text-violet-200/90">Motorista ativo</p>
            <p className="mt-1 text-sm font-semibold text-violet-100">
              {debouncedMotorista?.trim() || "Todos os motoristas"}
            </p>
          </article>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={clearFilters}
            className="fc-btn rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200"
            disabled={!hasActiveFilters}
          >
            Limpar filtros
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-600/50 bg-slate-900/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Relatórios — modelo Porto</p>
        <p className="mt-1 text-sm text-slate-300">
          Excel e PDF com o mesmo layout das fichas e planilhas manuais (cabeçalho com período e logo da empresa).
          Usa os filtros de período e motorista acima.
        </p>
        <ul className="mt-4 space-y-3">
          {RELATORIOS_PORTO.map((rel) => (
            <li
              key={rel.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-700/80 bg-slate-950/50 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-white">{rel.title}</p>
                <p className="text-xs text-slate-400">{rel.subtitle}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(exporting)}
                  onClick={() => downloadRelatorioPorto(rel.id, "excel")}
                  className="fc-btn rounded-lg border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50"
                >
                  {exporting === `rel-${rel.id}-excel` ? "Gerando…" : "Exportar Excel"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(exporting)}
                  onClick={() => downloadRelatorioPorto(rel.id, "pdf")}
                  className="fc-btn rounded-lg border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-900/50 disabled:opacity-50"
                >
                  {exporting === `rel-${rel.id}-pdf` ? "Gerando…" : "Exportar PDF"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          disabled={Boolean(exporting)}
          onClick={() => download("excel")}
          className="fc-btn rounded-lg border border-blue-500 px-3 py-2 text-sm text-blue-300 disabled:opacity-50"
        >
          {exporting === "excel" ? "Gerando..." : "Exportar Excel"}
        </button>
        <button
          type="button"
          disabled={Boolean(exporting)}
          onClick={() => download("pdf")}
          className="fc-btn rounded-lg border border-blue-500 px-3 py-2 text-sm text-blue-300 disabled:opacity-50"
        >
          {exporting === "pdf" ? "Gerando..." : "Exportar PDF"}
        </button>
        {exporting && <InlineSpinner label="Preparando arquivo..." />}
      </div>

      {loading && <SkeletonRows rows={6} />}
      {!loading && rowsView.length === 0 && (
        <EmptyState
          title="Nenhum registro encontrado para os filtros selecionados."
          description="Ajuste os filtros para ampliar a busca."
        />
      )}

      {!loading && rowsView.length > 0 && (
        <>
          {renderSection("ROMANEIO", "romaneio", (row) => (
            <div className="mt-2 grid gap-1 text-sm text-slate-300">
              <p><strong>Data da operação:</strong> {formatOperationalData(row)}</p>
              <p><strong>Registrado em:</strong> {formatRecordedAt(row)}</p>
              <p><strong>Tipo transporte:</strong> {row.tipo_transporte || "-"}</p>
              <p><strong>Destino:</strong> {row.destino || "-"}</p>
              <p><strong>Observação:</strong> {row.observacao || "-"}</p>
              <p><strong>Veículo:</strong> {row.veiculo || "-"} ({row.placa || "-"})</p>
            </div>
          ))}
          {renderSection("COMBUSTÍVEL", "combustivel", (row) => (
            <div className="mt-2 grid gap-1 text-sm text-slate-300">
              <p><strong>Data da operação:</strong> {formatOperationalData(row)}</p>
              <p><strong>Registrado em:</strong> {formatRecordedAt(row)}</p>
              <p><strong>Litros:</strong> {row.litros || 0}</p>
              <p><strong>Tipo combustível:</strong> {row.tipo_combustivel || "-"}</p>
              <p><strong>Horímetro:</strong> {row.horimetro ?? "-"}</p>
              <p><strong>Hodômetro:</strong> {row.hodometro ?? "-"}</p>
            </div>
          ))}
          {renderSection("PARTE DIÁRIA", "parte_diaria", (row) => (
            <div className="mt-2 grid gap-1 text-sm text-slate-300">
              <p><strong>Data da operação:</strong> {formatOperationalData(row)}</p>
              <p><strong>Registrado em:</strong> {formatRecordedAt(row)}</p>
              <p><strong>Contratado:</strong> {row.contratado || "-"}</p>
              <p><strong>Operador:</strong> {row.operador || "-"}</p>
              <p><strong>Equipamento:</strong> {row.equipamento || "-"}</p>
              <p><strong>Marca/modelo:</strong> {row.marca_modelo || "-"}</p>
              <p><strong>Local:</strong> {row.local || "-"}</p>
              <p><strong>Período:</strong> {row.periodo || "-"} | <strong>Clima:</strong> {row.clima || "-"}</p>
              <p><strong>Expediente:</strong> {row.expediente || "-"}</p>
              <p><strong>Horímetro início/fim:</strong> {row.horimetro_inicio ?? "-"} / {row.horimetro_fim ?? "-"}</p>
              <p><strong>Hodômetro início/fim:</strong> {row.hodometro_inicio ?? "-"} / {row.hodometro_fim ?? "-"}</p>
              <p><strong>Total KM:</strong> {row.total_km ?? "-"}</p>
              <p><strong>Horas:</strong> {row.total_horas || 0}</p>
              <p><strong>Checklist:</strong> {row.checklist_resumo || "-"}</p>
              <p><strong>Outros (checklist):</strong> {row.outros_descricao || "-"}</p>
              <p><strong>Tempo parado:</strong> {row.tempo_parado || "-"}</p>
              <p><strong>Observações:</strong> {row.observacoes || "-"}</p>
              <p><strong>Produção:</strong> {row.producao || "-"}</p>
            </div>
          ))}
        </>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />

      {editing && (
        <div className="fixed inset-0 z-50 grid place-content-center bg-slate-950/70 p-4">
          <div className="fc-card w-full max-w-md p-5">
            <h3 className="text-lg font-semibold text-white">Editar registro</h3>
            <p className="mb-3 text-sm text-slate-400">Tipo: {editing.tipo}</p>
            <div className="space-y-2">
              <input
                type="datetime-local"
                className={inputClass}
                value={editing.data}
                onChange={(e) => setEditing((v) => ({ ...v, data: e.target.value }))}
              />
              {editing.tipo === "romaneio" && (
                <input className={inputClass} placeholder="Destino" value={editing.destino} onChange={(e) => setEditing((v) => ({ ...v, destino: e.target.value }))} />
              )}
              {editing.tipo === "combustivel" && (
                <>
                  <input className={inputClass} placeholder="Litros" value={editing.litros} onChange={(e) => setEditing((v) => ({ ...v, litros: e.target.value }))} />
                  <input className={inputClass} placeholder="Tipo combustível" value={editing.tipo_combustivel} onChange={(e) => setEditing((v) => ({ ...v, tipo_combustivel: e.target.value }))} />
                </>
              )}
              {editing.tipo === "parte_diaria" && (
                <>
                  <input className={inputClass} placeholder="Total de horas" value={editing.total_horas} onChange={(e) => setEditing((v) => ({ ...v, total_horas: e.target.value }))} />
                  <input className={inputClass} placeholder="Observações" value={editing.observacoes} onChange={(e) => setEditing((v) => ({ ...v, observacoes: e.target.value }))} />
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="fc-btn rounded-lg border border-slate-600 px-3 py-2 text-sm" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="button" className="fc-btn rounded-lg bg-blue-600 px-3 py-2 text-sm" onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 grid place-content-center bg-slate-950/70 p-4">
          <div className="fc-card w-full max-w-md p-5">
            <h3 className="text-lg font-semibold text-white">Confirmar exclusão</h3>
            <p className="mt-2 text-sm text-slate-300">Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="fc-btn rounded-lg border border-slate-600 px-3 py-2 text-sm" onClick={() => setDeleting(null)}>Cancelar</button>
              <button type="button" className="fc-btn rounded-lg border border-red-500 px-3 py-2 text-sm text-red-200" onClick={confirmDelete}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
