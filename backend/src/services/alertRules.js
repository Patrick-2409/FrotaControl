/**
 * Regras puras de alertas operacionais (sem I/O).
 * Severidades: info | warning | critical
 */

const SEVERITY_RANK = { critical: 3, warning: 2, info: 1 };

const sortBySeverity = (items) =>
  [...items].sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0));

/**
 * @param {object} s sinais agregados pelo notificationService
 * @returns {Array<{ alert_key: string, severity: string, category: string, title: string, body: string, payload?: object }>}
 */
function buildAlertsFromSignals(s) {
  const out = [];

  if (s.veiculos_sem_capacidade > 0) {
    out.push({
      alert_key: "fleet.veiculos_sem_capacidade",
      severity: "warning",
      category: "frota",
      title: "Veículos de transporte sem capacidade",
      body: `${s.veiculos_sem_capacidade} veículo(ns) marcados para transporte sem capacidade (t) definida.`,
      payload: { count: s.veiculos_sem_capacidade },
    });
  }

  if (s.custo_alto) {
    out.push({
      alert_key: "transport.custo_por_tonelada_alto",
      severity: "critical",
      category: "transporte",
      title: "Custo por tonelada elevado",
      body: "O custo de combustível por tonelada produzida no período está acima do limiar configurado.",
      payload: {},
    });
  }

  if (s.meta_risco) {
    out.push({
      alert_key: "transport.meta_abaixo_planejado",
      severity: "critical",
      category: "transporte",
      title: "Produção abaixo da meta planejada",
      body: "Execução global do planejamento atual ficou abaixo do limiar de segurança (90%).",
      payload: {},
    });
  }

  if (s.transport_veiculos > 0 && s.romaneios_72h === 0) {
    out.push({
      alert_key: "transport.ausencia_lancamentos_romaneios",
      severity: "warning",
      category: "transporte",
      title: "Ausência de lançamentos de romaneio",
      body: "Não há romaneios registados nas últimas 72 horas, apesar de existir frota de transporte.",
      payload: { horas: 72 },
    });
  }

  if (s.produtividade_queda) {
    out.push({
      alert_key: "transport.baixa_produtividade_semanal",
      severity: "warning",
      category: "transporte",
      title: "Queda brusca de produtividade",
      body: "A produção da semana atual caiu significativamente face à semana anterior.",
      payload: {},
    });
  }

  const comb = s.combustivel || {};
  if (comb.consumo_elevado_count > 0) {
    out.push({
      alert_key: "combustivel.consumo_abastecimento_atipico",
      severity: "warning",
      category: "combustivel",
      title: "Consumo ou abastecimento fora do padrão",
      body: "Veículos com consumo acima do esperado ou padrão atípico no período — rever lançamentos e possíveis anomalias.",
      payload: { veiculos: comb.consumo_elevado_count },
    });
  }
  if (comb.preco_acima_media || comb.preco_fora_historico) {
    out.push({
      alert_key: "combustivel.preco_elevado",
      severity: "warning",
      category: "combustivel",
      title: "Preço por litro elevado",
      body: "O preço médio pago por litro está acima da referência do período ou do histórico.",
      payload: {},
    });
  }
  if (comb.consumo_alto_periodo) {
    out.push({
      alert_key: "combustivel.consumo_alto_periodo",
      severity: "info",
      category: "combustivel",
      title: "Consumo total elevado no período",
      body: "O volume total abastecido no período está acima do esperado para a operação.",
      payload: {},
    });
  }

  for (const m of s.motoristas_sem_lancamento || []) {
    const nome = m?.nome ?? m;
    const mid = m?.id ?? nome;
    out.push({
      alert_key: `pessoas.motorista_sem_romaneio:${mid}`,
      severity: "warning",
      category: "pessoas",
      title: "Motorista sem lançamentos recentes",
      body: `${nome} não tem romaneios nas últimas 72 horas.`,
      payload: { motorista: nome, usuario_id: m?.id },
    });
  }

  for (const m of s.motoristas_baixa_atividade || []) {
    const nome = m?.nome ?? m;
    const mid = m?.id ?? nome;
    out.push({
      alert_key: `pessoas.motorista_baixa_atividade:${mid}`,
      severity: "info",
      category: "pessoas",
      title: "Baixa atividade operacional",
      body: `${nome} registou menos romaneios esta semana face à anterior.`,
      payload: { motorista: nome, usuario_id: m?.id },
    });
  }

  for (const row of s.cnh_proximas || []) {
    out.push({
      alert_key: `pessoas.cnh_vencendo:${row.id}`,
      severity: row.dias <= 14 ? "critical" : "warning",
      category: "pessoas",
      title: "CNH a vencer",
      body: `${row.nome}: validade em ${row.dias} dia(s).`,
      payload: { usuario_id: row.id, dias: row.dias },
    });
  }

  for (const row of s.docs_proximos || []) {
    out.push({
      alert_key: `frota.documentacao_revisao:${row.id}`,
      severity: row.dias <= 14 ? "critical" : "warning",
      category: "frota",
      title: "Revisão / documentação a vencer",
      body: `Veículo ${row.placa || row.nome}: revisão em ${row.dias} dia(s).`,
      payload: { veiculo_id: row.id, dias: row.dias, doc: "revisao" },
    });
  }

  for (const row of s.doc_licenciamento_proximos || []) {
    out.push({
      alert_key: `frota.licenciamento:${row.id}`,
      severity: row.dias <= 14 ? "critical" : "warning",
      category: "frota",
      title: "Licenciamento a vencer",
      body: `Veículo ${row.placa || row.nome}: licenciamento em ${row.dias} dia(s).`,
      payload: { veiculo_id: row.id, dias: row.dias },
    });
  }

  for (const row of s.doc_seguro_proximos || []) {
    out.push({
      alert_key: `frota.seguro:${row.id}`,
      severity: row.dias <= 14 ? "critical" : "warning",
      category: "frota",
      title: "Seguro a vencer",
      body: `Veículo ${row.placa || row.nome}: seguro em ${row.dias} dia(s).`,
      payload: { veiculo_id: row.id, dias: row.dias },
    });
  }

  for (const row of s.doc_inspecao_proximos || []) {
    out.push({
      alert_key: `frota.inspecao:${row.id}`,
      severity: row.dias <= 14 ? "critical" : "warning",
      category: "frota",
      title: "Inspeção / vistoria a vencer",
      body: `Veículo ${row.placa || row.nome}: inspeção em ${row.dias} dia(s).`,
      payload: { veiculo_id: row.id, dias: row.dias },
    });
  }

  for (const row of s.manut_pendentes || []) {
    out.push({
      alert_key: `frota.manutencao:${row.id}`,
      severity: row.dias < 0 ? "critical" : "warning",
      category: "frota",
      title: "Manutenção pendente",
      body: `Veículo ${row.placa || row.nome}: data limite em ${row.dias} dia(s).`,
      payload: { veiculo_id: row.id, dias: row.dias },
    });
  }

  for (const row of s.veiculos_inativos || []) {
    out.push({
      alert_key: `frota.veiculo_inativo:${row.id}`,
      severity: "info",
      category: "frota",
      title: "Veículo inativo",
      body: `${row.placa || row.nome}: sem movimento operacional (romaneio/combustível/parte diária) há mais de 14 dias.`,
      payload: { veiculo_id: row.id },
    });
  }

  return sortBySeverity(out);
}

module.exports = {
  buildAlertsFromSignals,
  SEVERITY_RANK,
};
