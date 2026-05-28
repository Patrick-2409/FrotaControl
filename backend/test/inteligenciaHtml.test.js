const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateIntelligenceHtml } = require("../src/services/intelligencePdfService");

test("generateIntelligenceHtml retorna documento HTML com KPIs e gráficos SVG", async () => {
  const html = await generateIntelligenceHtml({
    company: { nome: "Transportes Demo", logo_url: null },
    analysis: {
      periodo: { tipo: "mes", inicio: "2026-05-01", fim: "2026-05-28" },
      tipoAnalise: "geral",
      indicadores: {
        totalLitros: 1200,
        totalValor: 8400,
        precoMedio: 7,
        totalViagens: 45,
      },
      insights: {},
      graficos: {
        consumoPorVeiculo: [{ veiculo: "Caminhão A", litros: 600 }],
        custoPorPeriodo: [{ periodo: "2026-05-01", custo: 400 }],
        consumoVsProducao: [{ periodo: "2026-05-01", consumo: 100, producao: 12 }],
      },
    },
    report: {
      resumoExecutivo: "Operação estável no período.",
      diagnosticoDetalhado: "Sem alertas críticos.",
      impactoFinanceiro: "Impacto controlado.",
      riscos: ["Monitorar preço do diesel."],
      acoes: ["Revisar rotas de maior consumo."],
    },
  });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Transportes Demo/);
  assert.match(html, /Operação estável no período\./);
  assert.match(html, /<svg[\s\S]*Consumo por veículo/i);
  assert.match(html, /Total litros/);
});

test("generateIntelligenceHtml escapa conteúdo HTML malicioso", async () => {
  const html = await generateIntelligenceHtml({
    company: { nome: "<script>alert(1)</script>", logo_url: null },
    analysis: {
      periodo: { tipo: "mes", inicio: "2026-05-01", fim: "2026-05-28" },
      tipoAnalise: "geral",
      indicadores: {},
      insights: {},
      graficos: {},
    },
    report: {
      resumoExecutivo: "<img src=x onerror=alert(1)>",
    },
  });

  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
