import { Link } from "react-router-dom";
import PaginationControls from "../../../../components/PaginationControls";
import SkeletonRows from "../../../../components/SkeletonRows";
import EmpresaModuleErrorPanel from "../../shared/components/EmpresaModuleErrorPanel";
import { useEmpresaFleet } from "../hooks/useEmpresaFleet";

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

  return (
    <div className="fc-erp-workspace">
      <header className="border-b border-zinc-800 pb-6">
        <p className="fc-erp-eyebrow">Módulo frota</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="fc-erp-h1">Painel operacional</h1>
            <p className="fc-erp-lead mt-3 max-w-2xl">
              Disponibilidade, documentação, manutenção e consumo médio. Cadastro alinhado à operação industrial e
              logística.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
            <Link
              to="/dashboard/gestao?secao=veiculos"
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
            >
              Vista clássica
            </Link>
          </div>
        </div>
      </header>

      {fl.summaryError ? (
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
        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores de frota">
          <article className="fc-card border-zinc-800/80 p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Total / disponíveis</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">
              {fl.fmtInt(fl.summary?.total_veiculos)} <span className="text-zinc-500">/</span>{" "}
              {fl.fmtInt(fl.summary?.disponiveis_operacao)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Disponíveis: status ativo ou em operação.</p>
          </article>
          <article className="fc-card border-zinc-800/80 p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Documentação (45 dias)</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">
              {fl.fmtInt(fl.summary?.documentacao_janela_45d)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Revisão, licenciamento, seguro ou inspeção na janela.</p>
          </article>
          <article className="fc-card border-zinc-800/80 p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Manutenção (fila)</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">
              {fl.fmtInt(fl.summary?.manutencao_fila_30d)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Status manutenção ou agendamento em 30 dias.</p>
          </article>
          <article className="fc-card border-zinc-800/80 p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Consumo médio (90 dias)</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">
              {fl.summary?.consumo_medio_litros_100km != null
                ? `${fl.summary.consumo_medio_litros_100km} L/100km`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Baseado em abastecimentos com hodômetro.</p>
          </article>
        </section>
      )}

      {fl.summary && (
        <section className="mt-4 grid gap-3 md:grid-cols-3">
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
      )}

      <section className="mt-8 rounded-xl border border-zinc-800/90 bg-zinc-950/40 p-4 sm:p-5" aria-label="Telemetria futura">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Integrações planeadas</p>
        <p className="mt-2 text-sm text-zinc-400">
          GPS, telemetria, rastreamento e sensores — estrutura de dados preparada em{" "}
          <code className="rounded bg-zinc-800 px-1 py-0.5 text-[11px] text-zinc-300">fleet_telemetry_meta</code>{" "}
          (sem transmissão em tempo real nesta versão).
        </p>
      </section>

      <section className="mt-8" aria-label="Lista de veículos">
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
            <EmpresaModuleErrorPanel title="Lista indisponível" description={fl.listError} onRetry={fl.refetchVehicles} />
          </div>
        ) : (
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
                        <p className="font-medium text-zinc-100">{v.nome}</p>
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
        )}

        <PaginationControls
          page={fl.page}
          totalPages={fl.totalPages}
          onPrev={() => fl.setPage((p) => Math.max(1, p - 1))}
          onNext={() => fl.setPage((p) => Math.min(fl.totalPages, p + 1))}
        />
      </section>

      {fl.panelOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/55 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={fl.selected ? "Editar veículo" : "Novo veículo"}
        >
          <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950 shadow-2xl sm:max-h-[96vh] sm:rounded-xl sm:border">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h3 className="text-base font-semibold text-zinc-100">
                {fl.selected ? "Editar veículo" : "Novo veículo"}
              </h3>
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
                    onChange={(e) => fl.setForm((f) => ({ ...f, usa_para_transporte: e.target.checked }))}
                  />
                  Usa para transporte (toneladas)
                </label>
                {fl.form.usa_para_transporte ? (
                  <label className="block text-xs font-medium text-zinc-400 sm:col-span-2">
                    Capacidade (t)
                    <input
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                      value={fl.form.capacidade_ton}
                      onChange={(e) => fl.setForm((f) => ({ ...f, capacidade_ton: e.target.value }))}
                    />
                  </label>
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
                      className="w-full rounded-lg bg-zinc-100 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-40"
                    >
                      Registar manutenção
                    </button>
                  </div>
                  <div className="mt-3 max-h-48 overflow-y-auto text-xs text-zinc-400">
                    {fl.maintLoading ? (
                      <p>A carregar histórico…</p>
                    ) : fl.maintItems.length === 0 ? (
                      <p>Sem registos de manutenção.</p>
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
                              onClick={() => fl.removeMaintenance(m.id)}
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
                {fl.saving ? "A guardar…" : "Guardar"}
              </button>
              {fl.selected?.id ? (
                <button
                  type="button"
                  onClick={() => fl.deleteVehicle(fl.selected.id)}
                  className="rounded-lg border border-rose-800/70 px-3 py-2.5 text-sm text-rose-200 hover:bg-rose-950/50"
                >
                  Eliminar
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
