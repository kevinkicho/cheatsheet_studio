/**
 * Studio SVG export
 *
 * Why Mermaid → standalone SVG is hard:
 *  Mermaid defaults to htmlLabels (HTML inside <foreignObject>). Nesting that
 *  inside our page SVG's foreignObject breaks file:// XML viewers; html2canvas
 *  on off-screen nodes paints pure black. mermaidcn does not solve this — it is
 *  only a React display wrapper around mermaid.render().
 *
 * Our approach:
 *  1) Flatten FO labels → native SVG <text>
 *  2) Rasterize via Image→canvas (no viewport / html2canvas dependency)
 *  3) Inject <img> into the same card slots (layout = export-preview)
 *  4) html2canvas under cover only as fallback; reject blank PNGs
 *  5) Dark board + KaTeX CDN fonts for file://
 */
import html2canvas from 'html2canvas-pro'
import { sanitizeExportFilename } from '@/lib/exportPdf'
import type { ExportColorMode } from '@/lib/exportFormats'
import { triggerBlobDownload } from '@/lib/exportCapture'
import {
  paintStudioSvg,
  STUDIO_DARK,
  type StudioColors,
} from '@/lib/mermaidTheme'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/**
 * Match export-preview card fill (PdfExportPages DEFAULT_CARD_BG solid).
 * Pure #0a0a0a plates looked like "weird black boxes" vs the sheet.
 */
export const DIAGRAM_CARD_BG = '#1e2028'
/** @deprecated alias — prefer DIAGRAM_CARD_BG */
export const DIAGRAM_CAPTURE_BG = DIAGRAM_CARD_BG
export const SVG_BOARD_BG = '#0f1115'

/** Capture-only palette. Readable on card fill / transparent. */
export const CAPTURE_CONTRAST: StudioColors = {
  nodeFill: '#3f3f46',
  nodeStroke: '#d4d4d8',
  nodeText: '#fafafa',
  edge: '#a1a1aa',
  edgeLabelBg: '#27272a',
  clusterFill: '#27272a',
  clusterStroke: '#71717a',
  bg: DIAGRAM_CARD_BG,
}

export function resolveSvgPageBackground(
  backgroundColor: string | null | undefined,
): string {
  if (
    backgroundColor == null ||
    backgroundColor === '' ||
    backgroundColor === 'transparent'
  ) {
    return SVG_BOARD_BG
  }
  return backgroundColor
}

export function isUsefulDiagramPng(dataUrl: string, minBytes = 5_000): boolean {
  if (!dataUrl.startsWith('data:image/png')) return false
  const b64 = dataUrl.split(',')[1] ?? ''
  return Math.floor((b64.length * 3) / 4) >= minBytes
}

