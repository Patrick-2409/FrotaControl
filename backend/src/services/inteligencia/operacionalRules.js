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

const resolvePeriodoTipo = (periodo) => {
  if (typeof periodo === "string") return periodo;
  return periodo?.tipo || "mes";
};

const gerarContexto = (dados = {}) => {
  const veiculos = Array.isArray(dados.veiculos)
    ? dados.veiculos
    : Array.isArray(dados)
      ? dados
      : [];
  const indicadores = dados.indicadores || {};
  const periodo = dados.periodo || {};

  const totalVeiculos =
    toNumber(indicadores.totalVeiculosEscopo) ||
    toNumber(indicadores.veiculosConsiderados) ||
    veiculos.length;

  const veiculosAtivos =
    toNumber(indicadores.veiculosAtivos) ||
    veiculos.filter((v) => {
      if (typeof v?.ativo === "boolean") return v.ativo;
      return toNumber(v?.viagens) > 0 || toNumber(v?.litros) > 0;
    }).length;

  const periodoInicial = periodo.inicio || periodo.inicial || null;
  const periodoFinal = periodo.fim || periodo.final || null;
  const baseEmTeste = totalVeiculos < 5;

  return {
    totalVeiculos,
    veiculosAtivos,
    periodoInicial,
    periodoFinal,
    baseEmTeste,
  };
};

const detectContextoTeste = ({ indicadores = {}, periodo = "mes", contexto = null } = {}) => {
  const ctx =
    contexto ||
    gerarContexto({
      indicadores,
      periodo: typeof periodo === "object" ? periodo : {},
    });
  const periodoTipo = resolvePeriodoTipo(periodo);
  return ctx.baseEmTeste || ctx.veiculosAtivos <= 3 || isPeriodoCurto(periodoTipo);
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
    toNumber(indicadores.totalVeiculosEscopo) ||
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

const trimText = (text, max = 420) => {
  const raw = String(text || "").trim();
  if (raw.length <= max) return raw;
  const cut = raw.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf(";"));
  return (lastStop > 80 ? cut.slice(0, lastStop + 1) : `${cut}…`).trim();
};

const buildResumoExecutivoFallback = ({ indicadores = {}, insights = {}, inconsistencias = [], metricas = {} }) => {
  if (hasInconsistenciaCritica(inconsistencias, insights)) {
    const principal = inconsistencias[0] || "divergência entre produção e consumo";
    return trimText(
      `Decisão imediata: tratar ERRO DE DADO (${principal}) antes de qualquer corte de custo. ` +
        `Causa provável: lançamento omitido ou tipo_operacao incorreto. ` +
        `Consequência: indicadores de eficiência inválidos até reconciliação.`
    );
  }

  if (metricas.concentracaoConsumoPct >= 50 && metricas.veiculoDestaqueNome) {
    return trimText(
      `Decisão: reduzir dependência do veículo ${metricas.veiculoDestaqueNome} (${metricas.concentracaoConsumoPct}% do consumo). ` +
        `Causa: concentração operacional. Consequência: parada desse ativo impacta ${metricas.concentracaoConsumoPct}% do abastecimento.`
    );
  }

  if (toNumber(indicadores.veiculosOciosos) > 0) {
    return trimText(
      `Decisão: realocar ou desmobilizar ${toNumber(indicadores.veiculosOciosos)} veículo(s) ociosos (${metricas.ociosidadePct}% da frota). ` +
        `Causa: ausência de viagem, abastecimento e parte diária no período. Consequência: custo fixo sem retorno.`
    );
  }

  return trimText(
    `Decisão: manter operação no padrão atual (utilização ${metricas.utilizacaoFrotaPct}%). ` +
      `Insight: consumo de transporte representa ${metricas.participacaoTransporteLitrosPct}% do total sem inconsistências críticas.`
  );
};

const buildDiagnosticoFallback = ({ indicadores = {}, insights = {}, inconsistencias = [], metricas = {} }) => {
  const bullets = [];

  if (hasInconsistenciaCritica(inconsistencias, insights)) {
    bullets.push(
      `• Inconsistência (${inconsistencias.length}x): ${inconsistencias[0]} — risco: decisão errada sobre eficiência.`
    );
  }
  if (metricas.concentracaoConsumoPct >= 40 && metricas.veiculoDestaqueNome) {
    bullets.push(`• Concentração ${metricas.concentracaoConsumoPct}% em ${metricas.veiculoDestaqueNome}.`);
  }
  if (toNumber(indicadores.veiculosOciosos) > 0) {
    bullets.push(`• Ociosidade ${metricas.ociosidadePct}% (${toNumber(indicadores.veiculosOciosos)} veículo(s)).`);
  }
  if (insights.producaoSemConsumo) {
    bullets.push(`• ${toNumber(indicadores.totalViagensTransporte)} viagem(ns) sem consumo registrado.`);
  }
  if (insights.consumoSemProducao) {
    bullets.push(`• ${toNumber(indicadores.totalLitrosTransporte).toFixed(1)} L de transporte sem viagens.`);
  }

  return bullets.length
    ? trimText(bullets.join(" "), 500)
    : `• Operação estável: utilização ${metricas.utilizacaoFrotaPct}% sem divergência crítica.`;
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
    /foram consumidos/i,
    /total valor/i,
    /total litros/i,
  ];
  const matches = kpiPatterns.filter((rx) => rx.test(raw)).length;
  return matches >= 2 || (matches >= 1 && !/decisão|causa|consequência|insight|risco|prioridade/i.test(raw));
};

