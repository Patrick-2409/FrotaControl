/**
 * Serviço de domínio — transporte / produção (romaneios, viagens, planejamento).
 * Encapsula modelos; rotas e controllers não importam `viagemModel`/`planejamentoModel` diretamente.
 */
const viagemModel = require("../models/viagemModel");
const planejamentoModel = require("../models/planejamentoModel");

module.exports = {
  getViagensResumoProducao: viagemModel.getViagensResumoProducao,
  utcBoundsFromDateRangeYmd: viagemModel.utcBoundsFromDateRangeYmd,
  insertPlanejamento: planejamentoModel.insertPlanejamento,
  getPlanejamentoAtual: planejamentoModel.getPlanejamentoAtual,
  toYmd: planejamentoModel.toYmd,
};