export function sanitizeHtmlForXml(html: string): string {
  return html
    .replace(/&nbsp;/gi, '&#160;')
    .replace(/&ensp;/gi, '&#8194;')
    .replace(/&emsp;/gi, '&#8195;')
    .replace(/&thinsp;/gi, '&#8201;')
    .replace(/&mdash;/gi, '&#8212;')
    .replace(/&ndash;/gi, '&#8211;')
    .replace(/&lsquo;/gi, '&#8216;')
    .replace(/&rsquo;/gi, '&#8217;')
    .replace(/&ldquo;/gi, '&#8220;')
    .replace(/&rdquo;/gi, '&#8221;')
    .replace(/&hellip;/gi, '&#8230;')
    .replace(/&copy;/gi, '&#169;')
    .replace(/&reg;/gi, '&#174;')
    .replace(/&trade;/gi, '&#8482;')
    .replace(/&bull;/gi, '&#8226;')
    .replace(/&middot;/gi, '&#183;')
    .replace(/\u00a0/g, '&#160;')
    .replace(/&(?!(?:#\d+|#x[\da-fA-F]+|[a-zA-Z][\w]*);)/g, '&amp;')
}

/**
 * KaTeX faces via CDN so file:// SVG does not 404 on /node_modules/... fonts
 * (Chromium hangs on missing @font-face and floods console with ERR_FILE_NOT_FOUND).
 */
export const KATEX_CDN_BASE =
  'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/fonts'

/** Minimal KaTeX @font-face set (CDN) for standalone SVG equations. */
export function katexCdnFontFaceCss(): string {
  const faces: Array<[string, string]> = [
    ['KaTeX_Main', 'KaTeX_Main-Regular'],
    ['KaTeX_Main', 'KaTeX_Main-Bold'],
    ['KaTeX_Main', 'KaTeX_Main-Italic'],
    ['KaTeX_Math', 'KaTeX_Math-Italic'],
    ['KaTeX_Math', 'KaTeX_Math-BoldItalic'],
    ['KaTeX_Size1', 'KaTeX_Size1-Regular'],
    ['KaTeX_Size2', 'KaTeX_Size2-Regular'],
    ['KaTeX_Size3', 'KaTeX_Size3-Regular'],
    ['KaTeX_Size4', 'KaTeX_Size4-Regular'],
    ['KaTeX_AMS', 'KaTeX_AMS-Regular'],
    ['KaTeX_Caligraphic', 'KaTeX_Caligraphic-Regular'],
    ['KaTeX_Caligraphic', 'KaTeX_Caligraphic-Bold'],
    ['KaTeX_Script', 'KaTeX_Script-Regular'],
    ['KaTeX_Fraktur', 'KaTeX_Fraktur-Regular'],
    ['KaTeX_Fraktur', 'KaTeX_Fraktur-Bold'],
    ['KaTeX_Typewriter', 'KaTeX_Typewriter-Regular'],
    ['KaTeX_SansSerif', 'KaTeX_SansSerif-Regular'],
    ['KaTeX_SansSerif', 'KaTeX_SansSerif-Italic'],
    ['KaTeX_SansSerif', 'KaTeX_SansSerif-Bold'],
  ]
  return faces
    .map(([family, file]) => {
      const fw = file.includes('Bold') ? 'bold' : 'normal'
      const fs = file.includes('Italic') ? 'italic' : 'normal'
      return `@font-face{font-family:'${family}';font-style:${fs};font-weight:${fw};src:url('${KATEX_CDN_BASE}/${file}.woff2') format('woff2'),url('${KATEX_CDN_BASE}/${file}.woff') format('woff');font-display:swap;}`
    })
    .join('\n')
}

/**
 * Make collected app CSS safe for standalone file:// SVG:
 * drop local @font-face / vite asset urls (they 404 and error the viewer).
 */
export function sanitizeCssForStandaloneSvg(css: string): string {
  // cssText @font-face blocks are typically single-rule without nested braces
  let out = css.replace(/@font-face\s*\{[^}]*\}/gi, '')
  // url(/node_modules/...), url(./assets/...), url(/assets/...)
  out = out.replace(
    /url\(\s*(['"]?)(?!https?:|data:|blob:)[^)'"]+\1\s*\)/gi,
    'none',
  )
  // Guard against accidental CDATA terminators inside CSS
  out = out.replace(/\]\]>/g, ']]\\>')
  return `${out}\n/* KaTeX CDN fonts for file:// SVG */\n${katexCdnFontFaceCss()}`
}

export function collectDocumentCss(maxChars = 280_000): string {
  const parts: string[] = []
  let total = 0
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules
      if (!rules) continue
      for (const rule of Array.from(rules)) {
        const t = rule.cssText
        if (!t) continue
        // Skip local font faces early (faster + smaller)
        if (t.startsWith('@font-face') && !/url\(\s*['"]?https?:/i.test(t)) {
          continue
        }
        if (total + t.length > maxChars) break
        parts.push(t)
        total += t.length + 1
      }
    } catch {
      /* skip */
    }
  }
  return sanitizeCssForStandaloneSvg(parts.join('\n'))
}

function colorFilterCss(mode: ExportColorMode): string {
  if (mode === 'greyscale') return 'filter: grayscale(1);'
  if (mode === 'bw')
    return 'filter: grayscale(1) contrast(8) brightness(1.05);'
  return ''
}

export type DiagramPlacement = {
  idx: number
  dataUrl: string
  /** Diagram content size in CSS px (pre html2canvas scale). */
  contentW: number
  contentH: number
}

/** Read PNG IHDR width/height from a data URL (no DOM Image needed). */
export function pngPixelSize(
  dataUrl: string,
): { w: number; h: number } | null {
  try {
    if (!dataUrl.startsWith('data:image/png')) return null
    const b64 = dataUrl.split(',')[1]
    if (!b64 || b64.length < 32) return null
    const bin = atob(b64.slice(0, 64))
    const u8 = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    if (u8[0] !== 0x89 || u8[1] !== 0x50) return null
    const w = ((u8[16]! << 24) | (u8[17]! << 16) | (u8[18]! << 8) | u8[19]!) >>> 0
    const h = ((u8[20]! << 24) | (u8[21]! << 16) | (u8[22]! << 8) | u8[23]!) >>> 0
    if (w > 0 && h > 0 && w < 20_000 && h < 20_000) return { w, h }
  } catch {
    /* ignore */
  }
  return null
}

export const DIAGRAM_HOST_SELECTOR = [
  '[data-testid="mermaid-view"]',
  '[data-testid="process-flow-view"]',
  '.mermaid-host',
].join(', ')

export const DIAGRAM_SVG_SELECTOR = [
  '[data-testid="mermaid-view"] svg',
  '[data-testid="process-flow-view"] svg',
  '.mermaid-host svg',
].join(', ')

export function svgMarkupToDataUrl(svgMarkup: string): string {
  let s = svgMarkup.trim().replace(/^<\?xml[^?]*\?>\s*/i, '')
  if (!/^<svg\b[^>]*\sxmlns=/i.test(s)) {
    s = s.replace(/^<svg\b/, `<svg xmlns="${SVG_NS}"`)
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`
}

export function prepareStandaloneDiagramSvg(svg: SVGElement): string {
  const clone = svg.cloneNode(true) as SVGElement
  clone.setAttribute('xmlns', SVG_NS)
  try {
    paintStudioSvg(clone, STUDIO_DARK)
  } catch {
    /* ignore */
  }
  let markup = ''
  try {
    markup = new XMLSerializer().serializeToString(clone)
  } catch {
    markup = clone.outerHTML
  }
  return sanitizeHtmlForXml(markup).replace(/^<\?xml[^?]*\?>\s*/i, '')
}

export function bakeDiagramSvgForCapture(
  host: HTMLElement,
  colors: StudioColors = CAPTURE_CONTRAST,
): void {
  host.style.setProperty('forced-color-adjust', 'none')
  host.style.setProperty('color-scheme', 'dark')
  // Transparent so export PNGs blend with card fill (not a pure-black plate)
  host.style.background = 'transparent'

  host.querySelectorAll('svg').forEach((svgEl) => {
    const svg = svgEl as SVGSVGElement
    svg.style.setProperty('forced-color-adjust', 'none')
    svg.style.background = 'transparent'
    try {
      paintStudioSvg(svg, colors)
    } catch {
      /* best effort */
    }

    const nodeSel =
      'g.node > path, g.node > rect, g.node > polygon, g.node > circle, g.node > ellipse, g.node path.label-container, g.node rect.label-container, g.node .basic.label-container, g.mindmap-node > path, g.mindmap-node > rect, g.mindmap-node > polygon, g[class*="section-"] > path, g[class*="section-"] > rect'

    svg.querySelectorAll(nodeSel).forEach((el) => {
      if (el.closest('.edgePath, .flowchart-link, marker, defs')) return
      el.setAttribute('fill', colors.nodeFill)
      el.setAttribute('stroke', colors.nodeStroke)
      ;(el as SVGElement).style.setProperty('fill', colors.nodeFill, 'important')
      ;(el as SVGElement).style.setProperty(
        'stroke',
        colors.nodeStroke,
        'important',
      )
    })

    if (
      svg.classList.contains('mindmapDiagram') ||
      svg.querySelector('[class*="mindmap"]')
    ) {
      svg.querySelectorAll('path, rect, polygon, circle, ellipse').forEach((el) => {
        if (
          el.closest(
            '.edgePath, .flowchart-link, .edgePaths, marker, defs, line',
          )
        ) {
          return
        }
        const d = (el.getAttribute('d') || '').toLowerCase()
        if (el.tagName.toLowerCase() === 'path' && !d.includes('z')) {
          el.setAttribute('fill', 'none')
          el.setAttribute('stroke', colors.edge)
          return
        }
        el.setAttribute('fill', colors.nodeFill)
        el.setAttribute('stroke', colors.nodeStroke)
        ;(el as SVGElement).style.setProperty('fill', colors.nodeFill, 'important')
      })
    }

    svg
      .querySelectorAll(
        '.edgePath path, .flowchart-link, path.flowchart-link, .edgePaths path',
      )
      .forEach((el) => {
        el.setAttribute('fill', 'none')
        el.setAttribute('stroke', colors.edge)
      })

    svg.querySelectorAll('marker path, .arrowheadPath').forEach((el) => {
      el.setAttribute('fill', colors.edge)
      el.setAttribute('stroke', colors.edge)
    })

    svg.querySelectorAll('text, tspan').forEach((el) => {
      el.setAttribute('fill', colors.nodeText)
      ;(el as SVGElement).style.setProperty('fill', colors.nodeText, 'important')
    })

    svg.querySelectorAll('foreignObject').forEach((fo) => {
      const fw = parseFloat(fo.getAttribute('width') || '0') || 0
      const fh = parseFloat(fo.getAttribute('height') || '0') || 0
      if (fw > 0) fo.setAttribute('width', String(Math.ceil(fw * 1.12)))
      if (fh > 0) fo.setAttribute('height', String(Math.ceil(fh * 1.12)))
      ;(fo as SVGElement).style.setProperty('overflow', 'visible', 'important')
      ;(fo as SVGElement).style.setProperty('background', 'transparent', 'important')
      ;(fo as SVGElement).style.setProperty(
        'background-color',
        'transparent',
        'important',
      )
      fo.querySelectorAll('div, span, p, a').forEach((el) => {
        const h = el as HTMLElement
        h.style.setProperty('color', colors.nodeText, 'important')
        h.style.setProperty('background', 'transparent', 'important')
        h.style.setProperty('background-color', 'transparent', 'important')
        h.style.setProperty('font-weight', '600', 'important')
        h.style.setProperty('overflow', 'visible', 'important')
        h.style.setProperty('white-space', 'normal', 'important')
        h.style.setProperty('word-break', 'break-word', 'important')
        h.style.setProperty('line-height', '1.15', 'important')
      })
    })
  })
}

export async function pngHasLuminanceVariance(
  dataUrl: string,
  minRange = 12,
): Promise<boolean> {
  if (!dataUrl.startsWith('data:image/png')) return false
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('png decode'))
      i.src = dataUrl
    })
    const w = Math.min(48, Math.max(8, img.naturalWidth || img.width || 8))
    const h = Math.min(48, Math.max(8, img.naturalHeight || img.height || 8))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return true
    ctx.drawImage(img, 0, 0, w, h)
    let data: ImageData
    try {
      data = ctx.getImageData(0, 0, w, h)
    } catch {
      return true
    }
    let min = 255
    let max = 0
    const d = data.data
    for (let i = 0; i < d.length; i += 16) {
      const y = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!
      if (y < min) min = y
      if (y > max) max = y
    }
    return max - min >= minRange
  } catch {
    return false
  }
}

export function findDiagramHosts(pageEl: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    pageEl.querySelectorAll<HTMLElement>(DIAGRAM_HOST_SELECTOR),
  )
  return nodes.filter((el) => {
    if (!el.querySelector('svg')) return false
    return !nodes.some((other) => other !== el && other.contains(el))
  })
}

/**
 * Natural size of mermaid SVG so full TD/mindmap is never cropped.
 * Wide LR diagrams stay short (no forced 160px letterbox).
 */
export function naturalSvgPixelSize(
  svg: SVGSVGElement,
  fallbackW: number,
  fallbackH: number,
): { w: number; h: number } {
  const vb = svg.viewBox?.baseVal
  let vw = vb && vb.width > 2 ? vb.width : 0
  let vh = vb && vb.height > 2 ? vb.height : 0
  if (vw < 2 || vh < 2) {
    try {
      const bb = svg.getBBox()
      if (bb.width > 2 && bb.height > 2) {
        vw = bb.width + 20
        vh = bb.height + 20
      }
    } catch {
      /* ignore */
    }
  }
  if (vw < 2 || vh < 2) {
    const r = svg.getBoundingClientRect()
    vw = r.width || fallbackW || 320
    vh = r.height || fallbackH || 240
  }

  const ar = vw / Math.max(vh, 1)
  let w: number
  let h: number
  if (ar >= 2) {
    // Horizontal process strip — keep height tight to content
    w = Math.max(420, Math.round(vw))
    h = Math.max(72, Math.round(w / ar))
  } else if (ar <= 0.75) {
    // Tall TD flowchart
    h = Math.max(280, Math.round(vh))
    w = Math.max(200, Math.round(h * ar))
  } else {
    // Mindmap / balanced
    w = Math.max(280, Math.round(vw))
    h = Math.max(220, Math.round(vh))
  }

  // Cap for speed (scale×2 still sharp; huge canvases made export crawl)
  const maxEdge = 560
  if (Math.max(w, h) > maxEdge) {
    const s = maxEdge / Math.max(w, h)
    w = Math.round(w * s)
    h = Math.round(h * s)
  }
  // Re-assert aspect after floors/caps
  if (ar >= 1) h = Math.max(64, Math.round(w / ar))
  else w = Math.max(120, Math.round(h * ar))
  return { w, h }
}

export type CaptureResult = {
  dataUrl: string
  contentW: number
  contentH: number
}

/**
 * Mermaid defaults to htmlLabels → <foreignObject> HTML inside SVG.
 * Nested FO inside an outer SVG foreignObject is fragile; browsers often
 * blank FO when drawing SVG→Image. Replace FO text with native <text>.
 */
export function flattenForeignObjectsToSvgText(
  svg: SVGSVGElement,
  textColor = CAPTURE_CONTRAST.nodeText,
): void {
  const fos = Array.from(svg.querySelectorAll('foreignObject'))
  for (const fo of fos) {
    const raw = (fo.textContent || '').replace(/\s+/g, ' ').trim()
    if (!raw) {
      fo.remove()
      continue
    }
    const x = parseFloat(fo.getAttribute('x') || '0') || 0
    const y = parseFloat(fo.getAttribute('y') || '0') || 0
    const w = parseFloat(fo.getAttribute('width') || '0') || 0
    const h = parseFloat(fo.getAttribute('height') || '0') || 0
    // Prefer parent <g class="label"> transform origin when FO x/y are 0
    let cx = x + (w > 0 ? w / 2 : 0)
    let cy = y + (h > 0 ? h / 2 : 0)
    if (w < 1 && h < 1) {
      try {
        const bb = (fo as SVGGraphicsElement).getBBox?.()
        if (bb && bb.width > 0) {
          cx = bb.x + bb.width / 2
          cy = bb.y + bb.height / 2
        }
      } catch {
        /* keep */
      }
    }
    const fontSize = Math.max(
      10,
      Math.min(14, h > 8 ? Math.round(h * 0.45) : 12),
    )
    // Multi-line: split on long phrases lightly
    const lines =
      raw.length > 28 && raw.includes(' ')
        ? (() => {
            const mid = Math.floor(raw.length / 2)
            const sp = raw.indexOf(' ', mid - 6)
            if (sp > 0 && sp < raw.length - 2) {
              return [raw.slice(0, sp), raw.slice(sp + 1)]
            }
            return [raw]
          })()
        : [raw]

    const g = document.createElementNS(SVG_NS, 'g')
    g.setAttribute('data-export-flat-label', '1')
    lines.forEach((line, i) => {
      const t = document.createElementNS(SVG_NS, 'text')
      t.setAttribute('x', String(cx))
      t.setAttribute(
        'y',
        String(cy + (i - (lines.length - 1) / 2) * (fontSize + 2)),
      )
      t.setAttribute('text-anchor', 'middle')
      t.setAttribute('dominant-baseline', 'middle')
      t.setAttribute('fill', textColor)
      t.setAttribute('font-size', String(fontSize))
      t.setAttribute('font-weight', '600')
      t.setAttribute(
        'font-family',
        'ui-sans-serif, system-ui, Segoe UI, sans-serif',
      )
      t.textContent = line
      g.appendChild(t)
    })
    fo.replaceWith(g)
  }
}

/**
 * Prepare a self-contained SVG clone for rasterization or data-URL embed.
 */
export function prepareDiagramSvgClone(
  liveSvg: SVGSVGElement,
  opts?: { flattenFo?: boolean },
): SVGSVGElement {
  const svgClone = liveSvg.cloneNode(true) as SVGSVGElement
  svgClone.setAttribute('xmlns', SVG_NS)
  svgClone.style.cssText =
    'max-width:none;max-height:none;width:100%;height:100%;overflow:visible;background:transparent'
  if (!svgClone.getAttribute('viewBox')) {
    try {
      const bb = liveSvg.getBBox()
      if (bb.width > 2 && bb.height > 2) {
        svgClone.setAttribute(
          'viewBox',
          `${bb.x - 8} ${bb.y - 8} ${bb.width + 16} ${bb.height + 16}`,
        )
      }
    } catch {
      /* keep */
    }
  }
  svgClone.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  // Drop huge mermaid <style> (theme is baked onto attributes)
  svgClone.querySelectorAll('style').forEach((el) => el.remove())

  const wrap = document.createElement('div')
  wrap.appendChild(svgClone)
  bakeDiagramSvgForCapture(wrap, CAPTURE_CONTRAST)
  if (opts?.flattenFo !== false) {
    flattenForeignObjectsToSvgText(svgClone, CAPTURE_CONTRAST.nodeText)
  }
  return svgClone
}

/**
 * Native SVG → Image → canvas. Reliable for pure SVG (after FO flatten).
 * Transparent PNG so card chrome/fill shows through (matches export-preview).
 */
export async function rasterizeSvgViaImage(
  liveSvg: SVGSVGElement,
  scale = 2,
): Promise<CaptureResult | null> {
  try {
    const { w: capW, h: capH } = naturalSvgPixelSize(liveSvg, 320, 240)
    const svgClone = prepareDiagramSvgClone(liveSvg, { flattenFo: true })
    svgClone.setAttribute('width', String(capW))
    svgClone.setAttribute('height', String(capH))
    // No full-bleed black rect — preview cards are #1e2028, not #0a0a0a

    let markup = ''
    try {
      markup = new XMLSerializer().serializeToString(svgClone)
    } catch {
      markup = svgClone.outerHTML
    }
    markup = sanitizeHtmlForXml(markup)
    if (!/^<svg\b[^>]*\sxmlns=/i.test(markup)) {
      markup = markup.replace(/^<svg\b/, `<svg xmlns="${SVG_NS}"`)
    }
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('svg image decode failed'))
      i.src = url
    })
    const s = Math.min(2.5, Math.max(1.5, scale))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(capW * s))
    canvas.height = Math.max(1, Math.round(capH * s))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // Transparent clear — card background shows through letterbox areas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/png')
    if (!(await acceptUsefulDiagramPng(dataUrl, 3_000, 10))) return null
    return { dataUrl, contentW: capW, contentH: capH }
  } catch (e) {
    console.warn('[exportSvg] rasterizeSvgViaImage failed', e)
    return null
  }
}

/**
 * Vector data URL (flattened FO → text). Safe as <img> in export SVG.
 */
export function captureDiagramAsSvgDataUrl(
  host: HTMLElement,
): CaptureResult | null {
  const liveSvg = host.querySelector('svg') as SVGSVGElement | null
  if (!liveSvg) return null
  try {
    const svgClone = prepareDiagramSvgClone(liveSvg, { flattenFo: true })
    const { w, h } = naturalSvgPixelSize(
      liveSvg,
      host.offsetWidth || 320,
      host.offsetHeight || 240,
    )
    svgClone.setAttribute('width', String(w))
    svgClone.setAttribute('height', String(h))
    let markup = ''
    try {
      markup = new XMLSerializer().serializeToString(svgClone)
    } catch {
      markup = svgClone.outerHTML
    }
    markup = sanitizeHtmlForXml(markup)
    if (markup.length < 80) return null
    return {
      dataUrl: svgMarkupToDataUrl(markup),
      contentW: w,
      contentH: h,
    }
  } catch {
    return null
  }
}

/**
 * Reject pure-black / empty captures.
 */
export async function acceptUsefulDiagramPng(
  dataUrl: string,
  minBytes = 5_000,
  minRange = 12,
): Promise<boolean> {
  if (!dataUrl.startsWith('data:image/png')) return false
  if (!isUsefulDiagramPng(dataUrl, minBytes)) return false
  return pngHasLuminanceVariance(dataUrl, minRange)
}

/**
 * Optional cover if we fall back to on-screen html2canvas.
 */
export function installExportCaptureCover(): () => void {
  const existing = document.querySelector('[data-export-capture-cover="1"]')
  if (existing) return () => existing.remove()
  const cover = document.createElement('div')
  cover.setAttribute('data-export-capture-cover', '1')
  cover.setAttribute('aria-hidden', 'true')
  cover.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483646',
    'background:#0f1115',
    'pointer-events:none',
  ].join(';')
  document.body.appendChild(cover)
  return () => cover.remove()
}

async function html2canvasDiagramTemp(
  liveSvg: SVGSVGElement,
  capW: number,
  capH: number,
  captureScale: number,
  foreignObjectRendering: boolean,
): Promise<string | null> {
  const pad = capW / Math.max(capH, 1) >= 2 ? 6 : 8
  const temp = document.createElement('div')
  temp.setAttribute('data-export-diag-temp', '1')
  temp.setAttribute('aria-hidden', 'true')
  temp.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${capW}px`,
    `height:${capH}px`,
    'z-index:2147483645',
    'pointer-events:none',
    'background:transparent',
    'overflow:visible',
    `padding:${pad}px`,
    'box-sizing:border-box',
    'display:flex',
    'align-items:center',
    'justify-content:center',
  ].join(';')

  const wrap = document.createElement('div')
  wrap.className = 'mermaid-host'
  wrap.style.cssText =
    'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:transparent;overflow:visible'

  const svgClone = liveSvg.cloneNode(true) as SVGSVGElement
  svgClone.style.cssText =
    'max-width:100%;max-height:100%;width:100%;height:auto;overflow:visible;background:transparent'
  svgClone.removeAttribute('width')
  svgClone.removeAttribute('height')
  if (!svgClone.getAttribute('viewBox')) {
    try {
      const bb = liveSvg.getBBox()
      if (bb.width > 2 && bb.height > 2) {
        svgClone.setAttribute(
          'viewBox',
          `${bb.x - 8} ${bb.y - 8} ${bb.width + 16} ${bb.height + 16}`,
        )
      }
    } catch {
      /* keep */
    }
  }
  svgClone.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  wrap.appendChild(svgClone)
  temp.appendChild(wrap)
  document.body.appendChild(temp)

  try {
    bakeDiagramSvgForCapture(wrap, CAPTURE_CONTRAST)
    await new Promise((r) => requestAnimationFrame(r))

    const canvas = await html2canvas(temp, {
      // null = transparent; matches card fill when injected
      backgroundColor: null,
      scale: captureScale,
      logging: false,
      useCORS: true,
      allowTaint: true,
      foreignObjectRendering,
      width: capW,
      height: capH,
      windowWidth: Math.max(capW + 12, 100),
      windowHeight: Math.max(capH + 12, 100),
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      onclone: (doc: Document) => {
        const t = doc.querySelector(
          '[data-export-diag-temp="1"]',
        ) as HTMLElement | null
        if (!t) return
        t.style.background = 'transparent'
        const h =
          (t.querySelector('.mermaid-host') as HTMLElement | null) || t
        bakeDiagramSvgForCapture(h, CAPTURE_CONTRAST)
        h.style.background = 'transparent'
      },
    })
    return canvas.toDataURL('image/png')
  } finally {
    temp.remove()
  }
}

/**
 * Capture flowchart / mindmap for Studio SVG export.
 *
 * Strategy (best of 14 + 16):
 *  - process-flow snapshots → vector SVG data URL (sharp, transparent; like 14)
 *  - Mermaid FO diagrams → flatten labels → transparent PNG (like 16, no black plate)
 *  - html2canvas only as last resort under cover
 */
export async function captureDiagramHostV2(
  host: HTMLElement,
  scale = 2,
): Promise<CaptureResult | null> {
  const liveSvg = host.querySelector('svg') as SVGSVGElement | null
  if (!liveSvg) return null

  const testId = host.getAttribute('data-testid') || ''
  const isProcessFlow = testId === 'process-flow-view'
  const hasFoLabel = Boolean(
    liveSvg.querySelector(
      'foreignObject .nodeLabel, foreignObject .edgeLabel, foreignObject p, foreignObject span',
    ),
  )

  // 1) Pure process-flow / no FO labels → vector (sharp edges, transparent bg)
  if (isProcessFlow || !hasFoLabel) {
    const vec = captureDiagramAsSvgDataUrl(host)
    if (vec) return vec
  }

  // 2) Mermaid (htmlLabels FO) → transparent PNG after FO→text flatten
  const viaImage = await rasterizeSvgViaImage(liveSvg, scale)
  if (viaImage) return viaImage

  // 3) html2canvas under cover
  const { w: capW, h: capH } = naturalSvgPixelSize(
    liveSvg,
    host.offsetWidth || 320,
    host.offsetHeight || 240,
  )
  const captureScale = Math.min(2, Math.max(1.5, scale))
  const removeCover = installExportCaptureCover()
  try {
    for (const fo of [true, false]) {
      try {
        const dataUrl = await html2canvasDiagramTemp(
          liveSvg,
          capW,
          capH,
          captureScale,
          fo,
        )
        if (dataUrl && (await acceptUsefulDiagramPng(dataUrl, 4_000, 10))) {
          return { dataUrl, contentW: capW, contentH: capH }
        }
      } catch (e) {
        console.warn('[exportSvg] html2canvas fallback failed', fo, e)
      }
    }
  } finally {
    removeCover()
  }

  // 4) Vector fallback even with FO (flattened)
  const vec2 = captureDiagramAsSvgDataUrl(host)
  if (vec2) return vec2

  return null
}

/**
 * Capture diagrams and return PNG/SVG data URLs keyed by host index.
 */
export async function extractDiagramPlacements(
  pageEl: HTMLElement,
  opts?: { scale?: number },
): Promise<DiagramPlacement[]> {
  const scale = opts?.scale ?? 2
  const hosts = findDiagramHosts(pageEl)
  const out: DiagramPlacement[] = []

  hosts.forEach((h, i) => h.setAttribute('data-export-diag-idx', String(i)))

  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i]!
    const cap = await captureDiagramHostV2(host, scale)
    if (!cap) {
      console.warn(
        '[exportSvg] keeping live Mermaid (capture rejected)',
        i,
        host.getAttribute('data-testid'),
      )
      continue
    }
    out.push({
      idx: i,
      dataUrl: cap.dataUrl,
      contentW: cap.contentW,
      contentH: cap.contentH,
    })
  }

  return out
}

/**
 * Size a process/diagram card so the PNG aspect fits (export clone only).
 * LR strips get width; TD/mindmap get height.
 */
export function sizeExportCardForDiagram(
  card: HTMLElement,
  contentW: number,
  contentH: number,
  pageW: number,
): void {
  const ar = contentW / Math.max(contentH, 1)
  const left = parseFloat(String(card.style.left || 0)) || 0
  let cw = parseFloat(String(card.style.width || 0)) || 200
  let ch = parseFloat(String(card.style.height || 0)) || 100
  const maxW = Math.max(120, pageW - left - 24)
  // Title row + padding chrome inside card
  const chrome = 30

  if (ar >= 2) {
    // Horizontal flowchart — need width for readable node labels
    cw = Math.max(cw, Math.min(maxW, Math.max(400, Math.round(pageW * 0.58))))
    const bodyH = Math.max(78, Math.round((cw - 16) / ar))
    ch = Math.max(ch, bodyH + chrome)
  } else if (ar <= 0.85) {
    // Tall TD
    cw = Math.max(cw, Math.min(maxW, 220))
    const bodyH = Math.max(180, Math.round((cw - 16) / ar))
    ch = Math.max(ch, Math.min(440, bodyH + chrome))
  } else {
    // Mindmap / balanced
    cw = Math.max(cw, Math.min(maxW, 260))
    const bodyH = Math.max(200, Math.round((cw - 16) / ar))
    ch = Math.max(ch, Math.min(400, bodyH + chrome))
  }

  card.style.width = `${Math.round(cw)}px`
  card.style.height = `${Math.round(ch)}px`
  card.style.overflow = 'hidden'
}

/**
 * After export-only card growth, push lower cards down so nothing overlaps.
 */
export function reflowExportCards(clone: HTMLElement, gap = 8): void {
  type R = { el: HTMLElement; l: number; t: number; w: number; h: number }
  const rects: R[] = Array.from(
    clone.querySelectorAll<HTMLElement>('[data-export-card]'),
  ).map((el) => ({
    el,
    l: parseFloat(String(el.style.left || 0)) || 0,
    t: parseFloat(String(el.style.top || 0)) || 0,
    w: parseFloat(String(el.style.width || 0)) || 0,
    h: parseFloat(String(el.style.height || 0)) || 0,
  }))

  for (let pass = 0; pass < 10; pass++) {
    let moved = false
    rects.sort((a, b) => a.t - b.t || a.l - b.l)
    for (let i = 0; i < rects.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = rects[j]!
        const b = rects[i]!
        const ox = b.l < a.l + a.w - 0.5 && b.l + b.w > a.l + 0.5
        const oy = b.t < a.t + a.h - 0.5 && b.t + b.h > a.t + 0.5
        if (!ox || !oy) continue
        const nt = a.t + a.h + gap
        if (nt > b.t + 0.5) {
          b.t = nt
          b.el.style.top = `${Math.round(nt)}px`
          moved = true
        }
      }
    }
    if (!moved) break
  }
}

