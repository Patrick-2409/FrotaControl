import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../../services/auth";
import api from "../../../../services/api";
import ManagerRecordsFiltersCard from "../../../../components/reports/ManagerRecordsFiltersCard";
import ManagerRecordsPage from "../../../../pages/ManagerRecordsPage";
import EmptyState from "../../../../components/EmptyState";
import { typeLabelMap, todayAsInput } from "../../../../utils/managerRecordsOperational";
import useDebouncedValue from "../../../../hooks/useDebouncedValue";
import { REPORT_HUB_CATEGORIES } from "../reportsHubCategories";
import { useReportsHubPersistence } from "../useReportsHubPersistence";
import OperationalFichaPreview from "../components/OperationalFichaPreview";

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
  const [filtro, setFiltro] = useState(defaultFiltro);
  const [page, setPage] = useState(1);
  const [applyTick, setApplyTick] = useState(0);
  const [localTreeSearch, setLocalTreeSearch] = useState("");
  const [expandedCat, setExpandedCat] = useState(REPORT_HUB_CATEGORIES[0]?.id || "");
  const [previewMode, setPreviewMode] = useState(false);
  const debouncedMotorista = useDebouncedValue(filtro.motorista);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!previewMode) return undefined;
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      try {
        const params = { page: 1, limit: 15 };
        if (filtro.periodo === "dia" && filtro.data?.trim()) params.data = filtro.data.trim();
        if (filtro.periodo === "mes" && filtro.mes?.trim()) params.mes = filtro.mes.trim();
        if (filtro.periodo === "intervalo") {
          if (filtro.data_inicio?.trim()) params.data_inicio = filtro.data_inicio.trim();
          if (filtro.data_fim?.trim()) params.data_fim = filtro.data_fim.trim();
        }
        if (debouncedMotorista?.trim()) params.motorista = debouncedMotorista.trim();
        if (filtro.tipo?.trim()) params.tipo = filtro.tipo.trim();
        const { data } = await api.get("/dashboard/registros", { params });
        if (!cancelled) setPreviewRows(data.items || []);
      } catch {
        if (!cancelled) setPreviewRows([]);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewMode, applyTick, debouncedMotorista, filtro.data, filtro.data_fim, filtro.data_inicio, filtro.mes, filtro.periodo, filtro.tipo]);

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
    setPage(1);
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
        setPage(1);
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
            <p className="mt-1 max-w-3xl text-sm text-zinc-400">
              Tipo de relatório, período e motorista (opcional). Exportações Excel/PDF no modelo de ficha do porto.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button
              type="button"
              onClick={() => setPreviewMode((v) => !v)}
              className="fc-btn rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200"
            >
              {previewMode ? "Ocultar pré-visualização" : "Pré-visualização"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="fc-btn rounded-lg border border-zinc-500 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-100"
            >
              Imprimir resumo
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
            <p className="fc-erp-eyebrow text-zinc-400">Categorias</p>
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
              <EmptyState
                compact
                title="Nenhum favorito"
                description="Use a estrela ao lado de um relatório para guardar atalhos."
              />
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
            <p className="fc-erp-eyebrow text-zinc-400">Relatórios recentes</p>
            {!recent.length ? (
              <p className="mt-2 text-xs text-zinc-500">Abra uma categoria ou exporte para preencher esta lista.</p>
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
            <p className="fc-erp-eyebrow text-zinc-400">Histórico de exportações</p>
            {!exportHistory.length ? (
              <p className="mt-2 text-xs text-zinc-500">As exportações bem-sucedidas aparecem aqui neste dispositivo.</p>
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

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-[11px] text-zinc-500">
            <p className="font-semibold text-zinc-400">Exportações</p>
            <p className="mt-1">
              Modelo Porto: cada registo numa ficha (Excel/PDF). CSV continua disponível na listagem.
            </p>
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <section className="fc-card border-zinc-800/90 p-4 print:hidden">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Filtros gerais</p>
            <p className="mt-1 text-xs text-zinc-500">Período, tipo de relatório e motorista (opcional).</p>
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
              />
            </div>
          </section>

          <section className="fc-card border-zinc-800/90 p-3 print:border-0 print:shadow-none sm:p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200 print:hidden">
              {previewMode ? "Pré-visualização em ficha" : "Listagem operacional"}
            </h2>
            {previewMode ? (
              previewLoading ? (
                <p className="py-10 text-center text-sm text-zinc-500">A carregar fichas…</p>
              ) : (
                <OperationalFichaPreview rows={previewRows} tipoFiltro={filtro.tipo} />
              )
            ) : (
              <ManagerRecordsPage
                layout="hub"
                hubFiltro={filtro}
                hubSetFiltro={setFiltro}
                hubPage={page}
                hubSetPage={setPage}
                applyTick={applyTick}
                hubLocalTreeSearch={localTreeSearch}
                hubSetLocalTreeSearch={setLocalTreeSearch}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
