import { useCallback, useMemo, useState } from "react";
import ConfirmActionModal from "../../../../components/ConfirmActionModal";
import PaginationControls from "../../../../components/PaginationControls";
import SkeletonRows from "../../../../components/SkeletonRows";
import BIDashboardShell from "../../bi/components/BIDashboardShell";
import BIKpiCard from "../../bi/components/BIKpiCard";
import EmpresaModuleErrorPanel from "../../shared/components/EmpresaModuleErrorPanel";
import { useEmpresaFleet } from "../hooks/useEmpresaFleet";
import AccordionSection from "../../shared/components/AccordionSection";

function statusBadgeClass(s) {
  switch (s) {
    case "ativo":
      return "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/35";
    case "operacao":
      return "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/35";
    case "manutencao":
      return "bg-amber-500/15 text-amber-100 ring-1 ring-amber-500/40";
    case "indisponivel":
      return "bg-rose-500/15 text-rose-100 ring-1 ring-rose-500/40";
    case "parado":
      return "bg-zinc-600/40 text-zinc-200 ring-1 ring-zinc-500/35";
    default:
      return "bg-zinc-700/50 text-zinc-200 ring-1 ring-zinc-600/40";
  }
}

function statusLabel(s) {
  const m = {
    ativo: "Ativo",
    manutencao: "Manutenção",
    indisponivel: "Indisponível",
    parado: "Parado",
    operacao: "Operação",
  };
  return m[s] || s || "—";
}

