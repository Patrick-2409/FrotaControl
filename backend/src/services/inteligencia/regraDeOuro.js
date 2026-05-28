const {
  hasInconsistenciaCritica,
  detectInconsistenciasOperacionais,
  trimText,
} = require("./operacionalRules");

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ensureList = (value) =>
  Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];

const normalizeInconsistenciasDetalhadas = (items = []) =>
  items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const veiculo = item.veiculo || item.nome || "";
      const tipo = item.tipo || item.categoria || "";
      const mensagem = item.mensagem || item.descricao || "";
      return [tipo, veiculo, mensagem].filter(Boolean).join(" — ");
    })
    .filter(Boolean);

const resolveEscopoVazio = (indicadores = {}, tipoAnalise = "geral") => {
  const tipo = String(tipoAnalise || "geral").toLowerCase();
  const litros = toNumber(indicadores.totalLitros);
  const viagens = toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens);
  const veiculos = toNumber(indicadores.veiculosConsiderados);

  if (tipo === "combustivel") return litros <= 0 && veiculos <= 0;
  if (tipo === "transporte") {
    return viagens <= 0 && toNumber(indicadores.totalLitrosTransporte) <= 0 && veiculos <= 0;
  }
  if (tipo === "frota") {
    return (
      toNumber(indicadores.totalParteDiaria) <= 0 &&
      toNumber(indicadores.veiculosAtivosApoio) <= 0 &&
      veiculos <= 0
    );
  }
  return litros <= 0 && viagens <= 0 && veiculos <= 0;
};

const avaliarRegraDeOuro = ({
  indicadores = {},
  insights = {},
  inconsistencias = [],
  inconsistenciasDetalhadas = [],
  periodo = {},
  tipoAnalise = "geral",
  contextoOperacional = null,
} = {}) => {
  const detectadas = detectInconsistenciasOperacionais({ indicadores, insights });
  const listaTexto = [
    ...ensureList(inconsistencias),
    ...ensureList(insights.inconsistenciasDetectadas),
    ...normalizeInconsistenciasDetalhadas(inconsistenciasDetalhadas),
    ...detectadas.inconsistencias,
  ];
  const uniqueInconsistencias = [...new Set(listaTexto.filter(Boolean))];

  const haInconsistencia =
    uniqueInconsistencias.length > 0 ||
    hasInconsistenciaCritica(uniqueInconsistencias, insights) ||
    inconsistenciasDetalhadas.length > 0;

  const contextoTeste = Boolean(insights.contextoTeste || contextoOperacional?.baseEmTeste);
  const escopoVazio = resolveEscopoVazio(indicadores, tipoAnalise);
  const veiculosConsiderados = toNumber(indicadores.veiculosConsiderados);
  const periodoCurto = periodo?.tipo === "dia" || periodo?.tipo === "semana";

  const motivosInsuficiencia = [];
  if (escopoVazio) {
    motivosInsuficiencia.push("Não há lançamentos operacionais suficientes no recorte selecionado.");
  }
  if (veiculosConsiderados === 0 && !escopoVazio) {
    motivosInsuficiencia.push("Nenhum veículo considerado no escopo — revisar filtros ou cadastros.");
  }
  if (contextoTeste) {
    motivosInsuficiencia.push(
      "Base em fase inicial (frota pequena ou período curto) — padrão operacional ainda não consolidado."
    );
  }
  if (periodoCurto && !escopoVazio) {
    motivosInsuficiencia.push("Período curto (dia/semana) limita comparação e tendência.");
  }
  if (tipoAnalise === "transporte" && !indicadores.dadosTransporteDisponiveis) {
    motivosInsuficiencia.push("Dados de transporte indisponíveis para o escopo solicitado.");
  }

  const dadosSuficientes = !escopoVazio && motivosInsuficiencia.length === 0;

  const motivosInconsistencia = [];
  if (haInconsistencia) {
    if (detectadas.producaoSemConsumo) {
      motivosInconsistencia.push(
        "Produção de transporte sem consumo correspondente — possível lançamento omitido ou integração falha."
      );
    }
    if (detectadas.consumoSemProducao) {
      motivosInconsistencia.push(
        "Consumo de transporte sem viagens — verificar tipo_operacao (apoio vs transporte) ou viagens não registradas."
      );
    }
    uniqueInconsistencias.slice(0, 3).forEach((item) => {
      if (!motivosInconsistencia.some((m) => m.includes(item.slice(0, 40)))) {
        motivosInconsistencia.push(item);
      }
    });
  }

  let confiavelParaDecisao = dadosSuficientes && !haInconsistencia;
  if (contextoTeste && confiavelParaDecisao) {
    confiavelParaDecisao = false;
    motivosInsuficiencia.push("Decisões estruturais exigem histórico maior que a base atual de teste.");
  }

  const partesPorque = [];
  if (!dadosSuficientes) {
    partesPorque.push(`Dados insuficientes porque: ${motivosInsuficiencia.join(" ")}`);
  } else {
    partesPorque.push("Volume e recorte permitem leitura operacional no período.");
  }

  if (haInconsistencia) {
    partesPorque.push(
      `Há inconsistência porque: ${motivosInconsistencia.slice(0, 2).join(" ")} Indicadores de eficiência podem estar distorcidos até reconciliação.`
    );
  } else {
    partesPorque.push("Cruzamento viagens × abastecimento não apontou divergência crítica no escopo.");
  }

  if (!confiavelParaDecisao) {
    partesPorque.push(
      "Não é confiável tomar decisão estrutural agora — priorize correção de dados ou amplie o período antes de cortes ou realocações definitivas."
    );
  } else {
    partesPorque.push("É confiável orientar decisões táticas com os números atuais, mantendo conciliação diária.");
  }

  const explicacaoPorque = trimText(partesPorque.join(" "), 680);

  return {
    dadosSuficientes,
    haInconsistencia,
    confiavelParaDecisao,
    explicacaoPorque,
    motivosInsuficiencia,
    motivosInconsistencia,
    inconsistenciasDetectadas: uniqueInconsistencias,
  };
};

