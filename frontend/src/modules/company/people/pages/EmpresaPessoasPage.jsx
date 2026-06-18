import { useMemo } from "react";
import { Link } from "react-router-dom";
import Avatar from "../../../../components/Avatar";
import PaginationControls from "../../../../components/PaginationControls";
import SkeletonRows from "../../../../components/SkeletonRows";
import BIDashboardShell from "../../bi/components/BIDashboardShell";
import EmpresaModuleErrorPanel from "../../shared/components/EmpresaModuleErrorPanel";
import ExecutiveKpiCard from "../components/ExecutiveKpiCard";
import { resolveBackendAssetUrl } from "../../../../services/api";
import { EmpresaMenuIcon, FROTA_PANEL_PATH } from "../../../../components/empresaSidebarConstants";
import PeopleRoleFilter from "../components/PeopleRoleFilter";
import { useEmpresaPeople } from "../hooks/useEmpresaPeople";
import { CNH_CATEGORIAS, cnhBadgeClass, cnhStatusLabel, getCnhStatus } from "../../../../utils/cnhStatus";
import { foraRankingMotivo, splitTransportRanking } from "../../../../utils/peopleRanking";
import { foraControleProducaoLabel } from "../../../../utils/riscoOperacional";
import AccordionSection from "../../shared/components/AccordionSection";

function roleLabel(r) {
  const m = { MOTORISTA: "Motorista", APONTADOR: "Apontador", ADMIN_EMPRESA: "Administrador" };
  return m[r] || r;
}

function statusPessoaClass(s) {
  if (s === "ativo") return "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/35";
  if (s === "afastado") return "bg-amber-500/15 text-amber-100 ring-1 ring-amber-500/35";
  if (s === "suspenso") return "bg-rose-500/15 text-rose-100 ring-1 ring-rose-500/35";
  return "bg-zinc-700/50 text-zinc-200 ring-1 ring-zinc-600/40";
}

const KPI_GRID = "grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]";

const RISCO_TOOLTIP =
  "Avalia apenas motoristas com veículo de transporte. Apoio e apontadores ficam fora deste indicador.";

const RISCO_TOOLTIP_DETALHE = `${RISCO_TOOLTIP} Sem romaneio: sem lançamentos de transporte nos últimos 7 dias. Baixa atividade: alertas no feed operacional.`;

function cnhCardTone(count, kind) {
  if (kind === "vencidas") return count > 0 ? "critical" : "neutral";
  if (kind === "vencendo") return count > 0 ? "warning" : "neutral";
  return count > 0 ? "ok" : "neutral";
}

