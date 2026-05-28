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

const pct = (parte, total) => {
  const t = toNumber(total);
  if (t <= 0) return 0;
  return Math.round((toNumber(parte) / t) * 1000) / 10;
};

const computeMetricasExecutivas = (indicadores = {}, insights = {}) => {
  const totalLitros = toNumber(indicadores.totalLitros);
  const destaque = insights?.veiculoDestaque;
  const totalFrota =
    toNumber(indicadores.totalVeiculosTransporte) + toNumber(indicadores.totalVeiculosApoio) ||
    toNumber(indicadores.veiculosConsiderados);

  return {
    concentracaoConsumoPct: destaque && totalLitros > 0 ? pct(destaque.totalLitros, totalLitros) : 0,
    ociosidadePct: totalFrota > 0 ? pct(indicadores.veiculosOciosos, totalFrota) : 0,
    participacaoTransporteLitrosPct: totalLitros > 0 ? pct(indicadores.totalLitrosTransporte, totalLitros) : 0,
    utilizacaoFrotaPct: totalFrota > 0 ? pct(indicadores.veiculosAtivos, totalFrota) : 0,
    veiculoDestaqueNome: destaque?.nome || null,
    veiculoDestaqueLitros: toNumber(destaque?.totalLitros),
  };
};

const hasInconsistenciaCritica = (inconsistencias = [], insights = {}) =>
  inconsistencias.length > 0 ||
  insights.producaoSemConsumo ||
  insights.consumoSemProducao ||
  insights.operacaoParada;

const buildResumoExecutivoFallback = ({ indicadores = {}, insights = {}, inconsistencias = [], metricas = {} }) => {
  if (hasInconsistenciaCritica(inconsistencias, insights)) {
    const principal = inconsistencias[0] || "divergência entre produção e consumo";
    return (
      `O fator dominante do período é ERRO DE DADO: ${principal}. ` +
      `Enquanto a inconsistência não for corrigida, conclusões de eficiência operacional ficam comprometidas. ` +
      `Prioridade imediata: reconciliar lançamentos de viagens e abastecimentos de transporte antes de qualquer decisão de custo.`
    );
  }

  if (metricas.concentracaoConsumoPct >= 50 && metricas.veiculoDestaqueNome) {
    return (
      `A operação concentra ${metricas.concentracaoConsumoPct}% do consumo no veículo ${metricas.veiculoDestaqueNome} ` +
      `(${metricas.veiculoDestaqueLitros.toFixed(1)} L), elevando risco de parada se esse ativo ficar indisponível. ` +
      `Utilização da frota em ${metricas.utilizacaoFrotaPct}% com ociosidade de ${metricas.ociosidadePct}%.`
    );
  }

  if (toNumber(indicadores.veiculosOciosos) > 0) {
    return (
      `Há ${toNumber(indicadores.veiculosOciosos)} veículo(s) ocioso(s) (${metricas.ociosidadePct}% da frota), ` +
      `indicando capacidade ociosa que pressiona custo fixo sem retorno operacional no recorte.`
    );
  }

  return (
    `Operação com utilização de ${metricas.utilizacaoFrotaPct}% da frota e ` +
    `${metricas.participacaoTransporteLitrosPct}% do consumo em veículos de transporte. ` +
    `Sem inconsistências críticas detectadas no período analisado.`
  );
};

const buildDiagnosticoFallback = ({ indicadores = {}, insights = {}, inconsistencias = [], metricas = {} }) => {
  const partes = [];

  if (hasInconsistenciaCritica(inconsistencias, insights)) {
    partes.push(
      `Diagnóstico técnico: ${inconsistencias.length} inconsistência(s) — principal: ${inconsistencias[0]}. ` +
        `Risco operacional: decisões baseadas em produção ou consumo isolados podem gerar ação incorreta (penalizar veículo de apoio ou ignorar falha de integração).`
    );
  }

  if (metricas.concentracaoConsumoPct > 0 && metricas.veiculoDestaqueNome) {
    partes.push(
      `Concentração de ${metricas.concentracaoConsumoPct}% do consumo em ${metricas.veiculoDestaqueNome} ` +
        `(${metricas.veiculoDestaqueLitros.toFixed(1)} L de ${toNumber(indicadores.totalLitros).toFixed(1)} L totais).`
    );
  }

  if (toNumber(indicadores.veiculosOciosos) > 0) {
    partes.push(
      `Ociosidade: ${toNumber(indicadores.veiculosOciosos)} veículo(s) (${metricas.ociosidadePct}% da frota) sem viagem, abastecimento ou parte diária no período.`
    );
  }

  if (insights.producaoSemConsumo) {
    partes.push(
      `Produção sem consumo: ${toNumber(indicadores.totalViagensTransporte)} viagem(ns) de transporte com 0 L registrados — integração ou lançamento incompleto.`
    );
  }

  if (insights.consumoSemProducao) {
    partes.push(
      `Consumo sem produção: ${toNumber(indicadores.totalLitrosTransporte).toFixed(1)} L em transporte sem viagens — validar tipo_operacao do veículo.`
    );
  }

  return partes.length
    ? partes.join(" ")
    : `Diagnóstico: operação estável com utilização de ${metricas.utilizacaoFrotaPct}% e sem divergências críticas entre produção e consumo.`;
};