/**
 * Replace captured hosts with <img> that fills the host (object-fit:contain).
 * Does NOT change card geometry — export layout matches export-preview.
 */
export function injectDiagramImagesIntoClone(
  clone: HTMLElement,
  diagrams: DiagramPlacement[],
  _opts?: { pageWidth?: number },
): void {
  void _opts
  for (const d of diagrams) {
    const host = clone.querySelector(
      `[data-export-diag-idx="${d.idx}"]`,
    ) as HTMLElement | null
    if (!host) continue

    // Keep card chrome (title) intact — only replace diagram host contents
    const card = host.closest('[data-export-card]') as HTMLElement | null
    if (card) {
      const shell = card.firstElementChild as HTMLElement | null
      if (shell) {
        // Ensure title row isn't clipped by zero padding / overflow
        if (!shell.style.padding || shell.style.padding === '0px') {
          shell.style.padding = '6px'
        }
        shell.style.overflow = 'hidden'
        shell.style.display = 'flex'
        shell.style.flexDirection = 'column'
      }
    }

    host.innerHTML = ''
    host.style.display = 'flex'
    host.style.alignItems = 'center'
    host.style.justifyContent = 'center'
    host.style.overflow = 'hidden'
    host.style.background = 'transparent'
    host.style.flex = '1 1 auto'
    host.style.width = '100%'
    host.style.height = '100%'
    host.style.minHeight = '0'
    host.style.minWidth = '0'
    const img = clone.ownerDocument!.createElement('img')
    img.setAttribute('src', d.dataUrl)
    img.setAttribute('alt', 'diagram')
    img.setAttribute('data-mermaid-raster', '1')
    // Self-close friendly for XML serialization
    img.setAttribute('width', '100%')
    img.setAttribute('height', '100%')
    img.style.cssText =
      'display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;object-position:center;background:transparent;border:0;margin:0;padding:0;'
    host.appendChild(img)
  }

  // Force card titles visible in standalone SVG (some viewers drop weak CSS)
  clone.querySelectorAll<HTMLElement>('[data-export-card-title]').forEach((el) => {
    el.style.display = 'block'
    el.style.visibility = 'visible'
    el.style.opacity = '1'
    el.style.color = '#a1a1aa'
    el.style.flexShrink = '0'
    el.style.overflow = 'hidden'
    el.style.textOverflow = 'ellipsis'
    el.style.whiteSpace = 'nowrap'
    el.style.textTransform = 'uppercase'
    el.style.letterSpacing = '0.04em'
    el.style.fontWeight = '500'
    if (!el.style.fontSize) el.style.fontSize = '9px'
    if (!el.style.minHeight) el.style.minHeight = '14px'
  })
}

