/**
 * Catálogo de relatórios por área — navegação para módulos existentes ou foco na listagem (tipo).
 * Não altera regras de negócio: apenas organiza o acesso ao que já existe na API/UI.
 */

export const REPORT_HUB_CATEGORIES = [
  {
    id: "transporte",
    label: "Transporte",
    items: [
      { id: "tr_prod", label: "Produção", hint: "Metas e resumo no módulo", action: { kind: "link", to: "/empresa/transporte" } },
      { id: "tr_rom", label: "Romaneios", hint: "Fichas e exportações", action: { kind: "filterTipo", tipo: "romaneio" } },
      { id: "tr_meta", label: "Metas", action: { kind: "link", to: "/empresa/transporte" } },
      { id: "tr_produt", label: "Produtividade", action: { kind: "link", to: "/empresa/transporte" } },
    ],
  },
  {
    id: "combustivel",
    label: "Combustível",
    items: [
      { id: "cb_consumo", label: "Consumo", action: { kind: "link", to: "/empresa/combustivel" } },
      { id: "cb_custos", label: "Custos", action: { kind: "link", to: "/empresa/combustivel" } },
      { id: "cb_medias", label: "Médias", action: { kind: "link", to: "/empresa/combustivel" } },
      { id: "cb_rank", label: "Ranking", action: { kind: "link", to: "/empresa/combustivel" } },
      { id: "cb_fichas", label: "Fichas (registros)", action: { kind: "filterTipo", tipo: "combustivel" } },
    ],
  },
  {
    id: "parte_diaria",
    label: "Parte diária",
    items: [
      { id: "pd_check", label: "Checklist", action: { kind: "link", to: "/empresa/parte-diaria" } },
      { id: "pd_ocorr", label: "Ocorrências", action: { kind: "link", to: "/empresa/parte-diaria" } },
      { id: "pd_hori", label: "Horímetros", action: { kind: "link", to: "/empresa/parte-diaria" } },
      { id: "pd_fichas", label: "Fichas (registros)", action: { kind: "filterTipo", tipo: "parte_diaria" } },
    ],
  },
  {
    id: "frota",
    label: "Frota",
    items: [
      { id: "fl_veic", label: "Veículos", action: { kind: "link", to: "/empresa/frota" } },
      { id: "fl_manut", label: "Manutenção", hint: "Planejado", action: { kind: "link", to: "/empresa/frota" } },
      { id: "fl_doc", label: "Documentação", hint: "Planejado", action: { kind: "link", to: "/empresa/frota" } },
    ],
  },
  {
    id: "pessoas",
    label: "Pessoas",
    items: [
      { id: "ps_mot", label: "Motoristas", action: { kind: "link", to: "/empresa/pessoas" } },
      { id: "ps_prod", label: "Produtividade", action: { kind: "link", to: "/empresa/pessoas" } },
      { id: "ps_hist", label: "Histórico", action: { kind: "link", to: "/empresa/pessoas" } },
    ],
  },
];
