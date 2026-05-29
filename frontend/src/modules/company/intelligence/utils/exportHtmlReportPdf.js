const HIDDEN_SELECTORS = [".fc-report-export-skip", ".print\\:hidden"];

const UNSUPPORTED_COLOR_FN = /oklch|oklab|color-mix|\blab\(|\blch\(/i;

const COLOR_PROPS = new Set([
  "color",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "fill",
  "stroke",
  "stopColor",
  "floodColor",
  "lightingColor",
]);

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
  "alignSelf",
  "gap",
  "gridTemplateColumns",
  "gridTemplateRows",
  "gridColumn",
  "gridRow",
  "color",
  "backgroundColor",
  "backgroundImage",
  "backgroundSize",
  "backgroundPosition",
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
  "strokeWidth",
  "verticalAlign",
  "listStyle",
  "listStyleType",
];

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
        /* logo externo sem CORS */
      }
    })
  );

  return () => {
    restores.forEach(({ img, original }) => {
      img.src = original;
    });
  };
};

const toSafeColor = (value, property = "color") => {
  const raw = String(value || "").trim();
  if (!raw || raw === "none" || raw === "transparent" || raw === "currentcolor") return raw;
  if (!UNSUPPORTED_COLOR_FN.test(raw)) return raw;

  const probe = document.createElement("span");
  probe.style.setProperty("position", "absolute");
  probe.style.setProperty("visibility", "hidden");
  probe.style.setProperty(property, raw);
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).getPropertyValue(property) || getComputedStyle(probe).color;
  probe.remove();
  if (resolved && !UNSUPPORTED_COLOR_FN.test(resolved)) return resolved;
  return property.includes("background") ? "#ffffff" : "#334155";
};

const sanitizeCSSValue = (prop, value) => {
  if (!value || value === "none" || value === "auto" || value === "normal" || value === "initial") return null;
  const text = String(value);
  if (UNSUPPORTED_COLOR_FN.test(text)) {
    return COLOR_PROPS.has(prop) ? toSafeColor(text, prop) : null;
  }
  return text;
};

const collectElements = (root) => [root, ...root.querySelectorAll("*")];

const shouldIgnoreForExport = (node) => {
  if (!(node instanceof Element)) return false;
  if (node.classList?.contains("print:hidden") || node.classList?.contains("fc-report-export-skip")) {
    return true;
  }
  return HIDDEN_SELECTORS.some((selector) => {
    try {
      return node.matches(selector);
    } catch {
      return false;
    }
  });
};

const applyInlineExportStyles = (element) => {
  const entries = [];
  collectElements(element).forEach((el) => {
    if (!(el instanceof Element)) return;
    entries.push({
      el,
      className: el.getAttribute("class"),
      style: el.getAttribute("style"),
    });

    const computed = window.getComputedStyle(el);
    el.removeAttribute("class");

    INLINE_PROPS.forEach((prop) => {
      const safe = sanitizeCSSValue(prop, computed[prop]);
      if (!safe) return;
      try {
        el.style.setProperty(prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), safe);
      } catch {
        try {
          el.style[prop] = safe;
        } catch {
          /* ignore */
        }
      }
    });

    if (el instanceof SVGElement) {
      ["fill", "stroke"].forEach((attr) => {
        const safe = sanitizeCSSValue(attr, computed.getPropertyValue(attr) || computed[attr]);
        if (safe && safe !== "none") el.setAttribute(attr, safe);
      });
    }
  });

  return () => {
    entries.forEach(({ el, className, style }) => {
      if (className == null) el.removeAttribute("class");
      else el.setAttribute("class", className);
      if (style == null) el.removeAttribute("style");
      else el.setAttribute("style", style);
    });
  };
};

const stripStylesheetsFromClone = (clonedDoc, clonedRoot) => {
  clonedDoc.querySelectorAll("style, link[rel='stylesheet'], link[rel=\"stylesheet\"]").forEach((node) => {
    node.remove();
  });
  clonedRoot.querySelectorAll("style, link[rel='stylesheet'], link[rel=\"stylesheet\"]").forEach((node) => {
    node.remove();
  });

  collectElements(clonedRoot).forEach((el) => {
    el.removeAttribute("class");
    const styleAttr = el.getAttribute("style");
    if (styleAttr && UNSUPPORTED_COLOR_FN.test(styleAttr)) {
      el.setAttribute(
        "style",
        styleAttr
          .replace(/oklch\([^;)]*\)/gi, "#334155")
          .replace(/oklab\([^;)]*\)/gi, "#334155")
          .replace(/color-mix\([^;)]*\)/gi, "#334155")
      );
    }
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

export async function exportHtmlReportToPdf(element, filename = "relatorio-inteligencia.pdf") {
  if (!element) {
    throw new Error("Conteúdo do relatório não encontrado.");
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);

  window.scrollTo({ top: 0, behavior: "instant" });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const restoreImages = await temporarilyInlineImages(element);
  const restoreInlineStyles = applyInlineExportStyles(element);

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
      ignoreElements: (node) => shouldIgnoreForExport(node),
      onclone: (clonedDoc, clonedElement) => {
        stripStylesheetsFromClone(clonedDoc, clonedElement);
        fixRechartsInClone(element, clonedElement);
        clonedElement.style.boxShadow = "none";
        clonedElement.style.maxWidth = `${element.scrollWidth}px`;
        clonedElement.style.width = `${element.scrollWidth}px`;
        clonedElement.style.backgroundColor = "#ffffff";
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
    restoreInlineStyles();
    restoreImages();
  }
}
