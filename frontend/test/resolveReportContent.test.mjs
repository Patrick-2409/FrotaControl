import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveReportContent } from "../src/modules/company/intelligence/utils/resolveReportContent.js";

test("resolveReportContent prioriza conteudo_relatorio deduplicado", () => {
  const overview = {
    resumo: "Texto original do resumo.",
    acao_imediata: "Ação original.",
    conteudo_relatorio: {
      resumo_diretoria: { principalProblema: "Problema deduplicado." },
      acao_imediata: "Ação deduplicada.",
      resumo_executivo: "Resumo deduplicado.",
      meta: { reducao_percentual: 22.5, paginas_afetadas: ["Top 5 Riscos Operacionais"] },
    },
  };

  const content = resolveReportContent(overview, {});

  assert.equal(content.resumoExecutivo, "Resumo deduplicado.");
  assert.equal(content.acaoImediata, "Ação deduplicada.");
  assert.equal(content.boardSummary.principalProblema, "Problema deduplicado.");
  assert.equal(content.meta.reducao_percentual, 22.5);
});

test("resolveReportContent faz fallback para campos raw quando dedup ausente", () => {
  const overview = {
    resumo: "Resumo bruto.",
    top_riscos: [{ posicao: 1, problema: "Risco A" }],
  };

  const content = resolveReportContent(overview, {});

  assert.equal(content.resumoExecutivo, "Resumo bruto.");
  assert.equal(content.topRiscos[0].problema, "Risco A");
  assert.equal(content.boardSummary, null);
});