/** Clear only successfully captured hosts (tests / legacy). */
export function stripCapturedDiagramsFromClone(
  clone: HTMLElement,
  capturedIdx: number[],
): void {
  for (const idx of capturedIdx) {
    const host = clone.querySelector(
      `[data-export-diag-idx="${idx}"]`,
    ) as HTMLElement | null
    if (host) host.innerHTML = ''
  }
}

/** @deprecated */
export function stripDiagramsFromClone(clone: HTMLElement): void {
  clone.querySelectorAll(DIAGRAM_HOST_SELECTOR).forEach((h) => {
    h.innerHTML = ''
  })
}

/** HTML void tags must be self-closing inside SVG foreignObject XHTML. */
export function selfCloseHtmlVoidTags(html: string): string {
  return html.replace(
    /<(img|br|hr|input|meta|link|col|area|base|embed|source|track|wbr)(\s[^>/]*?)?\s*>/gi,
    (_m, tag: string, attrs = '') => `<${tag}${attrs || ''} />`,
  )
}

function serializeXhtmlFragment(root: HTMLElement): string {
  let inner = ''
  try {
    inner = new XMLSerializer().serializeToString(root)
  } catch {
    inner = root.outerHTML
  }
  inner = sanitizeHtmlForXml(inner)
  inner = selfCloseHtmlVoidTags(inner)
  // Nested live Mermaid <style> must not break outer CDATA; already outside CDATA
  // as element text — escape residual raw < in style is handled by serializer.
  inner = inner.replace(
    /^<([a-zA-Z][\w:-]*)(\s[^>]*)?>/,
    (_m, tag: string, rest = '') => {
      if (/\sxmlns=/.test(rest)) return `<${tag}${rest}>`
      return `<${tag} xmlns="${XHTML_NS}"${rest}>`
    },
  )
  return inner
}

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Serialize export page to SVG: inject diagram PNGs into card DOM, then wrap.
 */