const buildAcoesFallback = ({ indicadores = {}, insights = {}, inconsistencias = [] }) => {
  const acoes = [];

  if (insights.producaoSemConsumo || inconsistencias.some((i) => /produção sem consumo/i.test(i))) {
    acoes.push(
      `Cruzar ${toNumber(indicadores.totalViagensTransporte)} viagem(ns) de transporte com abastecimentos do período e registrar os lançamentos faltantes ainda hoje.`
    );
  }
  if (insights.consumoSemProducao || inconsistencias.some((i) => /consumo sem produção/i.test(i))) {
    acoes.push(
      `Conferir veículos com ${toNumber(indicadores.totalLitrosTransporte).toFixed(1)} L em transporte sem viagens: corrigir tipo_operacao para apoio ou incluir viagens omitidas.`
    );
  }
  inconsistencias
    .filter((item) => !/produção sem consumo|consumo sem produção/i.test(item))
    .forEach((item) => {
      acoes.push(`Corrigir ERRO DE DADO: ${item}`);
    });

  if (insights.veiculoDestaque?.nome) {
    acoes.push(
      `Auditar ${toNumber(insights.veiculoDestaque.totalLitros).toFixed(1)} L do veículo ${insights.veiculoDestaque.nome} e comparar com média da frota no mesmo período.`
    );
  }
  if (toNumber(indicadores.veiculosOciosos) > 0) {
    acoes.push(
      `Redistribuir ${toNumber(indicadores.veiculosOciosos)} veículo(s) ocioso(s) para frentes com demanda ativa ou desmobilizar temporariamente.`
    );
  }

  if (!acoes.length) {
    acoes.push("Manter conciliação diária entre viagens de transporte e abastecimentos para prevenir novas inconsistências.");
  }

  return acoes;
};

const looksLikeKpiRepetition = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return true;
  const kpiPatterns = [
    /consumo total de \d/i,
    /custo de r\$/i,
    /preço médio de r\$/i,
    /total de \d+(\.\d+)? l/i,
    /\d+ viagem\(ns\)\./i,
  ];
  const matches = kpiPatterns.filter((rx) => rx.test(raw)).length;
  return matches >= 2 && raw.length < 280;
};

const enrichRelatorioExecutivo = (relatorio = {}, data = {}) => {
  const indicadores = data?.indicadores || {};
  const insights = data?.insights || {};
  const inconsistencias = [
    ...(data?.insights?.inconsistenciasDetectadas || []),
    ...(relatorio.inconsistencias || []),
  ];
  const uniqueInconsistencias = [...new Set(inconsistencias.filter(Boolean))];
  const metricas = computeMetricasExecutivas(indicadores, insights);
  const temErro = hasInconsistenciaCritica(uniqueInconsistencias, insights);

  const resumoFallback = buildResumoExecutivoFallback({
    indicadores,
    insights,
    inconsistencias: uniqueInconsistencias,
    metricas,
  });
  const diagnosticoFallback = buildDiagnosticoFallback({
    indicadores,
    insights,
    inconsistencias: uniqueInconsistencias,
    metricas,
  });
  const acoesFallback = buildAcoesFallback({ indicadores, insights, inconsistencias: uniqueInconsistencias });

  let resumoExecutivo = String(relatorio.resumoExecutivo || "").trim();
  if (!resumoExecutivo || looksLikeKpiRepetition(resumoExecutivo) || temErro) {
    resumoExecutivo = resumoFallback;
  }

  let diagnosticoDetalhado = String(relatorio.diagnosticoDetalhado || "").trim();
  if (!diagnosticoDetalhado || looksGenericDiagnostico(diagnosticoDetalhado)) {
    diagnosticoDetalhado = diagnosticoFallback;
  }

  const acoes = (relatorio.acoes || []).filter((item) => item && !isGenericAction(item));
  const acoesFinal = acoes.length ? acoes : acoesFallback;

  const riscos = [...(relatorio.riscos || [])];
  if (temErro && !riscos.some((r) => /erro de dado|inconsist/i.test(r))) {
    riscos.unshift(
      "Risco operacional: decisões tomadas com dados inconsistentes entre produção e consumo podem gerar custo indevido ou parada não planejada."
    );
  }

  return {
    ...relatorio,
    resumoExecutivo,
    diagnosticoDetalhado,
    problemaPrincipal: diagnosticoDetalhado,
    acoes: acoesFinal,
    riscos: riscos.length ? riscos : relatorio.riscos,
    inconsistencias: uniqueInconsistencias,
    metricasExecutivas: metricas,
    prioridadeInconsistencia: temErro,
  };
};

const GENERIC_ACTION_RX = [/\bavaliar\b/i, /\bverificar\b/i, /^avaliar/i, /^verificar/i, /considerar a possibilidade/i];

const isGenericAction = (text) => GENERIC_ACTION_RX.some((rx) => rx.test(String(text || "")));

const looksGenericDiagnostico = (text) => {
  const raw = String(text || "").trim();
  return raw.length < 40 || (!/%|percentual|concentração|risco/i.test(raw) && !/\d/.test(raw));
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
  computeMetricasExecutivas,
  buildResumoExecutivoFallback,
  buildDiagnosticoFallback,
  buildAcoesFallback,
  enrichRelatorioExecutivo,
  looksLikeKpiRepetition,
  hasInconsistenciaCritica,
};
