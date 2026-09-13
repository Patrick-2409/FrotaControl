"use strict";

/**
 * Constantes de layout do template v2 do Diário de Obra (Bloco 12) —
 * arquivo IRMÃO de `diarioObraLayoutConstants.js` (v1), nunca edita aquele
 * (mesma disciplina já declarada no cabeçalho do v1: "um Bloco futuro que
 * precisar de v2 cria um arquivo irmão"). v1 permanece 100% intacto e
 * continua existindo/testável — só deixa de ser o template ATIVO (ver
 * `documentGenerationService.js`).
 *
 * Derivadas da auditoria estrutural (só geometria/estilo — NUNCA os dados
 * preenchidos daquele dia) do arquivo de referência oficial fornecido pelo
 * usuário: "DIÁRIO DE OBRA_09-09-2026.xlsx" (hash abaixo, verificado
 * byte-a-byte antes de qualquer código ser escrito).
 *
 * Nenhum nome de cliente/projeto/pessoa aparece hardcoded aqui (Seção do
 * Bloco 12: "nunca hardcodar Porto Central, Presidente Kennedy, PPFlora ou
 * qualquer nome específico") — os dois textos institucionais que a
 * auditoria encontrou (título do RDF e rodapé institucional do RDO) vêm
 * SEMPRE de `configuracao.documento` (ver `diarioObraDocumentModel.js`),
 * nunca de constante.
 */

const TEMPLATE_CODIGO = "diario_obra_ppflora_v2";
const TEMPLATE_VERSAO = 2;
const TEMPLATE_GENERATOR_ID = "diario_obra_ppflora_v2";
const TEMPLATE_TIPO = "EXCEL_PDF_HIBRIDO";
const TEMPLATE_V2_HASH = "2fd040be0e50b11b2271ad2d4b63d70ff70e5b9ff6d48701bcc52664483821c8";
const TEMPLATE_SOURCE_FILENAME = "DIÁRIO DE OBRA_09-09-2026.xlsx";

// Seção "estrutura real" — a grade de atividades do oficial ocupa EXATAMENTE
// as linhas 15-46 da aba RDO (32 linhas, mesmo teto do v1) — mantido; o que
// muda de verdade é que cada linha tem ALTURA PRÓPRIA (auditado: 27.6, 18,
// 18.6, 25.2, 16.2... nunca uma altura única fixa) — ver
// `computeActivityRowHeight` no builder. RDF muda de 13 fotos/página (grade
// pequena) para 2 fotos GRANDES lado a lado por página (auditado: cada foto
// ocupa as linhas 4-17 numa coluna inteira, legenda nas linhas 18-20).
const ACTIVITIES_PER_PAGE = 32;
const PHOTOS_PER_PAGE = 2;

const MAX_ACTIVITY_TEXT_LENGTH = 2000;
const MAX_ACTIVITIES_TOTAL = 2000;
const MAX_PHOTOS_TOTAL = 2000;

// Textos fixos do template v2 — idênticos ao v1 onde a auditoria confirmou
// o MESMO texto (título/subtítulo/rótulos/atividadesTitulo/registroFotográfico),
// mais os novos elementos estruturais que a auditoria encontrou e o v1 nunca
// tinha: bloco de clima (Seção "REGISTRO DE TEMPO"/"EXPEDIENTE"/períodos) e o
// divisor "Diário". Nenhum destes é dado de cliente — são rótulos fixos do
// FORMULÁRIO em si, presentes em qualquer Diário de Obra gerado por este
// template, independente de qual empresa/projeto.
const FIXED_TEXT = Object.freeze({
  titulo: "DIÁRIO DE OBRA",
  subtitulo: "ANDAMENTO DOS SERVIÇOS",
  rotuloObra: "OBRA",
  rotuloRefContratual: "REF. T",
  rotuloLocal: "LOCAL",
  rotuloData: "DATA",
  rotuloRegistroTempo: "REGISTRO DE TEMPO",
  rotuloExpediente: "EXPEDIENTE",
  rotuloPeriodo: "PERÍODO",
  periodoManha: "MANHÃ",
  periodoTarde: "TARDE",
  periodoNoite: "NOITE",
  climaLabelBom: "BOM",
  climaLabelChuvas: "CHUVAS",
  diarioDivisor: "Diário",
  atividadesTitulo: "FORAM REALIZADAS AS SEGUINTES ATIVIDADES:",
  registroFotograficoTitulo: "REGISTRO FOTOGRÁFICO",
  continuacaoSufixo: "(continuação)",
  // Fallback GENÉRICO quando `documento.tituloRdf` não está configurado —
  // nunca um nome de cliente, só um rótulo neutro (Seção Bloco 12).
  tituloRdfFallbackPrefixo: "ATIVIDADES",
  tituloRdfFallbackGenerico: "REGISTRO DE ATIVIDADES",
  // Fallback GENÉRICO do rodapé institucional quando nada está configurado
  // nem em `rodapeInstitucional` nem em `clienteRazaoSocial`/`clienteEndereco`.
  rodapeAssinanteFallback: "CONTRATANTE",
});

