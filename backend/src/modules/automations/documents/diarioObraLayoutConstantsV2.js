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

// Seção "estrutura real" — re-auditado diretamente contra dois arquivos de
// referência independentes (09-09 e 11-09-2026, ambos com a MESMA
// geometria): a grade de atividades do RDO ocupa EXATAMENTE as linhas 15-45
// (31 linhas — linha 14 é um espaçador em branco, igual à linha 6, e a linha
// 46 já é o espaçador que antecede o rodapé institucional nas linhas 48-51).
// FIXO: o formulário SEMPRE desenha as 31 linhas, preenchidas ou em branco —
// nunca comprime o formulário nem sobe o rodapé quando há poucas atividades
// (Seção "preservar o formulário oficial"). Cada linha PREENCHIDA continua
// com ALTURA PRÓPRIA (auditado: 27.6, 18, 18.6, 25.2, 16.2... nunca uma
// altura única fixa) — ver `computeActivityRowHeight` no builder; uma
// eventual 32ª+ atividade (raro, exige mais de 31 itens distintos após
// deduplicação) abre uma aba de continuação, cada uma também com as 31
// linhas fixas. RDF muda de 13 fotos/página (grade pequena) para 2 fotos
// GRANDES lado a lado por bloco (auditado: cada foto ocupa 14 linhas numa
// coluna inteira, legenda em mais 3 linhas) — todos os blocos numa ÚNICA aba
// "RDF", nunca abas RDF_2/RDF_3 (Seção "proibido criar RDF_2, RDF_3").
const ACTIVITIES_PER_PAGE = 31;
const PHOTOS_PER_PAGE = 2;

// Bloco de fotos do RDF (Seção "proibido criar RDF_2, RDF_3") — o PRIMEIRO
// bloco inclui o cabeçalho (título/subtítulo/linha em branco, 3 linhas) mais
// a moldura de fotos (14 linhas) mais a legenda (3 linhas) = 20 linhas
// (auditado: A1:A20/E1:E20). Cada bloco SEGUINTE replica só moldura+legenda
// (17 linhas: auditado A21:A37, A38:A54, A55:A71) — o cabeçalho nunca se
// repete, exatamente como o arquivo oficial.
const RDF_FIRST_BLOCK_HEADER_ROWS = 3;
const RDF_BLOCK_PHOTO_ROWS = 14;
const RDF_BLOCK_CAPTION_ROWS = 3;

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

// Page setup RE-AUDITADO byte-a-byte contra "DIÁRIO DE OBRA_11-09-2026.xlsx"
// (validação visual, correção Bloco 12) — RDO e RDF têm PAGE SETUPs
// DIFERENTES no arquivo oficial (nunca a mesma constante para as duas abas):
// RDO nunca usa fitToPage (escala manual 100%, margens maiores e
// header/footer 0.315"); RDF usa fitToPage com fitToHeight:0 (a impressão
// decide quantas páginas verticais precisa) e centralização horizontal.
const RDO_PAGE_SETUP = Object.freeze({
  paperSize: 9,
  orientation: "portrait",
  fitToPage: false,
  scale: 100,
  margins: { left: 0.511811024, right: 0.511811024, top: 0.787401575, bottom: 0.787401575, header: 0.31496062, footer: 0.31496062 },
});

const RDF_PAGE_SETUP = Object.freeze({
  paperSize: 9,
  orientation: "portrait",
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  horizontalCentered: true,
  margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0, footer: 0 },
});

const PDF_PAGE_SIZE = "A4";
const PDF_MARGIN_POINTS = { top: 54, bottom: 54, left: 50.4, right: 50.4 };

// Geometria do rodapé institucional (Seção "RDO deve terminar na mesma
// geometria") — re-auditada linha a linha: a grade de 31 linhas de
// atividades (15-45) é seguida por DOIS espaçadores em branco (46 e 47,
// ambos com a MESMA moldura das linhas de atividade — nunca um só), só
// então o bloco de assinatura (48-49, mesclado por DUAS linhas), razão
// social (50) e endereço (51). Terminar em qualquer linha que não seja 51
// desloca o rodapé em relação à referência oficial.
const RDO_FOOTER_SPACER_ROWS = 2;
const RDO_FOOTER_SPACER_HEIGHTS_POINTS = [9.6, 13.2];
const RDO_SIGNATURE_BLOCK_ROW_HEIGHTS_POINTS = [25.2, 12];

// Logo (Seção "posição do logo") — auditado nas duas abas: RDO usa um logo
// maior (114x51) que o RDF (89x37), cada um na posição própria.
const RDO_LOGO_ANCHOR = Object.freeze({ col: 0.155, row: 0.074, widthPx: 114, heightPx: 51 });
const RDF_LOGO_ANCHOR = Object.freeze({ col: 1.367, row: 0.11, widthPx: 89, heightPx: 37 });

// Assinatura (Seção "assinatura sobre o nome") — auditado: a imagem original
// foi arrastada manualmente pelo usuário para ocupar o espaço em branco
// deixado por poucas atividades naquele dia específico (chegando a cobrir
// linhas 42-48) — reproduzir ESSA posição literal sobreporia a grade em dias
// com muitas atividades. Em vez disso, a assinatura fica sempre CONFINADA à
// primeira linha do bloco (48, 25.2pt de altura), nunca invadindo a segunda
// linha (49, 12pt) onde o nome fica alinhado embaixo — nunca sobrepõe,
// independente de quantas atividades o dia teve. Proporção mantida idêntica
// ao arquivo PNG original (189x106, ~1.783:1).
const RDO_SIGNATURE_MAX_HEIGHT_POINTS = 18;
const RDO_SIGNATURE_ASPECT_RATIO = 189 / 106;

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

module.exports = {
  TEMPLATE_CODIGO,
  TEMPLATE_VERSAO,
  TEMPLATE_GENERATOR_ID,
  TEMPLATE_TIPO,
  TEMPLATE_V2_HASH,
  TEMPLATE_SOURCE_FILENAME,
  ACTIVITIES_PER_PAGE,
  PHOTOS_PER_PAGE,
  RDF_FIRST_BLOCK_HEADER_ROWS,
  RDF_BLOCK_PHOTO_ROWS,
  RDF_BLOCK_CAPTION_ROWS,
  MAX_ACTIVITY_TEXT_LENGTH,
  MAX_ACTIVITIES_TOTAL,
  MAX_PHOTOS_TOTAL,
  FIXED_TEXT,
  DEFAULT_EXPEDIENTE_INICIO,
  DEFAULT_EXPEDIENTE_FIM,
  RDO_COLUMN_WIDTHS,
  RDF_COLUMN_WIDTHS,
  RDO_PAGE_SETUP,
  RDF_PAGE_SETUP,
  RDO_FOOTER_SPACER_ROWS,
  RDO_FOOTER_SPACER_HEIGHTS_POINTS,
  RDO_SIGNATURE_BLOCK_ROW_HEIGHTS_POINTS,
  RDO_LOGO_ANCHOR,
  RDF_LOGO_ANCHOR,
  RDO_SIGNATURE_MAX_HEIGHT_POINTS,
  RDO_SIGNATURE_ASPECT_RATIO,
  PDF_PAGE_SIZE,
  PDF_MARGIN_POINTS,
  ACTIVITY_CHARS_PER_LINE,
  ACTIVITY_LINE_HEIGHT_POINTS,
  ACTIVITY_ROW_VERTICAL_PADDING_POINTS,
  ACTIVITY_MIN_ROW_HEIGHT_POINTS,
};
