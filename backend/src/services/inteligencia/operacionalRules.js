const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const TIPO_OPERACAO_TRANSPORTE = "transporte";
const TIPO_OPERACAO_APOIO = "apoio";

const resolveTipoOperacaoVeiculo = (alias = "v") => `
  COALESCE(
    NULLIF(LOWER(TRIM(${alias}.tipo_operacao)), ''),
    CASE WHEN COALESCE(${alias}.usa_para_transporte, false) = true THEN '${TIPO_OPERACAO_TRANSPORTE}' ELSE '${TIPO_OPERACAO_APOIO}' END
  )
`;

const buildTransportVehiclePredicate = (alias = "v") => `${resolveTipoOperacaoVeiculo(alias)} = '${TIPO_OPERACAO_TRANSPORTE}'`;

const buildApoioVehiclePredicate = (alias = "v") => `${resolveTipoOperacaoVeiculo(alias)} = '${TIPO_OPERACAO_APOIO}'`;

const isPeriodoCurto = (periodo) => periodo === "dia" || periodo === "semana";

const detectContextoTeste = ({ indicadores = {}, periodo = "mes" }) => {
  const veiculosAtivos = toNumber(indicadores.veiculosAtivos);
  return veiculosAtivos <= 3 || isPeriodoCurto(periodo);
};

const MENSAGEM_CONTEXTO_TESTE =
  "ATENÇÃO: A base analisada está em fase inicial de alimentação (ambiente de teste). As análises apresentadas são preliminares e não representam ainda um padrão operacional consolidado.";

const detectInconsistenciasOperacionais = ({ indicadores = {}, insights = {} }) => {
  const inconsistencias = [];
  const litros = toNumber(indicadores.totalLitros);
  const valor = toNumber(indicadores.totalValor);
  const precoMedio = toNumber(indicadores.precoMedio);
  const viagensTransporte = toNumber(indicadores.totalViagensTransporte);
  const litrosTransporte = toNumber(indicadores.totalLitrosTransporte);
  const dadosTransporteDisponiveis = Boolean(indicadores.dadosTransporteDisponiveis);

  if (litros < 0) inconsistencias.push("totalLitros negativo.");
  if (valor < 0) inconsistencias.push("totalValor negativo.");
  if (precoMedio < 0) inconsistencias.push("precoMedio negativo.");
  if (litros === 0 && valor > 0) inconsistencias.push("valor informado com litros zerados.");
  if (litros > 0 && valor === 0) inconsistencias.push("litros informados com valor zerado.");
  if (precoMedio > 0 && (litros <= 0 || valor <= 0)) {
    inconsistencias.push("precoMedio informado sem base válida em litros e valor.");
  }
  if (!dadosTransporteDisponiveis && (viagensTransporte > 0 || litrosTransporte > 0)) {
    inconsistencias.push("dados de transporte marcados como indisponíveis com indicadores de transporte preenchidos.");
  }

  const producaoSemConsumo =
    dadosTransporteDisponiveis && viagensTransporte > 0 && litrosTransporte === 0;
  const consumoSemProducao =
    dadosTransporteDisponiveis && litrosTransporte > 0 && viagensTransporte === 0;

  if (producaoSemConsumo) {
    inconsistencias.push(
      "produção sem consumo: viagens de transporte registradas sem abastecimento correspondente no período (possível erro de lançamento ou integração)."
    );
  }
  if (consumoSemProducao) {
    inconsistencias.push(
      "consumo sem produção: abastecimento de transporte sem viagens no período (verificar se é veículo de apoio ou falha de registro)."
    );
  }

  return {
    inconsistencias,
    producaoSemConsumo,
    consumoSemProducao,
  };
};

const resolveStatusOperacao = ({ indicadores = {}, insights = {}, inconsistencias = [] }) => {
  const hasInconsistencia =
    inconsistencias.length > 0 ||
    insights.producaoSemConsumo ||
    insights.consumoSemProducao ||
    insights.operacaoParada;

  if (hasInconsistencia) {
    return {
      nivel: "CRITICO",
      label: "CRÍTICO",
      color: "#B91C1C",
      descricao: "Inconsistência de dados ou risco operacional crítico detectado.",
    };
  }

  const ociosos = toNumber(indicadores.veiculosOciosos);
  const contextoTeste = Boolean(insights.contextoTeste);

  if (ociosos > 0 || contextoTeste) {
    return {
      nivel: "ATENCAO",
      label: "ATENÇÃO",
      color: "#B45309",
      descricao: contextoTeste
        ? "Base em fase inicial; interpretar indicadores como preliminares."
        : "Operação com ociosidade ou risco moderado.",
    };
  }

  return {
    nivel: "SAUDAVEL",
    label: "SAUDÁVEL",
    color: "#15803D",
    descricao: "Indicadores dentro do padrão esperado para o recorte analisado.",
  };
};

const buildEscopoAnalise = (tipoAnalise = "geral", filtros = {}) => {
  const veiculoFiltrado = filtros?.veiculoId != null;
  if (veiculoFiltrado) {
    return {
      escopo: "veiculo",
      instrucao:
        "Análise individual do veículo filtrado. Não generalizar para toda a frota. Separar transporte (produção) e apoio (sem produção) conforme tipo_operacao.",
    };
  }
  if (tipoAnalise === "combustivel") {
    return {
      escopo: "combustivel",
      instrucao: "Analisar SOMENTE consumo e custo de combustível. Não avaliar produção/viagens.",
    };
  }
  if (tipoAnalise === "transporte") {
    return {
      escopo: "transporte",
      instrucao:
        "Analisar SOMENTE produção (viagens) de veículos tipo_operacao=transporte. Não misturar consumo de apoio nem atribuir eficiência operacional a apoio.",
    };
  }
  if (tipoAnalise === "frota") {
    return {
      escopo: "frota",
      instrucao:
        "Analisar SOMENTE frota de apoio (tipo_operacao=apoio): utilização, ociosidade e parte diária. Apoio NÃO possui produção.",
    };
  }
  return {
    escopo: "geral",
    instrucao:
      "Análise completa separada por módulos: combustível (consumo), transporte (produção), apoio (sem produção). Nunca misturar contextos.",
  };
};

module.exports = {
  TIPO_OPERACAO_TRANSPORTE,
  TIPO_OPERACAO_APOIO,
  resolveTipoOperacaoVeiculo,
  buildTransportVehiclePredicate,
  buildApoioVehiclePredicate,
  detectContextoTeste,
  MENSAGEM_CONTEXTO_TESTE,
  detectInconsistenciasOperacionais,
  resolveStatusOperacao,
  buildEscopoAnalise,
  isPeriodoCurto,
};