export async function pageElementToSvgString(
  el: HTMLElement,
  opts: {
    width: number
    height: number
    backgroundColor?: string | null
    colorMode?: ExportColorMode
    title?: string
    diagramScale?: number
  },
): Promise<string> {
  const w = Math.max(1, Math.round(opts.width))
  const h = Math.max(1, Math.round(opts.height))
  const bg = resolveSvgPageBackground(opts.backgroundColor)
  const colorMode = opts.colorMode ?? 'color'
  const title = (opts.title ?? 'cheatsheet').replace(/[<>&]/g, '')

  void el.offsetWidth
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  )

  const diagrams = await extractDiagramPlacements(el, {
    scale: opts.diagramScale ?? 2,
  })

  const clone = el.cloneNode(true) as HTMLElement
  // Layout stays identical to export-preview; only rasterize diagram hosts.
  injectDiagramImagesIntoClone(clone, diagrams, { pageWidth: w })
  clone.style.background = bg

  const inner = serializeXhtmlFragment(clone)
  const css = collectDocumentCss()
  const filter = colorFilterCss(colorMode)
  const bgRect = `<rect width="100%" height="100%" fill="${escapeXmlAttr(bg)}"/>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <title>${escapeXmlText(title)}</title>
  <desc>CheatSheet Studio SVG. Layout matches export-preview; diagrams as transparent PNG/SVG (no black plates); card titles preserved.</desc>
  ${bgRect}
  <foreignObject x="0" y="0" width="${w}" height="${h}">
    <div xmlns="${XHTML_NS}" style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${escapeXmlAttr(bg)};${filter}">
      <style type="text/css"><![CDATA[
${css}
img[data-mermaid-raster="1"] {
  width:100% !important; height:100% !important; object-fit:contain !important;
  object-position:center !important; background:transparent !important;
}
[data-export-card] [data-testid="mermaid-view"],
[data-export-card] [data-testid="process-flow-view"] {
  flex: 1 1 auto !important; min-height: 0 !important; width: 100% !important; height: 100% !important;
  background: transparent !important;
}
/* Card titles must stay visible (match export-preview chrome) */
[data-export-card-title] {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  color: #a1a1aa !important;
  flex-shrink: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  text-transform: uppercase !important;
  letter-spacing: 0.04em !important;
  font-weight: 500 !important;
  line-height: 1.6 !important;
  pointer-events: none !important;
}
      ]]></style>
      ${inner}
    </div>
  </foreignObject>
</svg>
`
}