const DEFAULT_EXPEDIENTE_INICIO = "07:00";
const DEFAULT_EXPEDIENTE_FIM = "17:00";

// Larguras auditadas — idênticas ao v1 (a auditoria confirmou que a
// geometria de colunas não mudou; só o RDF passou a alocar as mesmas 5
// colunas para 2 fotos grandes em vez de uma grade pequena).
const RDO_COLUMN_WIDTHS = [8.43, 8.43, 8.43, 15.66, 8.43, 8.43, 8.43, 8.43];
const RDF_COLUMN_WIDTHS = [2.44, 46.78, 3, 47.33, 3];

const PAGE_SETUP = Object.freeze({
  paperSize: 9,
  orientation: "portrait",
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
});

const PDF_PAGE_SIZE = "A4";
const PDF_MARGIN_POINTS = { top: 54, bottom: 54, left: 50.4, right: 50.4 };

// --------------------------------------------------- geometria dinâmica (Seção "wrapText")

// Fonte Arial 10 na largura total mesclada A:H do RDO (soma das larguras de
// coluna acima, ~74.6 unidades) — aproximação deliberada (nunca pixel-perfeito:
// o formato .xlsx não expõe medição real de glifo) calibrada para SUBESTIMAR
// caracteres por linha (preferir altura maior a texto cortado — nunca o
// contrário). Cada item de atividade pode ter suas próprias quebras de linha
// explícitas (\n) — contadas separadamente.
const ACTIVITY_CHARS_PER_LINE = 105;
const ACTIVITY_LINE_HEIGHT_POINTS = 13.5;
const ACTIVITY_ROW_VERTICAL_PADDING_POINTS = 5;
const ACTIVITY_MIN_ROW_HEIGHT_POINTS = 15;

// Orçamento de altura (pontos) disponível para a grade de atividades numa
// página — linhas 15-46 do oficial — usado para decidir QUANDO abrir
// continuação (Seção "quando faltar espaço até a linha 47"), nunca mais um
// contador fixo de itens (o oficial prova que a altura por item VARIA).
// Calibrado para que 32 itens de UMA linha cada (o caso mais comum — mesmo
// teto de itens do v1) ainda caibam numa única página: cada item de uma
// linha custa no mínimo ACTIVITY_LINE_HEIGHT_POINTS + padding (~18.5pt neste
// arquivo) — 32 × esse mínimo é o piso deste orçamento. Itens genuinamente
// mais longos (múltiplas linhas) continuam abrindo continuação mais cedo,
// exatamente o comportamento dinâmico auditado.
const ACTIVITIES_AREA_BUDGET_POINTS = 32 * (ACTIVITY_LINE_HEIGHT_POINTS + ACTIVITY_ROW_VERTICAL_PADDING_POINTS);

module.exports = {
  TEMPLATE_CODIGO,
  TEMPLATE_VERSAO,
  TEMPLATE_GENERATOR_ID,
  TEMPLATE_TIPO,
  TEMPLATE_V2_HASH,
  TEMPLATE_SOURCE_FILENAME,
  ACTIVITIES_PER_PAGE,
  PHOTOS_PER_PAGE,
  MAX_ACTIVITY_TEXT_LENGTH,
  MAX_ACTIVITIES_TOTAL,
  MAX_PHOTOS_TOTAL,
  FIXED_TEXT,
  DEFAULT_EXPEDIENTE_INICIO,
  DEFAULT_EXPEDIENTE_FIM,
  RDO_COLUMN_WIDTHS,
  RDF_COLUMN_WIDTHS,
  PAGE_SETUP,
  PDF_PAGE_SIZE,
  PDF_MARGIN_POINTS,
  ACTIVITY_CHARS_PER_LINE,
  ACTIVITY_LINE_HEIGHT_POINTS,
  ACTIVITY_ROW_VERTICAL_PADDING_POINTS,
  ACTIVITY_MIN_ROW_HEIGHT_POINTS,
  ACTIVITIES_AREA_BUDGET_POINTS,
};
