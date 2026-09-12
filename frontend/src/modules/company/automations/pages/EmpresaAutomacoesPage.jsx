import { useEffect, useState } from "react";
import BIDashboardShell from "../../bi/components/BIDashboardShell";
import AccordionSection from "../../shared/components/AccordionSection";
import EmpresaModuleErrorPanel from "../../shared/components/EmpresaModuleErrorPanel";
import EmptyState from "../../../../components/EmptyState";
import SkeletonRows from "../../../../components/SkeletonRows";
import ConfirmActionModal from "../../../../components/ConfirmActionModal";
import { useEmpresaAutomations } from "../hooks/useEmpresaAutomations";
import { automationsErrorMessage } from "../utils/automationsApi";

const COMMON_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Bahia",
  "America/Rio_Branco",
  "America/Noronha",
  "America/New_York",
  "America/Bogota",
  "Europe/Lisbon",
  "UTC",
];

function ConfiguredBadge({ configured }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        configured
          ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
          : "border-zinc-600/60 bg-zinc-900/60 text-zinc-500"
      }`}
    >
      {configured ? "Configurado" : "Não configurado"}
    </span>
  );
}

function StatusBadge({ ativo }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        ativo
          ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
          : "border-zinc-600/60 bg-zinc-900/60 text-zinc-400"
      }`}
    >
      {ativo ? "Ativa" : "Inativa"}
    </span>
  );
}

function emptyDocumentoFormState() {
  return {
    referenciaContratual: "",
    local: "",
    clienteRazaoSocial: "",
    clienteEndereco: "",
    responsavelTecnico: "",
    expedienteInicio: "",
    expedienteFim: "",
  };
}

function emptyFormState() {
  return {
    automacao_id: "",
    nome: "",
    projeto_nome: "",
    ativo: true,
    timezone: "America/Sao_Paulo",
    horario_fechamento: "",
    telegram_chat_id: "",
    google_drive_pasta_raiz_id: "",
    usa_ia: true,
    documento: emptyDocumentoFormState(),
  };
}

/** Só inclui campos preenchidos (Zod exige min(1) quando presente — nunca envia string vazia). */
function buildDocumentoPayload(documento) {
  const result = {};
  for (const [key, value] of Object.entries(documento || {})) {
    const trimmed = typeof value === "string" ? value.trim() : value;
    if (trimmed) result[key] = trimmed;
  }
  return result;
}

