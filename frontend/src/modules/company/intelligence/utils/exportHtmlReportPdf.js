const HIDDEN_SELECTORS = [".fc-report-export-skip", ".print\\:hidden"];

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const temporarilyInlineImages = async (root) => {
  const restores = [];
  const images = [...root.querySelectorAll("img[src]")];

  await Promise.all(
    images.map(async (img) => {
      const original = img.currentSrc || img.src;
      if (!original || original.startsWith("data:")) return;
      try {
        const response = await fetch(original, { mode: "cors", credentials: "include" });
        if (!response.ok) return;
        const dataUrl = await blobToDataUrl(await response.blob());
        restores.push({ img, original });
        img.src = dataUrl;
      } catch {
        /* logo externo sem CORS — html2canvas ignora ou usa fallback */
      }
    })
  );

  return () => {
    restores.forEach(({ img, original }) => {
      img.src = original;
    });
  };
};

const removeHiddenNodes = (root) => {
  HIDDEN_SELECTORS.forEach((selector) => {
    root.querySelectorAll(selector).forEach((node) => node.remove());
  });
};

const fixRechartsInClone = (sourceRoot, clonedRoot) => {
  const sourceContainers = sourceRoot.querySelectorAll(".recharts-responsive-container");
  const clonedContainers = clonedRoot.querySelectorAll(".recharts-responsive-container");

  clonedContainers.forEach((node, index) => {
    const source = sourceContainers[index];
    if (!source) return;
    const rect = source.getBoundingClientRect();
    const width = Math.max(Math.round(rect.width), 280);
    const height = Math.max(Math.round(rect.height), 220);
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    node.style.minWidth = `${width}px`;
    node.style.minHeight = `${height}px`;

    const svg = node.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;
    }
  });
};

const resolveScale = (element) => {
  const base = Math.min(window.devicePixelRatio || 1.5, 2);
  const maxCanvasEdge = 14000;
  const estimated = Math.max(element.scrollWidth, element.scrollHeight) * base;
  if (estimated <= maxCanvasEdge) return base;
  return Math.max(1, maxCanvasEdge / Math.max(element.scrollWidth, element.scrollHeight));
};

/** html2canvas não entende oklch/oklab (Tailwind v4) — inlinar RGB computado pelo browser */
const INLINE_PROPS = [
  "display",
  "position",
  "boxSizing",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "flex",
  "flexDirection",
  "flexWrap",
  "flexGrow",
  "flexShrink",
  "alignItems",
  "justifyContent",
  "gap",
  "gridTemplateColumns",
  "gridTemplateRows",
  "color",
  "backgroundColor",
  "backgroundImage",
  "border",
  "borderRadius",
  "borderColor",
  "borderWidth",
  "borderStyle",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "lineHeight",
  "textAlign",
  "textTransform",
  "letterSpacing",
  "whiteSpace",
  "wordBreak",
  "overflow",
  "overflowX",
  "overflowY",
  "opacity",
  "boxShadow",
  "outline",
  "fill",
  "stroke",
  "verticalAlign",
];

const UNSUPPORTED_COLOR_FN = /oklch|oklab|color-mix|lab\(/i;

const inlineComputedStylesPair = (sourceNode, cloneNode) => {
  if (!(sourceNode instanceof Element) || !(cloneNode instanceof Element)) return;

  const computed = window.getComputedStyle(sourceNode);
  INLINE_PROPS.forEach((prop) => {
    const value = computed[prop];
    if (!value || value === "none" || value === "auto" || value === "normal") return;
    if (typeof value === "string" && UNSUPPORTED_COLOR_FN.test(value)) return;
    try {
      cloneNode.style[prop] = value;
    } catch {
      /* propriedade não suportada em inline style */
    }
  });

  const sourceChildren = sourceNode.children;
  const cloneChildren = cloneNode.children;
  for (let i = 0; i < sourceChildren.length; i += 1) {
    if (cloneChildren[i]) {
      inlineComputedStylesPair(sourceChildren[i], cloneChildren[i]);
    }
  }
};

const sanitizeStylesheetNodes = (clonedDoc) => {
  clonedDoc.querySelectorAll("style").forEach((styleEl) => {
    if (!styleEl.textContent) return;
    styleEl.textContent = styleEl.textContent
      .replace(/oklch\([^)]*\)/gi, "#334155")
      .replace(/oklab\([^)]*\)/gi, "#334155")
      .replace(/color-mix\([^)]*\)/gi, "#334155");
  });
  clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => link.remove());
};

const prepareCloneForHtml2Canvas = (sourceRoot, clonedDoc, clonedRoot) => {
  removeHiddenNodes(clonedRoot);
  fixRechartsInClone(sourceRoot, clonedRoot);
  inlineComputedStylesPair(sourceRoot, clonedRoot);
  sanitizeStylesheetNodes(clonedDoc);
  clonedRoot.style.boxShadow = "none";
  clonedRoot.style.maxWidth = `${sourceRoot.scrollWidth}px`;
  clonedRoot.style.width = `${sourceRoot.scrollWidth}px`;
  clonedRoot.style.backgroundColor = "#ffffff";
};

export async function exportHtmlReportToPdf(element, filename = "relatorio-inteligencia.pdf") {
  if (!element) {
    throw new Error("Conteúdo do relatório não encontrado.");
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);

  window.scrollTo({ top: 0, behavior: "instant" });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const restoreImages = await temporarilyInlineImages(element);

  try {
    const scale = resolveScale(element);
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: -window.scrollY,
      width: element.scrollWidth,
      height: element.scrollHeight,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
      onclone: (clonedDoc, clonedElement) => {
        prepareCloneForHtml2Canvas(element, clonedDoc, clonedElement);
      },
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;
    const imgHeight = (canvas.height * printableWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.94);

    let heightLeft = imgHeight;
    pdf.addImage(imgData, "JPEG", margin, margin, printableWidth, imgHeight);
    heightLeft -= printableHeight;

    while (heightLeft > 0) {
      const position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", margin, position + margin, printableWidth, imgHeight);
      heightLeft -= printableHeight;
    }

    pdf.save(filename);
    return filename;
  } finally {
    restoreImages();
  }
}
