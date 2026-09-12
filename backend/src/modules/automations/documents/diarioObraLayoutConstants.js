"use strict";

/**
 * Constantes de layout do template v1 do Diário de Obra (Bloco 7B) —
 * derivadas da auditoria do Bloco 7A sobre `PPFlora_DO_07-09-2026_TESTE_R01.xlsx`
 * (hash `TEMPLATE_V1_HASH` abaixo). Versionado por nome de arquivo
 * (`diarioObraLayoutConstants.js`, sem sufixo `V1` no nome porque hoje só
 * existe uma versão — um Bloco futuro que precisar de v2 cria um arquivo
 * irmão, nunca edita este em brecha de compatibilidade).
 *
 * Nota de fidelidade (relatório do Bloco 7B, Seção "riscos"): a auditoria do
 * Bloco 7A leu a ESTRUTURA (linhas, colunas, mesclagens, larguras, textos
 * fixos, posição dos logos) diretamente do XML do arquivo original. As
 * definições EXATAS de fonte/borda/preenchimento (styles.xml, ~150 estilos
 * indexados) não foram decodificadas uma a uma — o layout aqui reproduz a
 * ESTRUTURA fielmente e aplica uma formatação própria (fontes, bordas,
 * cabeçalho sombreado) consistente e legível, não um clone byte-a-byte do
 * estilo visual original.
 */

const TEMPLATE_CODIGO = "diario_obra_ppflora";
const TEMPLATE_VERSAO = 1;
const TEMPLATE_GENERATOR_ID = "diario_obra_ppflora_v1";
const TEMPLATE_TIPO = "EXCEL_PDF_HIBRIDO";
const TEMPLATE_V1_HASH = "ca7ffdf2af3ab73f4f4012ee6c2053c60ccc6bf4ffdb6626009811a22d589f18";
const TEMPLATE_SOURCE_FILENAME = "PPFlora_DO_07-09-2026_TESTE_R01.xlsx";

// Seções 20/23 do Bloco 7B — capacidade fixa por página, auditada do arquivo
// original (32 linhas úteis de atividade nas linhas 15-46 da aba RDO; 7
// blocos x 2 colunas = 13 fotos na grade da aba RDF).
const ACTIVITIES_PER_PAGE = 32;
const PHOTOS_PER_PAGE = 13;

// Seção 21 — teto de segurança: um único item de atividade não pode passar
// disso (evita um DOCUMENT_LAYOUT_OVERFLOW por dado realmente patológico,
// nunca por volume normal de texto operacional).
const MAX_ACTIVITY_TEXT_LENGTH = 2000;
// Teto de segurança adicional: mais que isso sugere anomalia de dados, não
// um dia de obra genuíno — dispara DOCUMENT_LAYOUT_OVERFLOW em vez de gerar
// um documento de centenas de páginas silenciosamente.
const MAX_ACTIVITIES_TOTAL = 2000;
const MAX_PHOTOS_TOTAL = 2000;

// Textos fixos do template (Seção 9 do Bloco 7A) — nunca vêm de config/dados.
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
  atividadesTitulo: "FORAM REALIZADAS AS SEGUINTES ATIVIDADES:",
  registroFotograficoTitulo: "REGISTRO FOTOGRÁFICO",
  continuacaoSufixo: "(continuação)",
});

// Seção 13 do Bloco 7B — default de expediente PERTENCE ao template v1
// (auditado do arquivo original), não ao motor genérico. Só é usado quando
// a config não define `documento.expedienteInicio`/`expedienteFim`.
const DEFAULT_EXPEDIENTE_INICIO = "07:00";
const DEFAULT_EXPEDIENTE_FIM = "17:00";

// Larguras de coluna auditadas (unidade "caracteres", igual ao XLSX original).
const RDO_COLUMN_WIDTHS = [8.43, 8.43, 8.43, 15.66, 8.43, 8.43, 8.43, 8.43];
const RDF_COLUMN_WIDTHS = [2.44, 46.78, 3, 47.33, 3];

// Página (Seção 29) — declarada explicitamente, ao contrário do arquivo
// original (que não fixava isso, ver Bloco 7A Seção "Estrutura do Excel").
const PAGE_SETUP = Object.freeze({
  paperSize: 9, // 9 = A4 (constante ECMA-376 / ExcelJS)
  orientation: "portrait",
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0, // 0 = altura livre (permite múltiplas páginas verticais)
  margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
});

const PDF_PAGE_SIZE = "A4";
const PDF_MARGIN_POINTS = { top: 54, bottom: 54, left: 50.4, right: 50.4 }; // ~0.75"/0.7" em pontos (72pt = 1")

module.exports = {
  TEMPLATE_CODIGO,
  TEMPLATE_VERSAO,
  TEMPLATE_GENERATOR_ID,
  TEMPLATE_TIPO,
  TEMPLATE_V1_HASH,
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
};
