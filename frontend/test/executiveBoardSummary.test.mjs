import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildExecutiveBoardSummary,
  resolveSituacaoFromScoreGeral,
  resolveDecisaoRecomendada,
} from "../src/modules/company/intelligence/utils/executiveBoardSummary.js";
import { buildExecutiveSemaphore } from "../src/modules/company/intelligence/utils/executiveSemaphore.js";

test("resolveSituacaoFromScoreGeral usa Score Geral 48 como crítica", () => {
  const situacao = resolveSituacaoFromScoreGeral({
    score_geral: { valor: 48, faixa: "Crítica", classificacao: "CRITICA" },
  });
  assert.equal(situacao.label, "Crítica");
  assert.equal(situacao.emoji, "🔴");
});

test("buildExecutiveSemaphore monta quatro indicadores", () => {
  const semaforo = buildExecutiveSemaphore({
    painelExecutivo: {
      score_operacional: { valor: 42, classificacao: "CRITICA" },
      score_financeiro: { valor: 78, classificacao: "BOA" },
      score_confiabilidade: { valor: 35, classificacao: "CRITICA" },
    },
    regraDeOuro: { haInconsistencia: true, confiavelParaDecisao: false },
    indicadores: { totalViagensTransporte: 0, veiculosConsiderados: 3 },
    narrativas: {},
  });

  assert.equal(semaforo.length, 4);
  assert.equal(semaforo[0].titulo, "Operação");
  assert.equal(semaforo[0].emoji, "🔴");
  assert.equal(semaforo[1].titulo, "Financeiro");
  assert.equal(semaforo[2].titulo, "Confiabilidade");
  assert.equal(semaforo[3].titulo, "Produtividade");
});

test("buildExecutiveBoardSummary monta blocos da diretoria com semáforo", () => {
  const summary = buildExecutiveBoardSummary({
    topRiscos: [
      {
        classificacao: "CRITICO",
        faixa: "Crítico",
        problema: "Produção registrada sem abastecimento correspondente.",
        recomendacao: "Auditar imediatamente os lançamentos de combustível do Caminhão Munck.",
      },
    ],
    acaoImediata: "Auditar imediatamente os lançamentos de combustível do Caminhão Munck.",
    painelExecutivo: {
      score_geral: { valor: 48, faixa: "Crítica", classificacao: "CRITICA" },
      score_operacional: { valor: 42, classificacao: "CRITICA" },
      score_financeiro: { valor: 78, classificacao: "BOA" },
      score_confiabilidade: { valor: 35, classificacao: "CRITICA" },
      narrativas: {},
    },
    indicadores: { totalViagensTransporte: 5, totalLitrosTransporte: 0, veiculosConsiderados: 1 },
    narrativaExecutiva: { por_que_importa: "Compromete leitura de eficiência." },
    regraDeOuro: { haInconsistencia: true, confiavelParaDecisao: false },
  });

  assert.equal(summary.situacao.label, "Crítica");
  assert.equal(summary.scoreGeral.valor, 48);
  assert.equal(summary.semaforo.length, 4);
  assert.match(summary.principalProblema, /Produção registrada sem abastecimento/);
  assert.match(summary.impacto, /não são confiáveis/i);
  assert.match(summary.acaoImediata, /Auditar imediatamente/);
  assert.match(summary.decisaoRecomendada, /Não utilizar os indicadores deste período/i);
});

test("resolveDecisaoRecomendada indica monitoramento quando confiável", () => {
  const texto = resolveDecisaoRecomendada({
    regraDeOuro: { haInconsistencia: false, confiavelParaDecisao: true, dadosSuficientes: true },
    situacao: { key: "BAIXO" },
  });
  assert.match(texto, /confiáveis para decisões táticas/i);
});