const looksLikeDataDescription = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return true;
  return looksLikeKpiRepetition(raw) || (/^a operação registrou/i.test(raw) && !/decisão|porque|portanto|logo/i.test(raw));
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

  let resumoExecutivo = trimText(String(relatorio.resumoExecutivo || "").trim(), 420);
  if (!resumoExecutivo || looksLikeDataDescription(resumoExecutivo) || temErro) {
    resumoExecutivo = resumoFallback;
  }

  let diagnosticoDetalhado = trimText(String(relatorio.diagnosticoDetalhado || "").trim(), 500);
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

const buildScopedIndicadores = (indicadores = {}, tipoAnalise = "geral") => {
  const all = { ...indicadores };
  if (tipoAnalise === "combustivel") {
    return {
      totalLitros: all.totalLitros,
      totalValor: all.totalValor,
      precoMedio: all.precoMedio,
      totalLitrosTransporte: all.totalLitrosTransporte,
      totalLitrosApoio: all.totalLitrosApoio,
      veiculosConsiderados: all.veiculosConsiderados,
    };
  }
  if (tipoAnalise === "transporte") {
    return {
      totalViagensTransporte: all.totalViagensTransporte,
      totalLitrosTransporte: all.totalLitrosTransporte,
      dadosTransporteDisponiveis: all.dadosTransporteDisponiveis,
      veiculosAtivosTransporte: all.veiculosAtivosTransporte,
      veiculosOciososTransporte: all.veiculosOciososTransporte,
      totalVeiculosTransporte: all.totalVeiculosTransporte,
    };
  }
  if (tipoAnalise === "frota") {
    return {
      veiculosAtivosApoio: all.veiculosAtivosApoio,
      veiculosOciososApoio: all.veiculosOciososApoio,
      totalVeiculosApoio: all.totalVeiculosApoio,
      totalVeiculosEscopo: all.totalVeiculosEscopo,
      totalLitrosApoio: all.totalLitrosApoio,
      totalParteDiaria: all.totalParteDiaria,
      veiculosAtivos: all.veiculosAtivos,
      veiculosOciosos: all.veiculosOciosos,
    };
  }
  return all;
};

const filterModulosByScope = (modulos = {}, tipoAnalise = "geral") => {
  const full = modulos || {};
  if (tipoAnalise === "combustivel") return { combustivel: full.combustivel || "" };
  if (tipoAnalise === "transporte") return { transporte: full.transporte || "" };
  if (tipoAnalise === "frota") return { apoio: full.apoio || full.frota || "" };
  return full;
};

const buildScopedDataForAi = (data = {}) => {
  const tipo = data?.tipoAnalise || "geral";
  const escopo = buildEscopoAnalise(tipo, data?.filtros);
  return {
    periodo: data?.periodo,
    tipoAnalise: tipo,
    escopo_analise: escopo,
    filtros: data?.filtros,
    indicadores: buildScopedIndicadores(data?.indicadores || {}, tipo),
    insights: {
      veiculoDestaque: data?.insights?.veiculoDestaque,
      contextoTeste: data?.insights?.contextoTeste,
      contextoOperacional: data?.insights?.contextoOperacional || data?.contextoOperacional,
      insightsAutomaticos: data?.insights?.insightsAutomaticos || data?.insights_automaticos || [],
      producaoSemConsumo: data?.insights?.producaoSemConsumo,
      consumoSemProducao: data?.insights?.consumoSemProducao,
      metricasExecutivas: data?.insights?.metricasExecutivas || data?.metricasExecutivas,
    },
    inconsistencias: data?.insights?.inconsistenciasDetectadas || data?.inconsistencias || [],
    modulos_permitidos: escopo.escopo,
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
  gerarContexto,
  resolvePeriodoTipo,
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
  looksLikeDataDescription,
  hasInconsistenciaCritica,
  buildScopedIndicadores,
  buildScopedDataForAi,
  filterModulosByScope,
  trimText,
};