export function downloadSvgString(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  triggerBlobDownload(blob, filename)
}

export function svgFilename(title: string, page?: number): string {
  return sanitizeExportFilename(title, 'svg', page)
}

/**
 * Parse outer size of a standalone page SVG from pageElementToSvgString.
 */
export function parseSvgOuterSize(svg: string): { width: number; height: number } {
  const vb = svg.match(/viewBox\s*=\s*["']0\s+0\s+([\d.]+)\s+([\d.]+)["']/i)
  if (vb) {
    return {
      width: Math.max(1, Math.round(Number(vb[1]))),
      height: Math.max(1, Math.round(Number(vb[2]))),
    }
  }
  const w = svg.match(/\bwidth\s*=\s*["']([\d.]+)["']/i)
  const h = svg.match(/\bheight\s*=\s*["']([\d.]+)["']/i)
  return {
    width: Math.max(1, Math.round(Number(w?.[1] ?? 816))),
    height: Math.max(1, Math.round(Number(h?.[1] ?? 1056))),
  }
}

/**
 * Encode a standalone page SVG as a data URI for embedding via `<image>`.
 * Prefer UTF-8 percent-encoding (no binary btoa) so Node tests + browsers work.
 */
export function svgStringToDataUri(svg: string): string {
  const cleaned = svg.replace(/^\uFEFF?/, '').trim()
  // encodeURIComponent is XML-safe inside href="..."
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleaned)}`
}

/**
 * Stitch multiple page SVGs into one file (export “All together”).
 *
 * **Why not nested `<svg>`?** Each page embeds a large `<style><![CDATA[…]]>`
 * block + XHTML foreignObject. Nesting those under one root confuses strict
 * XML viewers (Firefox: “Unclosed <![CDATA[”, “Unexpected end of stream”).
 *
 * **Approach:** embed each page as a self-contained `<image href="data:image/svg+xml,…">`.
 * The outer document is tiny, well-formed SVG with no nested CDATA.
 */
export function stitchSvgPages(
  pages: string[],
  opts?: {
    title?: string
    /** vertical stack (default) or board-relative asSheet via origins */
    arrangement?: 'vertical' | 'asSheet'
    /** Board origins for asSheet (same order as pages). */
    origins?: Array<{ x: number; y: number }>
    backgroundColor?: string | null
    /** Collapse px between stacked pages (top+bottom margins) when dissolving. */
    dissolveGutterPx?: number
  },
): string {
  if (pages.length === 0) {
    throw new Error('stitchSvgPages: no pages')
  }
  if (pages.length === 1) return pages[0]!

  const title = (opts?.title ?? 'cheatsheet').replace(/[<>&]/g, '')
  const sizes = pages.map(parseSvgOuterSize)
  const arrangement = opts?.arrangement ?? 'vertical'
  const bg = resolveSvgPageBackground(opts?.backgroundColor)
  const dissolveGutter = Math.max(0, opts?.dissolveGutterPx ?? 0)

  let placements: Array<{ x: number; y: number; w: number; h: number }>
  if (arrangement === 'asSheet' && opts?.origins?.length === pages.length) {
    const minX = Math.min(...opts.origins.map((o) => o.x))
    const minY = Math.min(...opts.origins.map((o) => o.y))
    placements = opts.origins.map((o, i) => ({
      x: o.x - minX,
      y: o.y - minY,
      w: sizes[i]!.width,
      h: sizes[i]!.height,
    }))
  } else {
    let y = 0
    placements = sizes.map((s, i) => {
      const p = { x: 0, y, w: s.width, h: s.height }
      const step =
        i < sizes.length - 1 && dissolveGutter > 0
          ? Math.max(1, s.height - dissolveGutter)
          : s.height
      y += step
      return p
    })
  }

  const totalW = Math.max(...placements.map((p) => p.x + p.w), 1)
  const totalH = Math.max(...placements.map((p) => p.y + p.h), 1)

  const images = pages
    .map((svg, i) => {
      const p = placements[i]!
      const href = svgStringToDataUri(svg)
      // href (SVG2) + xlink:href (older viewers). preserveAspectRatio=none so
      // letter pages fill their slots exactly.
      return `  <!-- page ${i + 1} -->
  <image
    x="${p.x}" y="${p.y}"
    width="${p.w}" height="${p.h}"
    preserveAspectRatio="none"
    href="${href}"
    xlink:href="${href}"
  />`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
  <title>${escapeXmlText(title)}</title>
  <desc>CheatSheet Studio multi-page SVG (all together). ${pages.length} pages as embedded images (avoids nested CDATA/XML errors).</desc>
  <rect width="100%" height="100%" fill="${escapeXmlAttr(bg)}"/>
${images}
</svg>
`
}
