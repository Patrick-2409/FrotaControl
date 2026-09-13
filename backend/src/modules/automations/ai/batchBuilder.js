"use strict";

/**
 * Divisão determinística de fotos em lotes (Bloco 6, Seções 24/25) — a
 * arquitetura suporta batching desde já (nunca fica limitada a uma única
 * chamada gigante), mesmo que hoje um dia normal de obra caiba num lote só.
 */
function buildPhotoBatches(photos, batchSize) {
  const size = Math.max(1, Number(batchSize) || 1);
  const batches = [];
  for (let i = 0; i < photos.length; i += size) {
    batches.push(photos.slice(i, i + size));
  }
  return batches;
}

module.exports = { buildPhotoBatches };
