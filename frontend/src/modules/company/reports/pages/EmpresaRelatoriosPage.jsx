import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../../services/auth";
import api from "../../../../services/api";
import EmptyState from "../../../../components/EmptyState";
import { InlineSpinner } from "../../../../components/LoadingState";
import {
  typeLabelMap,
  todayAsInput,
  formatExportPeriodoLinha,
  formatOperationalData,
} from "../../../../utils/managerRecordsOperational";
import { useOperationalExport } from "../../../../hooks/useOperationalExport";
import { useReportsHubPersistence } from "../useReportsHubPersistence";
import { inputClass } from "../../../../components/FormField";

const PREVIEW_RECORD_LIMIT = 100;
const DEBOUNCE_MS = 380;

const REPORT_TYPES = [
  { key: "romaneio", label: "Transporte" },
  { key: "combustivel", label: "Combustível" },
  { key: "parte_diaria", label: "Pessoas" },
];

const addDays = (ymd, delta) => {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

const currentMonth = () => {
  const today = todayAsInput();
  return today.slice(0, 7);
};

const applyPeriodPreset = (prev, preset) => {
  const today = todayAsInput();
  if (preset === "hoje") {
    return { ...prev, preset, periodo: "dia", data: today, mes: "", data_inicio: "", data_fim: "" };
  }
  if (preset === "ultimos_7_dias") {
    return {
      ...prev,
      preset,
      periodo: "intervalo",
      data: "",
      mes: "",
      data_inicio: addDays(today, -6),
      data_fim: today,
    };
  }
  if (preset === "mes_atual") {
    return { ...prev, preset, periodo: "mes", data: "", mes: currentMonth(), data_inicio: "", data_fim: "" };
  }
  return {
    ...prev,
    preset,
    periodo: "intervalo",
    data: "",
    mes: "",
    data_inicio: prev.data_inicio || addDays(today, -6),
    data_fim: prev.data_fim || today,
  };
};

const defaultFiltro = () => ({
  data: todayAsInput(),
  data_inicio: "",
  data_fim: "",
  mes: currentMonth(),
  motorista: "",
  veiculo: "",
  tipo: "",
  periodo: "dia",
  preset: "hoje",
});

export default function EmpresaRelatoriosPage() {
  const { user } = useAuth();
  const [filtro, setFiltro] = useState(defaultFiltro);
  const [queryFiltro, setQueryFiltro] = useState(defaultFiltro);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewTotal, setPreviewTotal] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewCacheRef = useRef(new Map());

  const { favorites, recent, exportHistory, pushRecent, toggleFavorite, logExport } = useReportsHubPersistence();
  const { exporting, download } = useOperationalExport(queryFiltro, queryFiltro.motorista, queryFiltro.veiculo);

  const tipoExportLabel = typeLabelMap[queryFiltro.tipo] || typeLabelMap[""];
  const periodoExportLabel = useMemo(
    () => formatExportPeriodoLinha(queryFiltro),
    [queryFiltro.data, queryFiltro.data_fim, queryFiltro.data_inicio, queryFiltro.mes, queryFiltro.periodo, queryFiltro.tipo]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setQueryFiltro((prev) => ({
        ...prev,
        ...filtro,
        motorista: String(filtro.motorista || "").trim(),
        veiculo: String(filtro.veiculo || "").trim(),
      }));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.motorista, filtro.veiculo, filtro.periodo, filtro.tipo, filtro.preset]);

  useEffect(() => {
    const queryKey = JSON.stringify({
      data: queryFiltro.data,
      data_inicio: queryFiltro.data_inicio,
      data_fim: queryFiltro.data_fim,
      mes: queryFiltro.mes,
      motorista: queryFiltro.motorista,
      veiculo: queryFiltro.veiculo,
      tipo: queryFiltro.tipo,
      periodo: queryFiltro.periodo,
    });
    const cached = previewCacheRef.current.get(queryKey);
    if (cached) {
      setPreviewRows(cached.items);
      setPreviewTotal(cached.total);
      setPreviewError("");
      return;
    }
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const params = { page: 1, limit: PREVIEW_RECORD_LIMIT };
        if (queryFiltro.periodo === "dia" && queryFiltro.data?.trim()) params.data = queryFiltro.data.trim();
        if (queryFiltro.periodo === "mes" && queryFiltro.mes?.trim()) params.mes = queryFiltro.mes.trim();
        if (queryFiltro.periodo === "intervalo") {
          if (queryFiltro.data_inicio?.trim()) params.data_inicio = queryFiltro.data_inicio.trim();
          if (queryFiltro.data_fim?.trim()) params.data_fim = queryFiltro.data_fim.trim();
        }
        if (queryFiltro.motorista?.trim()) params.motorista = queryFiltro.motorista.trim();
        if (queryFiltro.veiculo?.trim()) params.veiculo = queryFiltro.veiculo.trim();
        if (queryFiltro.tipo?.trim()) params.tipo = queryFiltro.tipo.trim();
        const { data } = await api.get("/dashboard/registros", { params });
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items.slice(0, PREVIEW_RECORD_LIMIT) : [];
        const total = typeof data?.total === "number" ? data.total : null;
        previewCacheRef.current.set(queryKey, { items, total });
        setPreviewRows(items);
        setPreviewTotal(total);
      } catch (err) {
        if (cancelled) return;
        setPreviewRows([]);
        setPreviewTotal(null);
        setPreviewError(err.response?.data?.message || "Não foi possível carregar os dados do relatório.");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryFiltro.data, queryFiltro.data_fim, queryFiltro.data_inicio, queryFiltro.mes, queryFiltro.motorista, queryFiltro.veiculo, queryFiltro.periodo, queryFiltro.tipo]);

  const hasDataToExport = !previewLoading && previewRows.length > 0;

  useEffect(() => {
    const onExport = (ev) => {
      const label = ev?.detail?.label;
      if (label) logExport(label);
    };
    window.addEventListener("fc:reports-export", onExport);
    return () => window.removeEventListener("fc:reports-export", onExport);
  }, [logExport]);

  const clearFilters = useCallback(() => {
    setFiltro(defaultFiltro());
  }, []);

  const quickActions = useMemo(
    () => [
      {
        id: "qa-tr-hoje",
        label: "Transporte hoje",
        run: () => {
          setFiltro((prev) => applyPeriodPreset({ ...prev, tipo: "romaneio" }, "hoje"));
          pushRecent({ id: "qa-tr-hoje", label: "Transporte hoje" });
        },
      },
      {
        id: "qa-tr-7d",
        label: "Transporte 7 dias",
        run: () => {
          setFiltro((prev) => applyPeriodPreset({ ...prev, tipo: "romaneio" }, "ultimos_7_dias"));
          pushRecent({ id: "qa-tr-7d", label: "Transporte 7 dias" });
        },
      },
      {
        id: "qa-cb-mes",
        label: "Combustível mês",
        run: () => {
          setFiltro((prev) => applyPeriodPreset({ ...prev, tipo: "combustivel" }, "mes_atual"));
          pushRecent({ id: "qa-cb-mes", label: "Combustível mês" });
        },
      },
    ],
    [pushRecent]
  );

  const summary = useMemo(() => {
    const motoristas = new Set(previewRows.map((r) => String(r.motorista || "").trim()).filter(Boolean));
    const veiculos = new Set(
      previewRows.map((r) => `${String(r.veiculo || "").trim()}|${String(r.placa || "").trim()}`).filter((v) => v !== "|")
    );
    return {
      total: previewTotal != null ? previewTotal : previewRows.length,
      motoristas: motoristas.size,
      veiculos: veiculos.size,
    };
  }, [previewRows, previewTotal]);

  return (
    <div className="fc-reports-hub space-y-6 print:bg-white print:text-black">
      <header className="fc-card border-zinc-800/90 p-5 print:border print:shadow-none">
        <p className="fc-erp-eyebrow text-zinc-400">Operação</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">Central de relatórios</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">Selecione o tipo, ajuste o período e exporte o relatório com 1 clique.</p>
          </div>
        </div>
        {user?.empresa_nome ? (
          <p className="mt-3 text-xs text-zinc-500">
            Empresa: <span className="font-medium text-zinc-300">{user.empresa_nome}</span>
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)]">
        <aside className="fc-reports-sidebar fc-card space-y-5 border-zinc-800/90 p-4 print:hidden">
          <div>
            <p className="fc-erp-eyebrow text-zinc-400">Atalhos rápidos</p>
            <div className="mt-2 space-y-2">
              {quickActions.map((shortcut) => {
                const isFav = favorites.some((f) => f.id === shortcut.id);
                return (
                  <div key={shortcut.id} className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2">
                    <button
                      type="button"
                      aria-label={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                      className={`rounded p-0.5 text-lg leading-none ${isFav ? "text-amber-300" : "text-zinc-600 hover:text-zinc-400"}`}
                      onClick={() => toggleFavorite({ id: shortcut.id, label: shortcut.label })}
                    >
                      ★
                    </button>
                    <button type="button" onClick={shortcut.run} className="flex-1 text-left text-xs font-medium text-zinc-200">
                      {shortcut.label}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="fc-erp-eyebrow text-zinc-400">Favoritos</p>
            {!favorites.length ? (
              <EmptyState compact title="Nenhum favorito" description="Use a estrela para salvar atalhos." />
            ) : (
              <ul className="mt-2 space-y-1">
                {favorites.map((f) => (
                  <li key={f.id}>
                    <span className="block rounded-md px-2 py-1.5 text-xs text-zinc-300">{f.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="fc-erp-eyebrow text-zinc-400">Recentes</p>
            {!recent.length ? (
              <p className="mt-2 text-xs text-zinc-500">Escolha um tipo na árvore para registar aqui.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {recent.map((r) => (
                  <li key={r.id + (r.at || "")} className="truncate text-xs text-zinc-400" title={r.label}>
                    {r.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="fc-erp-eyebrow text-zinc-400">Últimas exportações (este dispositivo)</p>
            {!exportHistory.length ? (
              <p className="mt-2 text-xs text-zinc-500">Ainda sem exportações registadas.</p>
            ) : (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
                {exportHistory.map((h, i) => (
                  <li key={`${h.at}-${i}`} className="text-[11px] text-zinc-500">
                    <span className="text-zinc-600">{new Date(h.at).toLocaleString("pt-BR")}</span> — {h.line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <section className="fc-card border-zinc-800/90 p-4 print:hidden">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Etapa 1 — Tipo de relatório</h2>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {REPORT_TYPES.map((reportType) => (
                <button
                  key={reportType.key}
                  type="button"
                  onClick={() => setFiltro((prev) => ({ ...prev, tipo: reportType.key }))}
                  className={`fc-btn rounded-lg border px-3 py-2 text-sm ${
                    filtro.tipo === reportType.key
                      ? "border-blue-500 bg-blue-500/20 text-blue-100"
                      : "border-zinc-700 bg-zinc-950/50 text-zinc-300"
                  }`}
                >
                  {reportType.label}
                </button>
              ))}
            </div>

            <h2 className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Etapa 2 — Período</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["hoje", "Hoje"],
                ["ultimos_7_dias", "Últimos 7 dias"],
                ["mes_atual", "Mês atual"],
                ["personalizado", "Personalizado"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro((prev) => applyPeriodPreset(prev, id))}
                  className={`fc-btn rounded-lg border px-3 py-2 text-xs ${
                    filtro.preset === id
                      ? "border-blue-500 bg-blue-500/20 text-blue-100"
                      : "border-zinc-700 bg-zinc-950/50 text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {filtro.preset === "personalizado" ? (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="date"
                  className={inputClass}
                  value={filtro.data_inicio}
                  onChange={(e) => setFiltro((prev) => ({ ...prev, data_inicio: e.target.value }))}
                />
                <input
                  type="date"
                  className={inputClass}
                  value={filtro.data_fim}
                  onChange={(e) => setFiltro((prev) => ({ ...prev, data_fim: e.target.value }))}
                />
              </div>
            ) : null}

            <h2 className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Filtros avançados (opcional)</h2>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                placeholder="Motorista"
                className={inputClass}
                value={filtro.motorista}
                onChange={(e) => setFiltro((prev) => ({ ...prev, motorista: e.target.value }))}
              />
              <input
                placeholder="Veículo ou placa"
                className={inputClass}
                value={filtro.veiculo}
                onChange={(e) => setFiltro((prev) => ({ ...prev, veiculo: e.target.value }))}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={clearFilters} className="fc-btn rounded-lg border border-zinc-600 px-3 py-2 text-xs text-zinc-200">
                Limpar filtros
              </button>
            </div>
          </section>

          <section className="fc-card border-zinc-800/90 p-3 print:border-0 print:shadow-none sm:p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200 print:hidden">Preview do relatório</h2>
            {previewError ? (
              <p className="rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">{previewError}</p>
            ) : previewLoading ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <InlineSpinner label="A carregar fichas…" />
              </div>
            ) : (
              <>
                {!previewRows.length ? (
                  <EmptyState compact title="Nenhum registro encontrado para esse período" />
                ) : (
                  <>
                    <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <article className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-zinc-500">Total de registros</p>
                        <p className="mt-1 text-lg font-semibold text-zinc-100">{summary.total}</p>
                      </article>
                      <article className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-zinc-500">Motoristas</p>
                        <p className="mt-1 text-lg font-semibold text-zinc-100">{summary.motoristas}</p>
                      </article>
                      <article className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-zinc-500">Veículos</p>
                        <p className="mt-1 text-lg font-semibold text-zinc-100">{summary.veiculos}</p>
                      </article>
                    </div>
                    {previewTotal != null && previewTotal > PREVIEW_RECORD_LIMIT ? (
                      <p className="mb-3 rounded-lg border border-amber-700/50 bg-amber-950/35 px-3 py-2 text-xs text-amber-100" role="status">
                        Mostrando {PREVIEW_RECORD_LIMIT} de {previewTotal} registros
                      </p>
                    ) : null}
                    <div className="overflow-x-auto rounded-lg border border-zinc-800/90">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-950/70 text-xs uppercase tracking-wide text-zinc-500">
                          <tr>
                            <th className="px-3 py-2">Data</th>
                            <th className="px-3 py-2">Tipo</th>
                            <th className="px-3 py-2">Motorista</th>
                            <th className="px-3 py-2">Veículo</th>
                            <th className="px-3 py-2">Placa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/80">
                          {previewRows.map((row) => (
                            <tr key={`${row.tipo}-${row.id ?? row.source_id}`}>
                              <td className="px-3 py-2 text-zinc-300">{formatOperationalData(row)}</td>
                              <td className="px-3 py-2 text-zinc-100">{typeLabelMap[row.tipo] || row.tipo}</td>
                              <td className="px-3 py-2 text-zinc-200">{row.motorista || "—"}</td>
                              <td className="px-3 py-2 text-zinc-200">{row.veiculo || "—"}</td>
                              <td className="px-3 py-2 text-zinc-400">{row.placa || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          <section className="fc-card border-zinc-800/90 p-4 print:hidden">
            <h2 className="text-sm font-semibold text-zinc-200">Exportação</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Tipo: <strong>{tipoExportLabel}</strong> • Período: <strong>{periodoExportLabel}</strong>
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={Boolean(exporting) || !hasDataToExport}
                onClick={() => download("pdf")}
                className="fc-btn rounded-lg border border-blue-500 px-3 py-2 text-sm text-blue-300 disabled:opacity-40"
              >
                Exportar PDF
              </button>
              <button
                type="button"
                disabled={Boolean(exporting) || !hasDataToExport}
                onClick={() => download("excel")}
                className="fc-btn rounded-lg border border-blue-500 px-3 py-2 text-sm text-blue-300 disabled:opacity-40"
              >
                Exportar Excel
              </button>
              {exporting ? <InlineSpinner label="Preparando o arquivo…" /> : null}
            </div>
            {!hasDataToExport ? (
              <p className="mt-2 text-xs text-zinc-500">Nenhum dado disponível para exportar com os filtros atuais.</p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