const pickAiExplicacao = (raw) => {
  const nested = raw?.regra_de_ouro || raw?.regraDeOuro;
  const text =
    raw?.explicacao_porque ||
    raw?.explicacaoPorque ||
    nested?.explicacao_porque ||
    nested?.explicacaoPorque ||
    "";
  return String(text || "").trim();
};

const aplicarRegraDeOuroNoRelatorio = (relatorio = {}, data = {}) => {
  const indicadores = data?.indicadores || {};
  const insights = data?.insights || {};
  const regra = avaliarRegraDeOuro({
    indicadores,
    insights,
    inconsistencias: [
      ...(data?.inconsistencias || []),
      ...(data?.insights?.inconsistenciasDetectadas || []),
      ...(relatorio.inconsistencias || []),
    ],
    inconsistenciasDetalhadas:
      data?.inconsistenciasDetalhadas ||
      data?.insights?.inconsistenciasDetalhadas ||
      data?.inconsistencias_detalhadas ||
      [],
    periodo: data?.periodo || {},
    tipoAnalise: data?.tipoAnalise || "geral",
    contextoOperacional: insights.contextoOperacional || data?.contextoOperacional || null,
  });

  const aiExplicacao = pickAiExplicacao(relatorio);
  const explicacaoPorque =
    aiExplicacao && aiExplicacao.length >= 40 && !/^dados insuficientes\.?$/i.test(aiExplicacao)
      ? trimText(aiExplicacao, 680)
      : regra.explicacaoPorque;

  return {
    ...relatorio,
    regraDeOuro: {
      dadosSuficientes: regra.dadosSuficientes,
      haInconsistencia: regra.haInconsistencia,
      confiavelParaDecisao: regra.confiavelParaDecisao,
      explicacaoPorque,
      motivosInsuficiencia: regra.motivosInsuficiencia,
      motivosInconsistencia: regra.motivosInconsistencia,
    },
    dadosSuficientes: regra.dadosSuficientes,
    haInconsistencia: regra.haInconsistencia,
    confiavelParaDecisao: regra.confiavelParaDecisao,
    explicacaoPorque,
    prioridadeInconsistencia: regra.haInconsistencia,
  };
};

module.exports = {
  avaliarRegraDeOuro,
  aplicarRegraDeOuroNoRelatorio,
};