export default function EmpresaFrotaPage() {
  const fl = useEmpresaFleet();
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const closeConfirmAction = useCallback(() => {
    if (confirmLoading) return;
    setConfirmAction(null);
  }, [confirmLoading]);

  const confirmFleetAction = useCallback(async () => {
    if (!confirmAction?.onConfirm) return;
    setConfirmLoading(true);
    try {
      await confirmAction.onConfirm();
      setConfirmAction(null);
    } finally {
      setConfirmLoading(false);
    }
  }, [confirmAction]);

  const fleetSpark = useMemo(() => {
    const s = fl.summary;
    if (!s) return [];
    const t = Number(s.total_veiculos) || 0;
    const d = Number(s.disponiveis_operacao) || 0;
    const m = Number(s.manutencao_fila_30d) || 0;
    if (!t && !d) return [];
    return [t, d, Math.max(0, d - m)];
  }, [fl.summary]);

  const headerAside = (
    <>
      <button
        type="button"
        onClick={fl.openCreate}
        className="rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm hover:bg-amber-400"
      >
        Novo veículo
      </button>
      <button
        type="button"
        onClick={() => fl.downloadFleetCsv()}
        className="rounded-lg border border-zinc-600 bg-zinc-900/80 px-4 py-2 text-sm font-medium text-zinc-100 hover:border-zinc-500"
      >
        Exportar CSV
      </button>
      <button
        type="button"
        onClick={() => {
          void fl.printFleetAssignments();
        }}
        className="rounded-lg border border-amber-500/45 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/15"
      >
        Imprimir IDs
      </button>
    </>
  );

  return (
    <BIDashboardShell
      eyebrow="Indicadores"
      title="Frota"
      lead="Disponibilidade, documentação, manutenção e consumo médio. Cadastro alinhado à operação industrial e logística."
      headerAside={headerAside}
    >

      {fl.summaryError && !fl.summary ? (
        <div className="mt-6">
          <EmpresaModuleErrorPanel title="Resumo indisponível" description={fl.summaryError} onRetry={fl.refetchSummary} />
        </div>
      ) : fl.summaryLoading && !fl.summary ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="fc-card p-4">
              <SkeletonRows rows={2} />
            </div>
          ))}
        </div>
      ) : (
        <AccordionSection
          id="frota-dashboard-rapido"
          title="Dashboard rápido"
          description="Visão consolidada de disponibilidade, documentos e manutenção."
          defaultOpenDesktop
          defaultOpenMobile
        >
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores de frota">
          <BIKpiCard
            label="Total / disponíveis"
            value={`${fl.fmtInt(fl.summary?.total_veiculos)} / ${fl.fmtInt(fl.summary?.disponiveis_operacao)}`}
            hint="Disponíveis: status ativo ou em operação."
            sparklineValues={fleetSpark}
          />
          <BIKpiCard
            label="Documentação (45 dias)"
            value={fl.fmtInt(fl.summary?.documentacao_janela_45d)}
            hint="Revisão, licenciamento, seguro ou inspeção na janela."
            sparklineValues={fleetSpark}
          />
          <BIKpiCard
            label="Manutenção (fila)"
            value={fl.fmtInt(fl.summary?.manutencao_fila_30d)}
            hint="Status manutenção ou agendamento em 30 dias."
            sparklineValues={fleetSpark}
          />
          <BIKpiCard
            label="Consumo médio (90 dias)"
            value={
              fl.summary?.consumo_medio_litros_100km != null
                ? `${fl.summary.consumo_medio_litros_100km} L/100km`
                : "—"
            }
            hint="Baseado em abastecimentos com hodômetro."
          />
        </section>
        </AccordionSection>
      )}

      {fl.summary && (
        <AccordionSection
          id="frota-indicadores-secundarios"
          title="Indicadores complementares"
          description="Sinais operacionais para apoio à decisão."
          defaultOpenDesktop={false}
          defaultOpenMobile={false}
        >
        <section className="grid gap-3 md:grid-cols-3">
          <article className="fc-card border-zinc-800/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Sem movimento (14 dias)</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-zinc-100">
              {fl.fmtInt(fl.summary.veiculos_sem_movimento_14d)}
            </p>
          </article>
          <article className="fc-card border-zinc-800/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Manutenções registadas</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-zinc-100">
              {fl.fmtInt(fl.summary.manutencoes_registradas)}
            </p>
          </article>
          <article className="fc-card border-zinc-800/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Por status</p>
            <ul className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-300">
              {Object.entries(fl.summary.por_status || {}).map(([k, v]) => (
                <li key={k} className="rounded-md bg-zinc-800/80 px-2 py-1 tabular-nums">
                  {statusLabel(k)}: {fl.fmtInt(v)}
                </li>
              ))}
            </ul>
          </article>
        </section>
        </AccordionSection>
      )}

      <AccordionSection
        id="frota-integracoes"
        title="Integrações futuras"
        description="Status da preparação de telemetria."
        defaultOpenDesktop={false}
        defaultOpenMobile={false}
      >
      <section className="rounded-xl border border-zinc-800/90 bg-zinc-950/40 p-4 sm:p-5" aria-label="Telemetria futura">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Integrações planeadas</p>
        <p className="mt-2 text-sm text-zinc-400">
          GPS, telemetria, rastreamento e sensores — estrutura de dados preparada em{" "}
          <code className="rounded bg-zinc-800 px-1 py-0.5 text-[11px] text-zinc-300">fleet_telemetry_meta</code>{" "}
          (sem transmissão em tempo real nesta versão).
        </p>
      </section>
      </AccordionSection>

      <AccordionSection
        id="frota-lista-veiculos"
        title="Lista de veículos"
        description="Tabela paginada para manter a navegação leve no mobile."
        defaultOpenDesktop={false}
        defaultOpenMobile={false}
      >
      <section aria-label="Lista de veículos">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Veículos</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              type="search"
              value={fl.search}
              onChange={(e) => {
                fl.setSearch(e.target.value);
                fl.setPage(1);
              }}
              placeholder="Pesquisar placa, nome, tipo…"
              className="w-full min-w-[12rem] rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 sm:max-w-xs"
            />
            <select
              value={fl.statusFilter}
              onChange={(e) => {
                fl.setStatusFilter(e.target.value);
                fl.setPage(1);
              }}
              className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100"
            >
              {fl.STATUS_OPTS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={fl.tipoFilter}
              onChange={(e) => {
                fl.setTipoFilter(e.target.value);
                fl.setPage(1);
              }}
              placeholder="Filtrar tipo"
              className="w-full min-w-[8rem] rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 sm:max-w-[10rem]"
            />
          </div>
        </div>

        {fl.listError ? (
          <div className="mt-4">
            <EmpresaModuleErrorPanel
              title="Erro ao carregar dados da frota"
              description={fl.listError}
              onRetry={fl.refetchVehicles}
            />
          </div>
        ) : (
          <>
        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800/90">
            <table className="min-w-[720px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-3">Identificação</th>
                  <th className="px-3 py-3">Tipo / categoria</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 hidden md:table-cell">Combustível</th>
                  <th className="px-3 py-3 hidden lg:table-cell">Motorista</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {fl.listLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6">
                      <SkeletonRows rows={4} />
                    </td>
                  </tr>
                ) : fl.vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-zinc-500">
                      Nenhum veículo encontrado com os filtros actuais.
                    </td>
                  </tr>
                ) : (
                  fl.vehicles.map((v) => (
                    <tr key={v.id} className="border-b border-zinc-800/80 hover:bg-zinc-900/50">
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {v.codigo_operacional ? (
                            <span className="inline-flex rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-black text-amber-100">
                              #{String(v.codigo_operacional).padStart(2, "0")}
                            </span>
                          ) : null}
                          <p className="font-medium text-zinc-100">{v.nome}</p>
                        </div>
                        <p className="text-xs text-zinc-500">
                          {v.placa}
                          {v.marca || v.modelo ? ` · ${[v.marca, v.modelo].filter(Boolean).join(" ")}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-zinc-400">
                        {[v.tipo, v.categoria].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass(
                            v.status_operacional
                          )}`}
                        >
                          {statusLabel(v.status_operacional)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-zinc-400 hidden md:table-cell">
                        {v.combustivel_principal || "—"}
                      </td>
                      <td className="px-3 py-3 text-zinc-400 hidden lg:table-cell">
                        {v.motorista_nome || "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => fl.openEdit(v)}
                          className="rounded-md border border-zinc-600 px-2 py-1 text-xs font-medium text-zinc-200 hover:border-zinc-500"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={fl.page}
            totalPages={fl.totalPages}
            onPrev={() => fl.setPage((p) => Math.max(1, p - 1))}
            onNext={() => fl.setPage((p) => Math.min(fl.totalPages, p + 1))}
          />
          </>
        )}
      </section>
      </AccordionSection>

      {fl.panelOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/55 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={fl.selected ? "Editar veículo" : "Novo veículo"}
        >
          <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950 shadow-2xl sm:max-h-[96vh] sm:rounded-xl sm:border">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-zinc-100">
                  {fl.selected ? "Editar veículo" : "Novo veículo"}
                </h3>
                {fl.selected?.codigo_operacional ? (
                  <p className="mt-1 text-xs font-semibold text-amber-100">
                    Código operacional #{String(fl.selected.codigo_operacional).padStart(2, "0")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={fl.closePanel}
                className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-4 px-4 py-4">
              {fl.saveError ? (
                <p className="rounded-md border border-rose-800/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">
                  {fl.saveError}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-zinc-400 sm:col-span-2">
                  Nome interno
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.nome}
                    onChange={(e) => fl.setForm((f) => ({ ...f, nome: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Placa
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.placa}
                    onChange={(e) => fl.setForm((f) => ({ ...f, placa: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Status operacional
                  <select
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.status_operacional}
                    onChange={(e) => fl.setForm((f) => ({ ...f, status_operacional: e.target.value }))}
                  >
                    {["ativo", "operacao", "manutencao", "indisponivel", "parado"].map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Tipo
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.tipo}
                    onChange={(e) => fl.setForm((f) => ({ ...f, tipo: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Categoria
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.categoria}
                    onChange={(e) => fl.setForm((f) => ({ ...f, categoria: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Marca
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.marca}
                    onChange={(e) => fl.setForm((f) => ({ ...f, marca: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Modelo
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.modelo}
                    onChange={(e) => fl.setForm((f) => ({ ...f, modelo: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Ano
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.ano}
                    onChange={(e) => fl.setForm((f) => ({ ...f, ano: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  RENAVAM
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.renavam}
                    onChange={(e) => fl.setForm((f) => ({ ...f, renavam: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400 sm:col-span-2">
                  Chassi
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.chassi}
                    onChange={(e) => fl.setForm((f) => ({ ...f, chassi: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Combustível principal
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.combustivel_principal}
                    onChange={(e) => fl.setForm((f) => ({ ...f, combustivel_principal: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Capacidade (L)
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.capacidade_litros}
                    onChange={(e) => fl.setForm((f) => ({ ...f, capacidade_litros: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Horímetro atual
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.horimetro_atual}
                    onChange={(e) => fl.setForm((f) => ({ ...f, horimetro_atual: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Hodômetro atual
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={fl.form.hodometro_atual}
                    onChange={(e) => fl.setForm((f) => ({ ...f, hodometro_atual: e.target.value }))}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-300 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={fl.form.usa_para_transporte}
                    onChange={(e) =>
                      fl.setForm((f) => ({
                        ...f,
                        usa_para_transporte: e.target.checked,
                        transporta_esteril: e.target.checked ? f.transporta_esteril : false,
                        transporta_rocha: e.target.checked ? f.transporta_rocha : false,
                        capacidade_esteril_ton: e.target.checked ? f.capacidade_esteril_ton : "",
                        capacidade_rocha_ton: e.target.checked ? f.capacidade_rocha_ton : "",
                      }))
                    }
                  />
                  Usa para transporte (toneladas)
                </label>
                {fl.form.usa_para_transporte ? (
                  <div className="sm:col-span-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-100">
                          Capacidade por material
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                          Informe a tonelagem real por viagem para cada material que o veículo transporta.
                        </p>
                      </div>
                      <span className="mt-1 inline-flex w-fit rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 sm:mt-0">
                        Apontador
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950/55 p-3">
                        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                          <input
                            type="checkbox"
                            checked={fl.form.transporta_esteril}
                            onChange={(e) =>
                              fl.setForm((f) => ({
                                ...f,
                                transporta_esteril: e.target.checked,
                                capacidade_esteril_ton: e.target.checked ? f.capacidade_esteril_ton : "",
                              }))
                            }
                          />
                          Transporta estéril
                        </label>
                        <input
                          inputMode="decimal"
                          disabled={!fl.form.transporta_esteril}
                          className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                          value={fl.form.capacidade_esteril_ton}
                          onChange={(e) => fl.setForm((f) => ({ ...f, capacidade_esteril_ton: e.target.value }))}
                          placeholder="Toneladas por viagem"
                        />
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950/55 p-3">
                        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                          <input
                            type="checkbox"
                            checked={fl.form.transporta_rocha}
                            onChange={(e) =>
                              fl.setForm((f) => ({
                                ...f,
                                transporta_rocha: e.target.checked,
                                capacidade_rocha_ton: e.target.checked ? f.capacidade_rocha_ton : "",
                              }))
                            }
                          />
                          Transporta rocha
                        </label>
                        <input
                          inputMode="decimal"
                          disabled={!fl.form.transporta_rocha}
                          className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                          value={fl.form.capacidade_rocha_ton}
                          onChange={(e) => fl.setForm((f) => ({ ...f, capacidade_rocha_ton: e.target.value }))}
                          placeholder="Toneladas por viagem"
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                      O material desmarcado fica bloqueado no PWA do apontador e não entra na produção.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-zinc-800 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Documentação</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {[
                    ["doc_revisao_validade", "Revisão / doc."],
                    ["doc_licenciamento_validade", "Licenciamento"],
                    ["doc_seguro_validade", "Seguro"],
                    ["doc_inspecao_validade", "Inspeção"],
                  ].map(([key, lab]) => (
                    <label key={key} className="block text-xs font-medium text-zinc-400">
                      {lab}
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        value={fl.form[key]}
                        onChange={(e) => fl.setForm((f) => ({ ...f, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                  <label className="block text-xs font-medium text-zinc-400 sm:col-span-2">
                    Manutenção agendar até
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                      value={fl.form.manutencao_agendar_ate}
                      onChange={(e) => fl.setForm((f) => ({ ...f, manutencao_agendar_ate: e.target.value }))}
                    />
                  </label>
                </div>
              </div>

              {fl.selected ? (
                <div className="border-t border-zinc-800 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Manutenção</p>
                  <div className="mt-2 space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        value={fl.maintForm.tipo}
                        onChange={(e) => fl.setMaintForm((f) => ({ ...f, tipo: e.target.value }))}
                      >
                        <option value="preventiva">Preventiva</option>
                        <option value="corretiva">Corretiva</option>
                      </select>
                      <input
                        type="date"
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        value={fl.maintForm.data_servico}
                        onChange={(e) => fl.setMaintForm((f) => ({ ...f, data_servico: e.target.value }))}
                      />
                      <input
                        placeholder="Título"
                        className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        value={fl.maintForm.titulo}
                        onChange={(e) => fl.setMaintForm((f) => ({ ...f, titulo: e.target.value }))}
                      />
                      <textarea
                        placeholder="Descrição (opcional)"
                        rows={2}
                        className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        value={fl.maintForm.descricao}
                        onChange={(e) => fl.setMaintForm((f) => ({ ...f, descricao: e.target.value }))}
                      />
                      <input
                        placeholder="Custo (opcional)"
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        value={fl.maintForm.custo}
                        onChange={(e) => fl.setMaintForm((f) => ({ ...f, custo: e.target.value }))}
                      />
                      <input
                        placeholder="Odómetro snapshot"
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        value={fl.maintForm.odometro_snapshot}
                        onChange={(e) => fl.setMaintForm((f) => ({ ...f, odometro_snapshot: e.target.value }))}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={fl.maintSaving || !fl.maintForm.titulo.trim()}
                      onClick={() => fl.addMaintenance()}
                      className="fc-btn fc-btn-empresa-accent w-full rounded-lg py-2 text-sm font-semibold disabled:opacity-40"
                    >
                      Registar manutenção
                    </button>
                  </div>
                  <div className="mt-3 max-h-48 overflow-y-auto text-xs text-zinc-400">
                    {fl.maintLoading ? (
                      <p>A carregar histórico…</p>
                    ) : fl.maintItems.length === 0 ? (
                      <p>Sem registros de manutenção.</p>
                    ) : (
                      <ul className="space-y-2">
                        {fl.maintItems.map((m) => (
                          <li
                            key={m.id}
                            className="flex items-start justify-between gap-2 rounded border border-zinc-800/80 bg-zinc-900/50 px-2 py-2"
                          >
                            <div>
                              <p className="font-medium text-zinc-200">
                                {m.titulo}{" "}
                                <span className="text-zinc-500">
                                  · {m.data_servico} · {m.tipo}
                                </span>
                              </p>
                              {m.custo != null ? (
                                <p className="text-zinc-500">Custo: {Number(m.custo).toLocaleString("pt-BR")}</p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  title: "Remover manutenção",
                                  description: "Este registro de manutenção será removido do histórico do veículo.",
                                  consequence: "A exclusão é permanente e pode afetar rastreabilidade da frota.",
                                  confirmLabel: "Remover registro",
                                  confirmLoadingLabel: "Removendo...",
                                  tone: "danger",
                                  onConfirm: () => fl.removeMaintenance(m.id),
                                })
                              }
                              className="shrink-0 text-rose-400 hover:text-rose-300"
                            >
                              Remover
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
              <button
                type="button"
                disabled={fl.saving}
                onClick={() => fl.saveVehicle()}
                className="flex-1 rounded-lg bg-amber-500/90 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
              >
                {fl.saving ? "Salvando…" : "Salvar"}
              </button>
              {fl.selected?.id ? (
                <button
                  type="button"
                  onClick={() =>
                    setConfirmAction({
                      title: "Excluir veículo",
                      description: "Este veículo será removido do cadastro de frota da empresa.",
                      consequence: "A ação é irreversível e pode impactar dados vinculados.",
                      confirmLabel: "Excluir veículo",
                      confirmLoadingLabel: "Excluindo...",
                      tone: "danger",
                      onConfirm: () => fl.deleteVehicle(fl.selected.id),
                    })
                  }
                  className="rounded-lg border border-rose-800/70 px-3 py-2.5 text-sm text-rose-200 hover:bg-rose-950/50"
                >
                  Excluir
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmActionModal
        open={Boolean(confirmAction)}
        title={confirmAction?.title || "Confirmar ação"}
        description={confirmAction?.description || ""}
        consequence={confirmAction?.consequence || ""}
        confirmLabel={confirmAction?.confirmLabel || "Confirmar"}
        confirmLoadingLabel={confirmAction?.confirmLoadingLabel || "Confirmando..."}
        tone={confirmAction?.tone || "danger"}
        loading={confirmLoading}
        onClose={closeConfirmAction}
        onConfirm={() => void confirmFleetAction()}
      />
    </BIDashboardShell>
  );
}