function ApproversSection({ config, busy, onAdd, onRemove }) {
  const [nome, setNome] = useState("");
  const [telegramUserId, setTelegramUserId] = useState("");
  const [localError, setLocalError] = useState("");

  async function handleAdd(event) {
    event.preventDefault();
    setLocalError("");
    if (!telegramUserId.trim()) {
      setLocalError("Informe o Telegram User ID do aprovador.");
      return;
    }
    try {
      await onAdd({ nome: nome.trim() || null, telegram_user_id: telegramUserId.trim() });
      setNome("");
      setTelegramUserId("");
    } catch (err) {
      setLocalError(automationsErrorMessage(err, "Não foi possível adicionar o aprovador."));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Aprovadores via Telegram — apenas cadastro nesta fase. Nenhuma mensagem real será enviada.
      </p>
      <ul className="space-y-2">
        {(config.aprovadores || []).map((ap) => (
          <li
            key={ap.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-700/70 bg-zinc-900/50 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-zinc-100">{ap.nome || "Aprovador sem nome"}</p>
              <p className="text-xs text-zinc-500">Telegram User ID: {ap.telegram_user_id}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge ativo={ap.ativo} />
              <button
                type="button"
                className="fc-btn fc-btn-empresa-ghost px-2 py-1 text-xs"
                disabled={busy}
                onClick={() => onRemove(ap.id)}
              >
                Remover
              </button>
            </div>
          </li>
        ))}
        {!config.aprovadores?.length ? <p className="text-sm text-zinc-500">Nenhum aprovador cadastrado ainda.</p> : null}
      </ul>
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={handleAdd}>
        <input
          className="fc-input"
          placeholder="Nome (opcional)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <input
          className="fc-input"
          placeholder="Telegram User ID"
          value={telegramUserId}
          onChange={(e) => setTelegramUserId(e.target.value)}
        />
        <button type="submit" className="fc-btn fc-btn-empresa-secondary" disabled={busy}>
          Adicionar
        </button>
      </form>
      {localError ? <p className="text-xs text-red-400">{localError}</p> : null}
    </div>
  );
}

function RecipientsSection({ config, busy, onAdd, onRemove }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [tipo, setTipo] = useState("TO");
  const [localError, setLocalError] = useState("");

  async function handleAdd(event) {
    event.preventDefault();
    setLocalError("");
    if (!email.trim()) {
      setLocalError("Informe o e-mail do destinatário.");
      return;
    }
    try {
      await onAdd({ nome: nome.trim() || null, email: email.trim(), tipo });
      setNome("");
      setEmail("");
      setTipo("TO");
    } catch (err) {
      setLocalError(automationsErrorMessage(err, "Não foi possível adicionar o destinatário."));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">Nenhum e-mail será enviado nesta fase — apenas cadastro de destinatários.</p>
      <ul className="space-y-2">
        {(config.destinatarios || []).map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-700/70 bg-zinc-900/50 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-zinc-100">{d.nome || d.email}</p>
              <p className="text-xs text-zinc-500">{d.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-zinc-600 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300">
                {d.tipo}
              </span>
              <StatusBadge ativo={d.ativo} />
              <button
                type="button"
                className="fc-btn fc-btn-empresa-ghost px-2 py-1 text-xs"
                disabled={busy}
                onClick={() => onRemove(d.id)}
              >
                Remover
              </button>
            </div>
          </li>
        ))}
        {!config.destinatarios?.length ? <p className="text-sm text-zinc-500">Nenhum destinatário cadastrado ainda.</p> : null}
      </ul>
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]" onSubmit={handleAdd}>
        <input
          className="fc-input"
          placeholder="Nome (opcional)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <input
          className="fc-input"
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select className="fc-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="TO">Para (TO)</option>
          <option value="CC">Cópia (CC)</option>
        </select>
        <button type="submit" className="fc-btn fc-btn-empresa-secondary" disabled={busy}>
          Adicionar
        </button>
      </form>
      {localError ? <p className="text-xs text-red-400">{localError}</p> : null}
    </div>
  );
}

function AutomationDrawer({ open, onClose, catalog, config, busy, onCreate, onUpdate, onAddApprover, onRemoveApprover, onAddRecipient, onRemoveRecipient }) {
  const [form, setForm] = useState(emptyFormState());
  const [savedConfig, setSavedConfig] = useState(config || null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSavedConfig(config || null);
    setFormError("");
    if (config) {
      const documento = config.configuracao?.documento || {};
      setForm({
        automacao_id: String(config.automacao_id),
        nome: config.nome || "",
        projeto_nome: config.projeto_nome || "",
        ativo: config.ativo,
        timezone: config.timezone || "America/Sao_Paulo",
        horario_fechamento: config.horario_fechamento ? config.horario_fechamento.slice(0, 5) : "",
        telegram_chat_id: config.telegram_chat_id || "",
        google_drive_pasta_raiz_id: config.google_drive_pasta_raiz_id || "",
        usa_ia: config.usa_ia,
        documento: {
          referenciaContratual: documento.referenciaContratual || "",
          local: documento.local || "",
          clienteRazaoSocial: documento.clienteRazaoSocial || "",
          clienteEndereco: documento.clienteEndereco || "",
          responsavelTecnico: documento.responsavelTecnico || "",
          expedienteInicio: documento.expedienteInicio || "",
          expedienteFim: documento.expedienteFim || "",
        },
      });
    } else {
      setForm({ ...emptyFormState(), automacao_id: catalog[0]?.id ? String(catalog[0].id) : "" });
    }
  }, [open, config, catalog]);

  if (!open) return null;

  const isEditing = Boolean(savedConfig?.id);

  function field(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function fieldDocumento(key, value) {
    setForm((prev) => ({ ...prev, documento: { ...prev.documento, [key]: value } }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    const payload = {
      automacao_id: Number(form.automacao_id),
      nome: form.nome.trim(),
      projeto_nome: form.projeto_nome.trim() || null,
      ativo: form.ativo,
      timezone: form.timezone,
      horario_fechamento: form.horario_fechamento || null,
      telegram_chat_id: form.telegram_chat_id.trim() || null,
      google_drive_pasta_raiz_id: form.google_drive_pasta_raiz_id.trim() || null,
      usa_ia: form.usa_ia,
      configuracao_documento: buildDocumentoPayload(form.documento),
    };
    try {
      if (isEditing) {
        const updated = await onUpdate(savedConfig.id, payload);
        setSavedConfig((prev) => ({ ...prev, ...updated }));
      } else {
        const created = await onCreate(payload);
        setSavedConfig({ ...created, aprovadores: [], destinatarios: [] });
      }
    } catch (err) {
      setFormError(automationsErrorMessage(err, "Não foi possível salvar a automação."));
    }
  }

  async function handleAddApprover(payload) {
    const approver = await onAddApprover(savedConfig.id, payload);
    setSavedConfig((prev) => ({ ...prev, aprovadores: [...(prev.aprovadores || []), approver] }));
  }

  async function handleRemoveApprover(approverId) {
    await onRemoveApprover(savedConfig.id, approverId);
    setSavedConfig((prev) => ({ ...prev, aprovadores: (prev.aprovadores || []).filter((a) => a.id !== approverId) }));
  }

  async function handleAddRecipient(payload) {
    const recipient = await onAddRecipient(savedConfig.id, payload);
    setSavedConfig((prev) => ({ ...prev, destinatarios: [...(prev.destinatarios || []), recipient] }));
  }

  async function handleRemoveRecipient(recipientId) {
    await onRemoveRecipient(savedConfig.id, recipientId);
    setSavedConfig((prev) => ({ ...prev, destinatarios: (prev.destinatarios || []).filter((d) => d.id !== recipientId) }));
  }

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/70" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar" onClick={onClose} />
      <div className="relative z-[1] flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="fc-erp-eyebrow">Automações</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-100">
              {isEditing ? `Editar — ${savedConfig.nome}` : "Nova automação"}
            </h2>
          </div>
          <button type="button" className="fc-btn fc-btn-empresa-ghost px-3 py-1.5 text-sm" onClick={onClose}>
            Fechar
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <AccordionSection id="secao-geral" title="Geral" defaultOpenDesktop defaultOpenMobile>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-zinc-400">Nome da configuração</span>
                <input
                  className="fc-input w-full"
                  value={form.nome}
                  onChange={(e) => field("nome", e.target.value)}
                  placeholder="Ex.: Diário de Obra — PPFlora"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-zinc-400">Tipo de automação</span>
                <select
                  className="fc-input w-full"
                  value={form.automacao_id}
                  onChange={(e) => field("automacao_id", e.target.value)}
                  required
                >
                  {catalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-zinc-400">Projeto / obra</span>
                <input
                  className="fc-input w-full"
                  value={form.projeto_nome}
                  onChange={(e) => field("projeto_nome", e.target.value)}
                  placeholder="Ex.: PPFlora"
                />
              </label>
              <label className="flex items-center gap-2 self-end text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => field("ativo", e.target.checked)}
                />
                Automação ativa
              </label>
            </div>
          </AccordionSection>

          <AccordionSection id="secao-fechamento" title="Fechamento" description="Horário e fuso do fechamento diário">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-zinc-400">Horário de fechamento</span>
                <input
                  type="time"
                  className="fc-input w-full"
                  value={form.horario_fechamento}
                  onChange={(e) => field("horario_fechamento", e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-zinc-400">Timezone (IANA)</span>
                <input
                  className="fc-input w-full"
                  list="fc-timezone-options"
                  value={form.timezone}
                  onChange={(e) => field("timezone", e.target.value)}
                  placeholder="America/Sao_Paulo"
                />
                <datalist id="fc-timezone-options">
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
              </label>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              O fechamento diário ainda não é executado automaticamente — este horário será usado por um bloco futuro.
            </p>
          </AccordionSection>

          <AccordionSection id="secao-telegram" title="Telegram" description="Identificação pública do grupo — nunca um token">
            <label className="block text-sm">
              <span className="mb-1 flex items-center gap-2 text-xs text-zinc-400">
                Chat ID do grupo
                <ConfiguredBadge configured={Boolean(form.telegram_chat_id)} />
              </span>
              <input
                className="fc-input w-full"
                value={form.telegram_chat_id}
                onChange={(e) => field("telegram_chat_id", e.target.value)}
                placeholder="Ex.: -1001234567890"
                inputMode="numeric"
              />
            </label>
            <p className="mt-2 text-xs text-zinc-500">
              Nenhum webhook será configurado nesta fase — o bot ainda não está conectado.
            </p>
          </AccordionSection>

          <AccordionSection id="secao-armazenamento" title="Armazenamento" description="Pasta raiz no Google Drive">
            <label className="block text-sm">
              <span className="mb-1 flex items-center gap-2 text-xs text-zinc-400">
                ID da pasta raiz do Drive
                <ConfiguredBadge configured={Boolean(form.google_drive_pasta_raiz_id)} />
              </span>
              <input
                className="fc-input w-full"
                value={form.google_drive_pasta_raiz_id}
                onChange={(e) => field("google_drive_pasta_raiz_id", e.target.value)}
                placeholder="ID da pasta no Google Drive"
              />
            </label>
            <p className="mt-2 text-xs text-zinc-500">Nenhuma integração com o Google Drive foi ativada nesta fase.</p>
          </AccordionSection>

          <AccordionSection id="secao-processamento" title="Processamento" description="Uso de IA na estruturação do relatório">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={form.usa_ia} onChange={(e) => field("usa_ia", e.target.checked)} />
              Usar IA para estruturar o relatório
            </label>
            <p className="mt-2 text-xs text-zinc-500">
              Nenhuma chamada de IA será feita nesta fase — apenas a preferência é registrada.
            </p>
          </AccordionSection>

          <AccordionSection
            id="secao-diario-obra"
            title="Dados do Diário de Obra"
            description="Campos usados na geração do documento (Excel/PDF) — todos opcionais aqui, mas necessários para gerar o documento"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-zinc-400">Referência contratual</span>
                <input
                  className="fc-input w-full"
                  value={form.documento.referenciaContratual}
                  onChange={(e) => fieldDocumento("referenciaContratual", e.target.value)}
                  placeholder="Ex.: Contrato 01/2026"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-zinc-400">Local</span>
                <input
                  className="fc-input w-full"
                  value={form.documento.local}
                  onChange={(e) => fieldDocumento("local", e.target.value)}
                  placeholder="Ex.: Canteiro Central"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-zinc-400">Razão social do cliente</span>
                <input
                  className="fc-input w-full"
                  value={form.documento.clienteRazaoSocial}
                  onChange={(e) => fieldDocumento("clienteRazaoSocial", e.target.value)}
                  placeholder="Ex.: Cliente LTDA"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-zinc-400">Endereço do cliente</span>
                <input
                  className="fc-input w-full"
                  value={form.documento.clienteEndereco}
                  onChange={(e) => fieldDocumento("clienteEndereco", e.target.value)}
                  placeholder="Ex.: Rua Exemplo, 100"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-xs text-zinc-400">Responsável técnico (opcional — assinatura do documento)</span>
                <input
                  className="fc-input w-full"
                  value={form.documento.responsavelTecnico}
                  onChange={(e) => fieldDocumento("responsavelTecnico", e.target.value)}
                  placeholder="Ex.: Eng. Fulano de Tal"
                />
                <span className="mt-1 block text-xs text-zinc-500">
                  Nome exibido na assinatura do documento — diferente do(s) Aprovador(es) do Telegram, cadastrados na seção
                  “Aprovação”.
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-zinc-400">Expediente — início</span>
                <input
                  type="time"
                  className="fc-input w-full"
                  value={form.documento.expedienteInicio}
                  onChange={(e) => fieldDocumento("expedienteInicio", e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-zinc-400">Expediente — fim</span>
                <input
                  type="time"
                  className="fc-input w-full"
                  value={form.documento.expedienteFim}
                  onChange={(e) => fieldDocumento("expedienteFim", e.target.value)}
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Nenhum documento é gerado nesta fase — estes dados só serão usados quando a geração for executada.
            </p>
          </AccordionSection>

          {formError ? <p className="text-sm text-red-400">{formError}</p> : null}

          <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
            <button type="button" className="fc-btn fc-btn-empresa-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="fc-btn fc-btn-empresa-primary" disabled={busy}>
              {isEditing ? "Salvar alterações" : "Criar automação"}
            </button>
          </div>
        </form>

        <div className="mt-4 space-y-4">
          <AccordionSection id="secao-aprovacao" title="Aprovação" description="Aprovadores via Telegram" defaultOpenDesktop={false}>
            {isEditing ? (
              <ApproversSection config={savedConfig} busy={busy} onAdd={handleAddApprover} onRemove={handleRemoveApprover} />
            ) : (
              <p className="text-sm text-zinc-500">Salve a automação primeiro para cadastrar aprovadores.</p>
            )}
          </AccordionSection>

          <AccordionSection id="secao-distribuicao" title="Distribuição" description="Destinatários TO/CC" defaultOpenDesktop={false}>
            {isEditing ? (
              <RecipientsSection config={savedConfig} busy={busy} onAdd={handleAddRecipient} onRemove={handleRemoveRecipient} />
            ) : (
              <p className="text-sm text-zinc-500">Salve a automação primeiro para cadastrar destinatários.</p>
            )}
          </AccordionSection>
        </div>
      </div>
    </div>
  );
}

export function EmpresaAutomacoesPage() {
  const automations = useEmpresaAutomations();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerConfig, setDrawerConfig] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);

  function openCreate() {
    setDrawerConfig(null);
    setDrawerOpen(true);
  }

  async function openEdit(config) {
    const detail = await automations.fetchConfigDetail(config.id);
    setDrawerConfig(detail);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    automations.reload();
  }

  async function handleToggleStatus(config) {
    await automations.toggleStatus(config.id, !config.ativo);
    automations.reload();
  }

  async function handleConfirmDelete() {
    if (!confirmTarget) return;
    await automations.removeConfig(confirmTarget.id);
    setConfirmTarget(null);
    automations.reload();
  }

  const hasConfigs = automations.configs.length > 0;

  return (
    <BIDashboardShell
      eyebrow="Painel administrativo"
      title="Automações"
      lead="Cadastre e gerencie automações operacionais reutilizáveis — nesta fase apenas a configuração é preparada, sem execução real."
      headerAside={
        <button type="button" className="fc-btn fc-btn-empresa-primary" onClick={openCreate}>
          Nova automação
        </button>
      }
    >
      <div className="mt-6 space-y-4">
        {automations.error ? (
          <EmpresaModuleErrorPanel description={automations.error} onRetry={automations.reload} />
        ) : automations.loading ? (
          <div className="fc-card p-5">
            <SkeletonRows rows={4} />
          </div>
        ) : !hasConfigs ? (
          <EmptyState
            title="Nenhuma automação cadastrada"
            description="Clique em “Nova automação” para configurar a primeira, por exemplo um Diário de Obra."
          />
        ) : (
          <div className="fc-card overflow-hidden">
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60 text-xs text-zinc-400">
                    <th className="px-4 py-3 font-medium">Nome</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Projeto</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Fechamento</th>
                    <th className="px-4 py-3 font-medium">Timezone</th>
                    <th className="px-4 py-3 font-medium">Aprovadores</th>
                    <th className="px-4 py-3 font-medium">Destinatários</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {automations.configs.map((config) => (
                    <tr key={config.id} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                      <td className="px-4 py-3 font-medium text-zinc-100">{config.nome}</td>
                      <td className="px-4 py-3 text-zinc-300">{config.automacao_nome}</td>
                      <td className="px-4 py-3 text-zinc-300">{config.projeto_nome || "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge ativo={config.ativo} />
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {config.horario_fechamento ? config.horario_fechamento.slice(0, 5) : "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{config.timezone}</td>
                      <td className="px-4 py-3 text-zinc-300">{config.aprovadores_ativos}</td>
                      <td className="px-4 py-3 text-zinc-300">{config.destinatarios_ativos}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            className="fc-btn fc-btn-empresa-ghost px-2.5 py-1 text-xs"
                            onClick={() => openEdit(config)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="fc-btn fc-btn-empresa-ghost px-2.5 py-1 text-xs"
                            onClick={() => handleToggleStatus(config)}
                          >
                            {config.ativo ? "Desativar" : "Ativar"}
                          </button>
                          <button
                            type="button"
                            className="fc-btn fc-btn-empresa-alert px-2.5 py-1 text-xs"
                            onClick={() => setConfirmTarget(config)}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-zinc-900 lg:hidden">
              {automations.configs.map((config) => (
                <div key={config.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-100">{config.nome}</p>
                      <p className="text-xs text-zinc-500">{config.automacao_nome}</p>
                    </div>
                    <StatusBadge ativo={config.ativo} />
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                    <div>
                      <dt>Projeto</dt>
                      <dd className="text-zinc-200">{config.projeto_nome || "—"}</dd>
                    </div>
                    <div>
                      <dt>Fechamento</dt>
                      <dd className="text-zinc-200">
                        {config.horario_fechamento ? config.horario_fechamento.slice(0, 5) : "—"} ({config.timezone})
                      </dd>
                    </div>
                    <div>
                      <dt>Aprovadores</dt>
                      <dd className="text-zinc-200">{config.aprovadores_ativos}</dd>
                    </div>
                    <div>
                      <dt>Destinatários</dt>
                      <dd className="text-zinc-200">{config.destinatarios_ativos}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" className="fc-btn fc-btn-empresa-ghost text-xs" onClick={() => openEdit(config)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="fc-btn fc-btn-empresa-ghost text-xs"
                      onClick={() => handleToggleStatus(config)}
                    >
                      {config.ativo ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      className="fc-btn fc-btn-empresa-alert text-xs"
                      onClick={() => setConfirmTarget(config)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AutomationDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        catalog={automations.catalog}
        config={drawerConfig}
        busy={automations.actionBusy}
        onCreate={automations.createConfig}
        onUpdate={automations.updateConfig}
        onAddApprover={automations.addApprover}
        onRemoveApprover={automations.removeApprover}
        onAddRecipient={automations.addRecipient}
        onRemoveRecipient={automations.removeRecipient}
      />

      <ConfirmActionModal
        open={Boolean(confirmTarget)}
        title="Excluir automação"
        description={`A configuração "${confirmTarget?.nome || ""}" será removida da listagem.`}
        consequence="O histórico é preservado internamente (nunca é apagado fisicamente) — apenas deixa de ser listado ou editável."
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirmTarget(null)}
      />
    </BIDashboardShell>
  );
}

export default EmpresaAutomacoesPage;