function RankingTable({ rows, p, showMotivo = false, showNaoAplicavel = false, emptyMessage, onEditRow }) {
  return (
    <div className="fc-erp-table-scroll overflow-x-auto rounded-xl border border-zinc-800/90">
      <table className="min-w-[640px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-3">Pessoa</th>
            <th className="px-3 py-3">Papel</th>
            <th className="px-3 py-3">Vínculos</th>
            {showMotivo ? <th className="px-3 py-3">Motivo</th> : null}
            {showNaoAplicavel ? <th className="px-3 py-3">Atividade</th> : null}
            <th className="px-3 py-3 text-right">Romaneios</th>
            <th className="px-3 py-3 text-right">Parte diária</th>
            {onEditRow ? <th className="px-3 py-3 text-right">Ações</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5 + (showMotivo ? 1 : 0) + (showNaoAplicavel ? 1 : 0) + (onEditRow ? 1 : 0)} className="px-3 py-6 text-center text-zinc-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-b border-zinc-800/80 hover:bg-zinc-900/40">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar imageUrl={resolveBackendAssetUrl(row.profile_image_url)} name={row.nome} size="list" />
                    <div>
                      <p className="font-medium text-zinc-100">{row.nome}</p>
                      {row.funcao ? <p className="text-xs text-zinc-500">{row.funcao}</p> : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-zinc-400">{roleLabel(row.role)}</td>
                <td className="px-3 py-3 text-xs text-zinc-400">
                  {row.role === "MOTORISTA" && (row.veiculo_placa || row.veiculo_nome) ? (
                    <span>
                      Veículo: {row.veiculo_placa || row.veiculo_nome}
                      {row.tipo_operacao ? (
                        <span className="text-zinc-500"> · {row.tipo_operacao}</span>
                      ) : null}
                    </span>
                  ) : null}
                  {row.role === "APONTADOR" ? <span>Coordenação de campo</span> : null}
                  {row.role === "MOTORISTA" && !row.veiculo_placa && !row.veiculo_nome ? (
                    <span className="text-zinc-500">Sem veículo</span>
                  ) : null}
                </td>
                {showMotivo ? (
                  <td className="px-3 py-3 text-xs text-zinc-400">{foraRankingMotivo(row)}</td>
                ) : null}
                {showNaoAplicavel ? (
                  <td className="px-3 py-3 text-xs text-zinc-500">{foraControleProducaoLabel()}</td>
                ) : null}
                <td className="px-3 py-3 text-right tabular-nums text-zinc-200">{p.fmtInt(row.romaneios)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-zinc-200">{p.fmtInt(row.partes_diaria)}</td>
                {onEditRow ? (
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onEditRow(row)}
                      className="rounded-md border border-zinc-600 px-2 py-1 text-xs font-medium text-zinc-200 hover:border-zinc-500"
                    >
                      Editar perfil
                    </button>
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function EmpresaPessoasPage() {
  const p = useEmpresaPeople();
  const { rankingTransporte, foraRanking } = useMemo(() => splitTransportRanking(p.prod), [p.prod]);
  const totalTransporte = Number(p.riscoDisplay?.totalTransporte ?? 0);
  const semRomaneio = Number(p.riscoDisplay?.semRomaneio ?? 0);
  const baixaAtividade = Number(p.riscoDisplay?.baixaAtividade ?? 0);
  const temRisco = semRomaneio > 0 || baixaAtividade > 0;
  const alertasRisco = semRomaneio + baixaAtividade;
  const motoristasAtivos = Number(p.summary?.por_status?.ativo ?? 0);
  const cnhVencidas = Number(p.summary?.cnh_vencidas ?? 0);
  const cnhVencendo = Number(p.summary?.cnh_vencendo ?? 0);
  const cnhValidas = Number(p.summary?.cnh_validas ?? 0);

  const riscoStatus = semRomaneio > 0 ? "Crítico" : baixaAtividade > 0 ? "Atenção" : "OK";
  const riscoTone = semRomaneio > 0 ? "critical" : baixaAtividade > 0 ? "warning" : "ok";
  const riscoSubtitle =
    alertasRisco > 0 ? `${p.fmtInt(alertasRisco)} alerta(s) · 7 dias` : "Sem alertas operacionais";

  const transportTone = semRomaneio > 0 ? "critical" : totalTransporte > 0 ? "ok" : "neutral";
  const transportValue =
    totalTransporte === 0 ? "—" : p.fmtInt(semRomaneio > 0 ? semRomaneio : totalTransporte);
  const transportSubtitle =
    totalTransporte === 0
      ? "Nenhum motorista de transporte"
      : semRomaneio > 0
        ? "sem produção (7 dias)"
        : "com produção recente";

  const handleEditFromRow = (row) => {
    const found = p.users.find((u) => Number(u.id) === Number(row.id));
    p.openEdit(found || { ...row, cpf_id: row.cpf_id || "", email: row.email || "" });
  };

  const headerAside = (
    <>
      <Link
        to="/empresa/alertas"
        className="fc-btn fc-btn-empresa-secondary w-full justify-center rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-2 text-sm font-medium text-amber-100 hover:border-amber-500/60 sm:w-auto"
      >
        Alertas pessoas
      </Link>
      <Link
        to="/dashboard/gestao"
        className="fc-btn fc-btn-empresa-secondary w-full justify-center rounded-lg border border-zinc-600 bg-zinc-900/80 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500 sm:w-auto"
      >
        Contas de acesso
      </Link>
    </>
  );

  return (
    <BIDashboardShell
      eyebrow="Indicadores"
      title="Pessoas"
      lead="Gestão de pessoas da operação: papéis (motorista, apontador, administrador), CNH, vínculo com veículos,
      produtividade e alertas operacionais."
      headerAside={headerAside}
    >

      {p.summaryError && !p.summary ? (
        <div className="mt-6">
          <EmpresaModuleErrorPanel title="Resumo indisponível" description={p.summaryError} onRetry={p.refetchSummary} />
        </div>
      ) : p.summaryLoading && !p.summary ? (
        <section className="mt-6 space-y-3" aria-busy="true" aria-label="Carregando indicadores">
          <div className={KPI_GRID}>
            {[1, 2, 3].map((k) => (
              <div key={`p-${k}`} className="fc-card min-h-[168px] p-4">
                <SkeletonRows rows={2} />
              </div>
            ))}
          </div>
          <div className={KPI_GRID}>
            {[1, 2, 3, 4].map((k) => (
              <div key={`s-${k}`} className="fc-card min-h-[168px] p-4">
                <SkeletonRows rows={2} />
              </div>
            ))}
          </div>
        </section>
      ) : (
        <AccordionSection
          id="pessoas-dashboard-rapido"
          title="Resumo de pessoas"
          description="Indicadores críticos de pessoas, CNH e risco operacional."
          defaultOpenDesktop
          defaultOpenMobile
        >
        <section className="space-y-3" aria-label="Indicadores de pessoas">
          <div className={KPI_GRID}>
            <ExecutiveKpiCard
              icon={<EmpresaMenuIcon type="transport" />}
              label="Transporte"
              value={transportValue}
              subtitle={transportSubtitle}
              tone={transportTone}
              tooltip={RISCO_TOOLTIP}
            />
            <ExecutiveKpiCard
              icon={<EmpresaMenuIcon type="bell" />}
              label="Risco operacional"
              value={riscoStatus}
              subtitle={riscoSubtitle}
              tone={riscoTone}
              tooltip={RISCO_TOOLTIP_DETALHE}
              footer={
                <button
                  type="button"
                  disabled={p.riscoFilterLoading || !temRisco}
                  onClick={() => p.applyRiscoOperacionalFilter()}
                  className="text-xs font-medium text-zinc-400 underline-offset-2 transition hover:text-amber-100 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
                >
                  {p.riscoFilterLoading ? "Carregando…" : "Ver detalhes"}
                </button>
              }
            />
            <ExecutiveKpiCard
              icon={<EmpresaMenuIcon type="people" />}
              label="Motoristas ativos"
              value={p.fmtInt(motoristasAtivos)}
              subtitle={`${p.fmtInt(p.summary?.motoristas)} mot. · ${p.fmtInt(p.summary?.apontadores)} apont.`}
              tone={motoristasAtivos > 0 ? "ok" : "neutral"}
            />
          </div>
          <div className={KPI_GRID}>
            <ExecutiveKpiCard
              icon={<EmpresaMenuIcon type="reports" />}
              label="Lançamentos"
              value={p.fmtInt(p.summary?.romaneios_7d)}
              subtitle={`Partes diárias: ${p.fmtInt(p.summary?.parte_diaria_7d)} · 7 dias`}
              tone="neutral"
            />
            <ExecutiveKpiCard
              icon={<EmpresaMenuIcon type="profile" />}
              label="CNH vencidas"
              value={p.fmtInt(cnhVencidas)}
              subtitle="Validade expirada"
              tone={cnhCardTone(cnhVencidas, "vencidas")}
            />
            <ExecutiveKpiCard
              icon={<EmpresaMenuIcon type="profile" />}
              label="CNH vencendo"
              value={p.fmtInt(cnhVencendo)}
              subtitle="Próximos 60 dias"
              tone={cnhCardTone(cnhVencendo, "vencendo")}
            />
            <ExecutiveKpiCard
              icon={<EmpresaMenuIcon type="profile" />}
              label="CNH válidas"
              value={p.fmtInt(cnhValidas)}
              subtitle="Acima de 60 dias"
              tone={cnhCardTone(cnhValidas, "validas")}
            />
          </div>
        </section>
        </AccordionSection>
      )}

      {p.summary?.por_status && (
        <AccordionSection
          id="pessoas-status-operacional"
          title="Status operacional"
          description="Distribuição atual de motoristas e apontadores por status."
          defaultOpenDesktop={false}
          defaultOpenMobile={false}
        >
        <section className="fc-card border-zinc-800/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Status operacional (motoristas e apontadores)</p>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-300">
            {Object.entries(p.summary.por_status).map(([k, v]) => (
              <li key={k} className="rounded-md bg-zinc-800/80 px-2 py-1 tabular-nums">
                {k}: {p.fmtInt(v)}
              </li>
            ))}
          </ul>
        </section>
        </AccordionSection>
      )}

      <AccordionSection
        id="pessoas-ranking"
        title="Ranking e cobertura de transporte"
        description="Quem está no ranking de produção e quem ficou fora."
        defaultOpenDesktop={false}
        defaultOpenMobile={false}
      >
      <section className="space-y-8" aria-label="Ranking de transporte">
        {p.prodError ? (
          <EmpresaModuleErrorPanel
            title="Ranking indisponível"
            description={p.prodError}
            onRetry={p.refetchProd}
          />
        ) : (
          <>
            <div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100">Ranking de transporte</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Apenas motoristas com veículo de transporte de material (30 dias).
                  </p>
                </div>
                <span className="rounded-md bg-zinc-800/80 px-2 py-1 text-xs tabular-nums text-zinc-400">
                  {p.fmtInt(rankingTransporte.length)} no ranking
                </span>
              </div>
              {p.prodLoading ? (
                <div className="mt-3 fc-card p-4">
                  <SkeletonRows rows={3} />
                </div>
              ) : (
                <div className="mt-3">
                  <RankingTable
                    rows={rankingTransporte}
                    p={p}
                    emptyMessage="Nenhum motorista com veículo de transporte no período."
                  />
                </div>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100">Fora do ranking (apoio)</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Apontadores, veículos de apoio e motoristas sem vínculo de transporte.
                  </p>
                </div>
                <span className="rounded-md bg-zinc-800/80 px-2 py-1 text-xs tabular-nums text-zinc-400">
                  {p.fmtInt(foraRanking.length)} fora
                </span>
              </div>
              {p.prodLoading ? (
                <div className="mt-3 fc-card p-4">
                  <SkeletonRows rows={2} />
                </div>
              ) : (
                <div className="mt-3">
                  <RankingTable
                    rows={foraRanking}
                    p={p}
                    showMotivo
                    emptyMessage="Ninguém fora do ranking de transporte."
                  />
                </div>
              )}
            </div>
          </>
        )}
      </section>
      </AccordionSection>

      <AccordionSection
        id="pessoas-lista"
        title="Gestão de pessoas"
        description="Lista e edição de perfis com foco em operação de campo."
        defaultOpenDesktop={false}
        defaultOpenMobile={false}
      >
      <section id="lista-pessoas" className="scroll-mt-6" aria-label="Lista de pessoas">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Gestão de pessoas</h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">
              Fluxo: criar conta em Contas de acesso → definir papel e perfil aqui → vincular veículo em{" "}
              <Link to={FROTA_PANEL_PATH} className="text-sky-400/90 hover:text-sky-300">
                Painel frota
              </Link>{" "}
              (motoristas) → salvar.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <PeopleRoleFilter
              value={p.roleFilter}
              options={p.ROLE_OPTS}
              disabled={p.listLoading && p.riscoListFilter}
              onChange={(role) => {
                p.setRoleFilter(role);
                p.setPage(1);
                if (p.riscoListFilter) p.clearRiscoListFilter();
              }}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <input
              type="search"
              value={p.search}
              onChange={(e) => {
                p.setSearch(e.target.value);
                p.setPage(1);
              }}
              placeholder="Nome, e-mail, CPF, função…"
              className="w-full min-w-[12rem] rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 sm:max-w-xs"
            />
            <select
              value={p.statusFilter}
              onChange={(e) => {
                p.setStatusFilter(e.target.value);
                p.setPage(1);
              }}
              className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100"
            >
              {p.STATUS_OPTS.map((o) => (
                <option key={o.value || "st"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            </div>
          </div>
        </div>

        {p.riscoListFilter ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-xs text-amber-100">
            <span className="min-w-0 break-words">
              Motoristas de transporte sem registros de romaneio nos últimos 7 dias
              {baixaAtividade > 0 ? ` · ${p.fmtInt(baixaAtividade)} com baixa atividade` : ""}.
            </span>
            <button
              type="button"
              onClick={() => p.clearRiscoListFilter()}
              className="shrink-0 rounded-md border border-amber-600/50 px-2 py-1 font-semibold text-amber-50 hover:bg-amber-900/40"
            >
              Limpar filtro
            </button>
          </div>
        ) : null}

        {p.listError ? (
          <div className="mt-4">
            <EmpresaModuleErrorPanel
              title="Erro ao carregar dados de pessoas"
              description={p.listError}
              onRetry={p.refetchUsers}
            />
          </div>
        ) : null}

        {p.riscoListFilter ? (
          <div className="mt-4 space-y-8">
            <div className="rounded-xl border border-rose-500/25 bg-rose-950/15 p-4 sm:p-5">
              <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-rose-100">
                <span aria-hidden>🔴</span>
                Motoristas de transporte em atenção (7 dias)
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                    Apenas quem deve registrar romaneios de transporte de material.
              </p>
              {p.riscoFilterLoading || p.listLoading ? (
                <div className="mt-3">
                  <SkeletonRows rows={3} />
                </div>
              ) : (
                <div className="mt-3">
                  <RankingTable
                    rows={p.riscoCadastroLists?.transporteRisco ?? []}
                    p={p}
                    emptyMessage="Nenhum motorista de transporte em situação de risco no período."
                    onEditRow={handleEditFromRow}
                  />
                </div>
              )}
            </div>

            <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/20 p-4 sm:p-5">
              <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-zinc-300">
                <span aria-hidden>⚪</span>
                Fora do controle de produção
              </h3>
              <p className="mt-1 text-xs text-zinc-500">Veículos de apoio, apontadores e outros perfis.</p>
              {p.riscoFilterLoading || p.listLoading ? (
                <div className="mt-3">
                  <SkeletonRows rows={2} />
                </div>
              ) : (
                <div className="mt-3">
                  <RankingTable
                    rows={p.riscoCadastroLists?.foraControle ?? []}
                    p={p}
                    showNaoAplicavel
                    emptyMessage="Ninguém fora do controle de produção."
                    onEditRow={handleEditFromRow}
                  />
                </div>
              )}
            </div>
          </div>
        ) : !p.listError ? (
          <>
            <div className="fc-erp-table-scroll mt-4 overflow-x-auto rounded-xl border border-zinc-800/90">
              <table className="min-w-[760px] w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-3">Pessoa</th>
                    <th className="px-3 py-3">Papel</th>
                    <th className="px-3 py-3 hidden md:table-cell">Vínculo</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 hidden lg:table-cell">CNH</th>
                    <th className="px-3 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {p.listLoading ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6">
                        <SkeletonRows rows={4} />
                      </td>
                    </tr>
                  ) : p.displayUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                        Nenhum registro encontrado.
                      </td>
                    </tr>
                  ) : (
                    p.displayUsers.map((u) => (
                      <tr key={u.id} className="border-b border-zinc-800/80 hover:bg-zinc-900/40">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar imageUrl={resolveBackendAssetUrl(u.profile_image_url)} name={u.nome} size="list" />
                            <div>
                              <p className="font-medium text-zinc-100">{u.nome}</p>
                              <p className="text-xs text-zinc-500">{u.email || u.cpf_id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-zinc-400">{roleLabel(u.role)}</td>
                        <td className="px-3 py-3 text-xs text-zinc-400 hidden md:table-cell">
                          {u.role === "MOTORISTA" && (u.veiculo_placa || u.veiculo_nome) ? (
                            <span>
                              {u.veiculo_placa} {u.veiculo_nome ? `· ${u.veiculo_nome}` : ""}
                            </span>
                          ) : u.equipamento_vinculo ? (
                            <span>Equip.: {u.equipamento_vinculo}</span>
                          ) : u.operacao_escopo ? (
                            <span>Operação: {u.operacao_escopo}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusPessoaClass(
                              u.status_operacional || "ativo"
                            )}`}
                          >
                            {u.status_operacional || "ativo"}
                          </span>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          {u.role === "MOTORISTA" ? (
                            (() => {
                              const st = getCnhStatus(u.cnh_validade);
                              return (
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cnhBadgeClass(st)}`}
                                >
                                  {cnhStatusLabel(st)}
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => p.openEdit(u)}
                            className="rounded-md border border-zinc-600 px-2 py-1 text-xs font-medium text-zinc-200 hover:border-zinc-500"
                          >
                            Editar perfil
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <PaginationControls
              page={p.page}
              totalPages={p.totalPages}
              onPrev={() => p.setPage((x) => Math.max(1, x - 1))}
              onNext={() => p.setPage((x) => Math.min(p.totalPages, x + 1))}
            />
          </>
        ) : null}
      </section>
      </AccordionSection>

      {p.panelOpen && p.selected ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/55 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Editar perfil operacional"
        >
          <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950 shadow-2xl sm:max-h-[96vh] sm:rounded-xl sm:border">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h3 className="text-base font-semibold text-zinc-100">Perfil profissional</h3>
              <button
                type="button"
                onClick={p.closePanel}
                className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-4 px-4 py-4">
              {p.saveError ? (
                <p className="rounded-md border border-rose-800/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">
                  {p.saveError}
                </p>
              ) : null}

              <div className="flex items-center gap-3">
                <Avatar imageUrl={resolveBackendAssetUrl(p.form.profile_image_url)} name={p.form.nome} size="header" />
                <p className="text-xs text-zinc-500">URL da foto (opcional)</p>
              </div>
              <label className="block text-xs font-medium text-zinc-400">
                Foto — URL
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                  value={p.form.profile_image_url}
                  onChange={(e) => p.setForm((f) => ({ ...f, profile_image_url: e.target.value }))}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-zinc-400 sm:col-span-2">
                  Nome completo
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={p.form.nome}
                    onChange={(e) => p.setForm((f) => ({ ...f, nome: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  E-mail
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={p.form.email}
                    onChange={(e) => p.setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  CPF / ID
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={p.form.cpf_id}
                    onChange={(e) => p.setForm((f) => ({ ...f, cpf_id: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Papel
                  <select
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={p.form.role}
                    onChange={(e) => {
                      const role = e.target.value;
                      p.setForm((f) => ({
                        ...f,
                        role,
                        cnh_numero: role === "MOTORISTA" ? f.cnh_numero : "",
                        cnh_categoria: role === "MOTORISTA" ? f.cnh_categoria : "",
                        cnh_validade: role === "MOTORISTA" ? f.cnh_validade : "",
                        veiculo_id: role === "MOTORISTA" ? f.veiculo_id : "",
                      }));
                    }}
                  >
                    <option value="MOTORISTA">Motorista</option>
                    <option value="APONTADOR">Apontador</option>
                    <option value="ADMIN_EMPRESA">Administrador</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Status operacional
                  <select
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={p.form.status_operacional}
                    onChange={(e) => p.setForm((f) => ({ ...f, status_operacional: e.target.value }))}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="afastado">Afastado</option>
                    <option value="suspenso">Suspenso</option>
                  </select>
                </label>
                {p.form.role === "MOTORISTA" ? (
                  <label className="block text-xs font-medium text-zinc-400 sm:col-span-2">
                    Veículo vinculado
                    <select
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                      value={p.form.veiculo_id}
                      disabled={p.vehiclesPicklistLoading}
                      onChange={(e) => p.setForm((f) => ({ ...f, veiculo_id: e.target.value }))}
                    >
                      <option value="">
                        {p.vehiclesPicklistLoading ? "Carregando veículos…" : "— Selecionar —"}
                      </option>
                      {p.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.placa} · {v.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="block text-xs font-medium text-zinc-400 sm:col-span-2">
                  Função / cargo operacional
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={p.form.funcao}
                    onChange={(e) => p.setForm((f) => ({ ...f, funcao: e.target.value }))}
                    placeholder="Ex.: Motorista transporte, Operador escavadeira…"
                  />
                </label>
                {p.form.role === "MOTORISTA" ? (
                  <>
                    <label className="block text-xs font-medium text-zinc-400 sm:col-span-2">
                      Número CNH
                      <input
                        required
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        value={p.form.cnh_numero}
                        onChange={(e) => p.setForm((f) => ({ ...f, cnh_numero: e.target.value }))}
                      />
                    </label>
                    <label className="block text-xs font-medium text-zinc-400">
                      Categoria CNH
                      <select
                        required
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        value={p.form.cnh_categoria}
                        onChange={(e) => p.setForm((f) => ({ ...f, cnh_categoria: e.target.value }))}
                      >
                        <option value="">— Selecionar —</option>
                        {CNH_CATEGORIAS.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-zinc-400">
                      Validade da CNH (vencimento)
                      <input
                        type="date"
                        required
                        placeholder="Ex: 12/08/2026"
                        title="Ex: 12/08/2026"
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        value={p.form.cnh_validade}
                        onChange={(e) => p.setForm((f) => ({ ...f, cnh_validade: e.target.value }))}
                      />
                      <span className="mt-1 block text-[11px] font-normal text-zinc-500">
                        Data de vencimento da carteira de habilitação
                      </span>
                    </label>
                    {p.form.cnh_validade ? (
                      <p className="sm:col-span-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cnhBadgeClass(
                            getCnhStatus(p.form.cnh_validade)
                          )}`}
                        >
                          {cnhStatusLabel(getCnhStatus(p.form.cnh_validade))}
                        </span>
                      </p>
                    ) : null}
                  </>
                ) : null}
                <label className="block text-xs font-medium text-zinc-400 sm:col-span-2">
                  Equipamento vinculado (operador)
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={p.form.equipamento_vinculo}
                    onChange={(e) => p.setForm((f) => ({ ...f, equipamento_vinculo: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400 sm:col-span-2">
                  Escopo da operação (apontador)
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={p.form.operacao_escopo}
                    onChange={(e) => p.setForm((f) => ({ ...f, operacao_escopo: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400 sm:col-span-2">
                  Observações internas
                  <textarea
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={p.form.observacoes}
                    onChange={(e) => p.setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400 sm:col-span-2">
                  Nova senha (opcional)
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={p.form.senha}
                    onChange={(e) => p.setForm((f) => ({ ...f, senha: e.target.value }))}
                  />
                </label>
              </div>

              <div className="border-t border-zinc-800 pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Treinamentos</p>
                  <button
                    type="button"
                    onClick={() => p.addTreinoRow()}
                    className="text-xs font-medium text-amber-300 hover:text-amber-200"
                  >
                    + Adicionar
                  </button>
                </div>
                <ul className="mt-2 space-y-2">
                  {(p.form.treinamentos || []).map((t, idx) => (
                    <li key={idx} className="flex flex-wrap gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2">
                      <input
                        placeholder="Título"
                        className="min-w-[8rem] flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                        value={t.titulo}
                        onChange={(e) =>
                          p.setForm((f) => {
                            const tr = [...(f.treinamentos || [])];
                            tr[idx] = { ...tr[idx], titulo: e.target.value };
                            return { ...f, treinamentos: tr };
                          })
                        }
                      />
                      <input
                        type="date"
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                        value={t.validade}
                        onChange={(e) =>
                          p.setForm((f) => {
                            const tr = [...(f.treinamentos || [])];
                            tr[idx] = { ...tr[idx], validade: e.target.value };
                            return { ...f, treinamentos: tr };
                          })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => p.removeTreinoRow(idx)}
                        className="text-xs text-rose-400 hover:text-rose-300"
                      >
                        remover
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="fc-empresa-sticky-actions sticky bottom-0 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
              <button
                type="button"
                disabled={p.saving}
                onClick={() => p.savePerson()}
                className="w-full rounded-lg bg-amber-500/90 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
              >
                {p.saving ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </BIDashboardShell>
  );
}
