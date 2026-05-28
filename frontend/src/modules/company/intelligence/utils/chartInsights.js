import { REPORT_COLORS, reportColorByIndex } from "./reportChartColors";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmtNum = (value, digits = 0) =>
  toNumber(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fmtMoney = (value) => toNumber(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (value) => `${fmtNum(value, 1)}%`;

const compactDate = (iso) => {
  const raw = String(iso || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [, mm, dd] = raw.split("-");
    return `${dd}/${mm}`;
  }
  return raw;
};

export const CHART_LEGEND_ITEMS = {
  custo: { color: REPORT_COLORS.line, label: "Custo diário (R$) — azul", short: "Custo (R$)" },
  media: { color: REPORT_COLORS.media, label: "Média diária — laranja (referência)", short: "Média" },
  consumo: { color: REPORT_COLORS.consumo, label: "Consumo (litros) — vermelho", short: "Consumo (L)" },
  producao: { color: REPORT_COLORS.producao, label: "Produção (viagens) — verde", short: "Produção" },
  registros: { color: REPORT_COLORS.primary, label: "Registros de parte diária — azul", short: "Registros" },
  horas: { color: REPORT_COLORS.success, label: "Horas operacionais — verde", short: "Horas" },
};

export function buildPieLegendItems(pieData = []) {
  const total = pieData.reduce((acc, item) => acc + toNumber(item?.value), 0);
  return pieData.map((item, index) => {
    const value = toNumber(item?.value);
    const percent = total > 0 ? (value / total) * 100 : 0;
    return {
      color: reportColorByIndex(index),
      label: item?.name || "Veículo",
      value: `${fmtNum(value, 1)} L`,
      detail: fmtPct(percent),
    };
  });
}

export function buildPieDiscussion(pieData = []) {
  const total = pieData.reduce((acc, item) => acc + toNumber(item?.value), 0);
  if (!pieData.length || total === 0) return ["Sem consumo registrado no período filtrado."];
  const ranked = pieData
    .map((item) => ({
      name: item?.name || "Veículo",
      value: toNumber(item?.value),
      percent: total > 0 ? (toNumber(item?.value) / total) * 100 : 0,
    }))
    .sort((a, b) => b.percent - a.percent);
  const top = ranked[0];
  const points = [
    `Total analisado: ${fmtNum(total, 1)} L em ${ranked.length} veículo(s).`,
    `Maior participação: ${top.name} com ${fmtPct(top.percent)} (${fmtNum(top.value, 1)} L).`,
  ];
  if (top.percent >= 45) {
    points.push(`Concentração elevada: um único veículo responde por quase metade do consumo — risco de dependência operacional.`);
  } else if (top.percent >= 30) {
    points.push(`Concentração moderada no veículo líder; monitorar se a produção acompanha esse consumo.`);
  } else {
    points.push(`Consumo distribuído entre a frota — padrão mais equilibrado de uso.`);
  }
  if (ranked.length >= 3) {
    const tail = ranked[ranked.length - 1];
    points.push(`Menor fatia: ${tail.name} com ${fmtPct(tail.percent)} (${fmtNum(tail.value, 1)} L).`);
  }
  return points;
}

export function buildLineStats(lineData = []) {
  const rows = lineData.map((row) => ({
    periodo: row.periodo,
    custo: toNumber(row.custo),
  }));
  if (!rows.length) return null;

  const total = rows.reduce((acc, row) => acc + row.custo, 0);
  const media = total / rows.length;
  const peak = rows.reduce((best, row) => (row.custo > best.custo ? row : best), rows[0]);
  const low = rows.reduce((best, row) => (row.custo < best.custo ? row : best), rows[0]);

  return {
    total,
    media,
    min: low.custo,
    max: peak.custo,
    minDate: low.periodo,
    maxDate: peak.periodo,
    firstDate: rows[0].periodo,
    lastDate: rows[rows.length - 1].periodo,
    tableRows: rows.map((row) => ({
      periodo: row.periodo,
      custo: row.custo,
      vsMediaPct: media > 0 ? ((row.custo - media) / media) * 100 : 0,
      isPeak: row.periodo === peak.periodo && row.custo === peak.custo,
      isMin: row.periodo === low.periodo && row.custo === low.custo,
    })),
  };
}

export function buildLineDiscussion(lineData = []) {
  const stats = buildLineStats(lineData);
  if (!stats) return ["Sem custo diário registrado no período."];

  const first = stats.tableRows[0]?.custo ?? 0;
  const last = stats.tableRows[stats.tableRows.length - 1]?.custo ?? 0;
  const variation = first > 0 ? ((last - first) / first) * 100 : 0;

  const points = [
    `Referência tracejada no gráfico = média diária ${fmtMoney(stats.media)} (linha de comparação).`,
    `Período ${compactDate(stats.firstDate)} → ${compactDate(stats.lastDate)} · acumulado ${fmtMoney(stats.total)} em ${stats.tableRows.length} dia(s) com lançamento.`,
    `Pico: ${compactDate(stats.maxDate)} com ${fmtMoney(stats.max)} (${stats.media > 0 ? fmtPct(((stats.max - stats.media) / stats.media) * 100) : "—"} acima da média).`,
    `Menor dia: ${compactDate(stats.minDate)} com ${fmtMoney(stats.min)} (${stats.media > 0 ? fmtPct(((stats.min - stats.media) / stats.media) * 100) : "—"} vs média).`,
  ];
  if (variation >= 15) {
    points.push(`Tendência de alta: último dia ${fmtPct(variation)} acima do primeiro — validar lançamentos ou demanda extraordinária.`);
  } else if (variation <= -15) {
    points.push(`Tendência de queda: último dia ${fmtPct(Math.abs(variation))} abaixo do primeiro — possível redução de operação.`);
  } else {
    points.push(`Entre primeiro e último dia a variação foi ${fmtPct(variation)} — comportamento relativamente estável.`);
  }
  return points;
}

export function buildBarDiscussion(barData = []) {
  if (!barData.length) return ["Sem comparativo consumo × produção no período de transporte."];
  const rows = barData.map((row) => ({
    periodo: row.periodo,
    consumo: toNumber(row.consumo),
    producao: toNumber(row.producao),
  }));
  const totalConsumo = rows.reduce((acc, row) => acc + row.consumo, 0);
  const totalProducao = rows.reduce((acc, row) => acc + row.producao, 0);
  const desalinhados = rows.filter((row) => (row.consumo > 0 && row.producao === 0) || (row.producao > 0 && row.consumo === 0));
  const eficiencia = totalConsumo > 0 ? totalProducao / totalConsumo : 0;

  const points = [
    `Totais no período: ${fmtNum(totalConsumo, 1)} L consumidos vs ${fmtNum(totalProducao)} viagem(ns) registradas.`,
    `Eficiência média: ${eficiencia.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} viagens/L.`,
  ];
  if (desalinhados.length > 0) {
    const datas = desalinhados.slice(0, 3).map((row) => compactDate(row.periodo)).join(", ");
    points.push(
      `⚠ ${desalinhados.length} dia(s) com desalinhamento (consumo sem produção ou vice-versa): ${datas}${desalinhados.length > 3 ? "…" : ""}. Possível ERRO DE DADO.`
    );
  } else {
    points.push(`Todos os dias com movimento apresentam consumo e produção registrados — coerência operacional.`);
  }
  const picoConsumo = rows.reduce((best, row) => (row.consumo > best.consumo ? row : best), rows[0]);
  points.push(`Maior consumo diário: ${compactDate(picoConsumo.periodo)} com ${fmtNum(picoConsumo.consumo, 1)} L e ${fmtNum(picoConsumo.producao)} viagem(ns).`);
  return points;
}

export function buildParteDiariaDiscussion(chartData = [], atividades = [], indicadores = {}) {
  const points = [];
  const totalRegistros = toNumber(indicadores.totalParteDiaria);
  const totalHoras = toNumber(indicadores.totalHorasParteDiaria);
  if (!totalRegistros) return ["Nenhuma parte diária lançada no escopo — impossível medir produtividade de apoio."];

  points.push(
    `${fmtNum(totalRegistros)} registro(s) totalizando ${fmtNum(totalHoras, 1)} h · média ${fmtNum(indicadores.mediaHorasPorRegistro, 1)} h/registro.`
  );
  if (atividades.length) {
    const top = [...atividades].sort((a, b) => toNumber(b.registros) - toNumber(a.registros))[0];
    points.push(`Veículo mais ativo: ${top.veiculo} (${top.placa}) com ${fmtNum(top.registros)} registro(s) e ${fmtNum(top.totalHoras, 1)} h.`);
  }
  if (chartData.length) {
    const peakReg = chartData.reduce((best, row) => (row.registros > best.registros ? row : best), chartData[0]);
    const peakHoras = chartData.reduce((best, row) => (row.horas > best.horas ? row : best), chartData[0]);
    points.push(`Dia com mais registros: ${compactDate(peakReg.periodo)} (${fmtNum(peakReg.registros)}).`);
    points.push(`Dia com mais horas: ${compactDate(peakHoras.periodo)} (${fmtNum(peakHoras.horas, 1)} h).`);
  }
  const veiculosAtivos = toNumber(indicadores.veiculosComParteDiaria);
  if (veiculosAtivos <= 1 && atividades.length > 1) {
    points.push(`Baixa cobertura: poucos veículos com lançamento — risco de subutilização da frota de apoio.`);
  }
  return points;
}
