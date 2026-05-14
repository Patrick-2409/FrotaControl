import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../../services/auth";
import api from "../../../../services/api";
import ManagerRecordsFiltersCard from "../../../../components/reports/ManagerRecordsFiltersCard";
import EmptyState from "../../../../components/EmptyState";
import { InlineSpinner } from "../../../../components/LoadingState";
import {
  typeLabelMap,
  todayAsInput,
  temPeriodoExplicitoNoFiltro,
  formatExportPeriodoLinha,
} from "../../../../utils/managerRecordsOperational";
import useDebouncedValue from "../../../../hooks/useDebouncedValue";
import { useOperationalExport } from "../../../../hooks/useOperationalExport";
import { REPORT_HUB_CATEGORIES } from "../reportsHubCategories";
import { useReportsHubPersistence } from "../useReportsHubPersistence";
import OperationalFichaPreview from "../components/OperationalFichaPreview";

/** Pré-visualização na hub: no máximo estes registos no DOM (exportação continua completa no servidor). */
const PREVIEW_RECORD_LIMIT = 100;

const defaultFiltro = () => ({
  data: todayAsInput(),
  data_inicio: "",
  data_fim: "",
  mes: "",
  motorista: "",
  tipo: "",
  periodo: "dia",
});

export default function EmpresaRelatoriosPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const setPage = useCallback(() => {}, []);
  const [filtro, setFiltro] = useState(defaultFiltro);
  const [applyTick, setApplyTick] = useState(0);
  const [localTreeSearch, setLocalTreeSearch] = useState("");
  const [expandedCat, setExpandedCat] = useState(REPORT_HUB_CATEGORIES[0]?.id || "");
  const debouncedMotorista = useDebouncedValue(filtro.motorista);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewTotal, setPreviewTotal] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [pendingExport, setPendingExport] = useState(null);
  const { exporting, download, downloadCsv } = useOperationalExport(filtro, debouncedMotorista);
  const periodoExplicito = temPeriodoExplicitoNoFiltro(filtro);

  const tipoExportLabel = typeLabelMap[filtro.tipo] || typeLabelMap[""];
  const periodoExportLabel = useMemo(
    () => formatExportPeriodoLinha(filtro),
    [filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo, filtro.tipo]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const params = { page: 1, limit: PREVIEW_RECORD_LIMIT };
        if (filtro.periodo === "dia" && filtro.data?.trim()) params.data = filtro.data.trim();
        if (filtro.periodo === "mes" && filtro.mes?.trim()) params.mes = filtro.mes.trim();
        if (filtro.periodo === "intervalo") {
          if (filtro.data_inicio?.trim()) params.data_inicio = filtro.data_inicio.trim();
          if (filtro.data_fim?.trim()) params.data_fim = filtro.data_fim.trim();
        }
        if (debouncedMotorista?.trim()) params.motorista = debouncedMotorista.trim();
        if (filtro.tipo?.trim()) params.tipo = filtro.tipo.trim();
        const { data } = await api.get("/dashboard/registros", { params });
        if (!cancelled) {
          const items = data.items || [];
          setPreviewRows(items.slice(0, PREVIEW_RECORD_LIMIT));
          setPreviewTotal(typeof data.total === "number" ? data.total : null);
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewRows([]);
          setPreviewTotal(null);
          setPreviewError(err.response?.data?.message || "Não foi possível carregar as fichas.");
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyTick, debouncedMotorista, filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo, filtro.tipo]);

  useEffect(() => {
    setPendingExport(null);
  }, [applyTick, debouncedMotorista, filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo, filtro.tipo]);

  const { favorites, recent, exportHistory, pushRecent, toggleFavorite, logExport } = useReportsHubPersistence();

  useEffect(() => {
    const onExport = (ev) => {
      const label = ev?.detail?.label;
      if (label) logExport(label);
    };
    window.addEventListener("fc:reports-export", onExport);
    return () => window.removeEventListener("fc:reports-export", onExport);
  }, [logExport]);

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

  const clearFilters = useCallback(() => {
    setLocalTreeSearch("");
    setFiltro(defaultFiltro());
  }, []);

  const handleCategoryItem = useCallback(
    (item) => {
      const { action } = item;
      if (!action) return;
      if (action.kind === "link") {
        pushRecent({ id: `nav-${item.id}`, label: item.label });
        navigate(action.to);
        return;
      }
      if (action.kind === "filterTipo") {
        setFiltro((prev) => ({ ...prev, tipo: action.tipo || "" }));
        pushRecent({ id: `flt-${item.id}`, label: item.label });
        setApplyTick((t) => t + 1);
      }
    },
    [navigate, pushRecent]
  );

  return (
    <div className="fc-reports-hub space-y-6 print:bg-white print:text-black">
      <header className="fc-card border-zinc-800/90 p-5 print:border print:shadow-none">
        <p className="fc-erp-eyebrow text-zinc-400">Operação</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">Central de relatórios</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              Fichas no mesmo layout do papel: escolher tipo e período, confirmar a grelha e exportar Excel ou PDF.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="fc-btn rounded-lg border border-zinc-500 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-100"
            >
              Imprimir ecrã
            </button>
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
            <p className="fc-erp-eyebrow text-zinc-400">Atalhos por categoria</p>
            <nav className="mt-2 space-y-2" aria-label="Categorias de relatórios">
              {REPORT_HUB_CATEGORIES.map((cat) => (
                <div key={cat.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40">
                  <button
                    type="button"
                    onClick={() => setExpandedCat((cur) => (cur === cat.id ? "" : cat.id))}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-zinc-100"
                  >
                    {cat.label}
                    <span className="text-xs text-zinc-500">{expandedCat === cat.id ? "−" : "+"}</span>
                  </button>
                  {expandedCat === cat.id ? (
                    <ul className="border-t border-zinc-800/80 px-2 py-2">
                      {cat.items.map((item) => {
                        const favId = `fav-${item.id}`;
                        const isFav = favorites.some((f) => f.id === favId);
                        return (
                          <li key={item.id} className="flex items-start gap-1 py-1">
                            <button
                              type="button"
                              aria-label={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                              className={`mt-0.5 rounded p-0.5 text-lg leading-none ${isFav ? "text-amber-300" : "text-zinc-600 hover:text-zinc-400"}`}
                              onClick={() =>
                                toggleFavorite({
                                  id: favId,
                                  label: `${cat.label} — ${item.label}`,
                                  kind: item.action?.kind,
                                  to: item.action?.kind === "link" ? item.action.to : undefined,
                                })
                              }
                            >
                              ★
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCategoryItem(item)}
                              className="flex-1 rounded-md px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-900/80"
                            >
                              <span className="font-medium text-zinc-100">{item.label}</span>
                              {item.hint ? <span className="mt-0.5 block text-[11px] text-zinc-500">{item.hint}</span> : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              ))}
            </nav>
          </div>

          <div>
            <p className="fc-erp-eyebrow text-zinc-400">Favoritos</p>
            {!favorites.length ? (
              <EmptyState compact title="Nenhum favorito" description="Use a estrela para guardar atalhos." />
            ) : (
              <ul className="mt-2 space-y-1">
                {favorites.map((f) => (
                  <li key={f.id}>
                    {f.to ? (
                      <Link to={f.to} className="block rounded-md px-2 py-1.5 text-xs text-sky-300 hover:bg-zinc-900/60">
                        {f.label}
                      </Link>
                    ) : (
                      <span className="block px-2 py-1.5 text-xs text-zinc-400">{f.label}</span>
                    )}
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
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Passos 1 e 2 — Tipo e período</h2>
            <p className="mt-1 text-xs text-zinc-500">Tipo de relatório em primeiro; depois dia, mês ou intervalo completo. «Filtrar» atualiza a ficha.</p>
            <div className="mt-3">
              <ManagerRecordsFiltersCard
                filtro={filtro}
                setFiltro={setFiltro}
                setPage={setPage}
                debouncedMotorista={debouncedMotorista}
                localTreeSearch={localTreeSearch}
                setLocalTreeSearch={setLocalTreeSearch}
                hasActiveFilters={hasActiveFilters}
                clearFilters={clearFilters}
                activePeriodLabel={activePeriodLabel}
                typeLabelMap={typeLabelMap}
                onApplyFilter={() => setApplyTick((t) => t + 1)}
                variant="hubMinimal"
                tipoFirst
              />
            </div>
          </section>

          <section className="fc-card border-zinc-800/90 p-3 print:border-0 print:shadow-none sm:p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200 print:hidden">Passo 2 — Ficha (como no papel)</h2>
            {previewError ? (
              <p className="rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">{previewError}</p>
            ) : previewLoading ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <InlineSpinner label="A carregar fichas…" />
              </div>
            ) : (
              <>
                {previewTotal != null && previewTotal > PREVIEW_RECORD_LIMIT ? (
                  <p
                    className="mb-3 rounded-lg border border-amber-700/50 bg-amber-950/35 px-3 py-2 text-xs text-amber-100 print:hidden"
                    role="status"
                  >
                    Mostrando {PREVIEW_RECORD_LIMIT} de {previewTotal} registros
                  </p>
                ) : null}
                <OperationalFichaPreview rows={previewRows} tipoFiltro={filtro.tipo} companyName={user?.empresa_nome || ""} />
              </>
            )}
          </section>

          <section className="fc-card border-zinc-800/90 p-4 print:hidden">
            <h2 className="text-sm font-semibold text-zinc-200">Passo 3 — Exportar</h2>
            <p className="mt-1 text-xs text-zinc-500">Excel e PDF usam o modelo porto; CSV inclui colunas tabulares.</p>
            {!periodoExplicito ? (
              <p className="mt-3 rounded-lg border border-sky-800/40 bg-sky-950/25 px-3 py-2 text-xs text-sky-100">
                Sem data explícita nestes filtros: o servidor usa automaticamente os <strong>últimos 7 dias</strong> (fuso
                São Paulo). Limite de segurança: <strong>1000</strong> registos por exportação.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={Boolean(exporting)}
                onClick={() => setPendingExport("excel")}
                className="fc-btn rounded-lg border border-blue-500 px-3 py-2 text-sm text-blue-300 disabled:opacity-40"
              >
                Excel
              </button>
              <button
                type="button"
                disabled={Boolean(exporting)}
                onClick={() => setPendingExport("pdf")}
                className="fc-btn rounded-lg border border-blue-500 px-3 py-2 text-sm text-blue-300 disabled:opacity-40"
              >
                PDF
              </button>
              <button
                type="button"
                disabled={Boolean(exporting)}
                onClick={() => setPendingExport("csv")}
                className="fc-btn rounded-lg border border-teal-500/70 px-3 py-2 text-sm text-teal-200 disabled:opacity-40"
              >
                CSV
              </button>
              {exporting ? <InlineSpinner label="A preparar o ficheiro…" /> : null}
            </div>
          </section>

          {pendingExport ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print:hidden"
              role="presentation"
              onClick={() => !exporting && setPendingExport(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="fc-export-confirm-title"
                className="fc-card max-w-md border border-zinc-600 bg-zinc-950 p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="fc-export-confirm-title" className="text-base font-semibold text-zinc-100">
                  Confirmar exportação
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-300">Você está exportando:</p>
                <div className="mt-3 space-y-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-3 font-medium text-zinc-100">
                  <p>{tipoExportLabel}</p>
                  <p className="text-sm font-normal text-zinc-300">
                    Período: <span className="text-zinc-100">{periodoExportLabel}</span>
                  </p>
                  <p className="text-sm font-normal text-zinc-300">
                    Registros: <span className="text-zinc-100">{previewTotal != null ? previewTotal : "—"}</span>
                  </p>
                  <p className="text-sm font-normal text-zinc-300">
                    Formato:{" "}
                    <span className="text-zinc-100">
                      {pendingExport === "excel" ? "Excel" : pendingExport === "pdf" ? "PDF" : "CSV"}
                    </span>
                  </p>
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                  O ficheiro usa os mesmos filtros de tipo e período (Passo 1). Exportações acima de 1000 registos são
                  bloqueadas no servidor.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={Boolean(exporting)}
                    onClick={async () => {
                      const fmt = pendingExport;
                      setPendingExport(null);
                      if (fmt === "csv") await downloadCsv();
                      else if (fmt === "excel" || fmt === "pdf") await download(fmt);
                    }}
                    className="fc-btn rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    {exporting ? "A gerar…" : "Confirmar exportação"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(exporting)}
                    onClick={() => setPendingExport(null)}
                    className="fc-btn rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
