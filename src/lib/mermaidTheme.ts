import type { MermaidThemeId } from '@/types'
import type { MermaidConfig } from 'mermaid'
import mermaid from 'mermaid'

/**
 * Studio Process theming for process-chart cards and MermaidView.
 * Product docs: docs/process-charts.md
 *
 * Stack:
 *  1) initialize(base + themeVariables) + frontmatter + flowchart-only classDef
 *  2) htmlLabels:true so node boxes match label metrics
 *  3) paintStudioSvg: rewrite pale fills in Mermaid <style> (keep fonts!) +
 *     id-scoped color CSS + attr/style !important
 *  4) forced-color-adjust:none — Chrome Auto Dark must not invert SVG
 *
 * Do NOT delete Mermaid's injected <style> wholesale (causes label overflow).
 */

export const STUDIO_PREVIEW_BG = '#12141a' as const

/** Zinc palette for studio dark process charts (nodes on dark chrome). */
export const STUDIO_DARK = {
  nodeFill: '#27272a',
  nodeStroke: '#71717a',
  nodeText: '#f4f4f5',
  edge: '#a1a1aa',
  edgeLabelBg: '#3f3f46',
  clusterFill: '#18181b',
  clusterStroke: '#3f3f46',
  bg: STUDIO_PREVIEW_BG,
} as const

/** Mutable color bag — capture may use higher-contrast values than live canvas. */
export type StudioColors = {
  nodeFill: string
  nodeStroke: string
  nodeText: string
  edge: string
  edgeLabelBg: string
  clusterFill: string
  clusterStroke: string
  bg: string
}

export const MERMAID_DARK_THEME_VARIABLES: Record<string, string | boolean> = {
  darkMode: true,
  background: STUDIO_DARK.bg,
  primaryColor: STUDIO_DARK.nodeFill,
  primaryTextColor: STUDIO_DARK.nodeText,
  primaryBorderColor: STUDIO_DARK.nodeStroke,
  secondaryColor: STUDIO_DARK.edgeLabelBg,
  secondaryTextColor: STUDIO_DARK.nodeText,
  secondaryBorderColor: STUDIO_DARK.nodeStroke,
  tertiaryColor: STUDIO_DARK.clusterFill,
  tertiaryTextColor: STUDIO_DARK.nodeText,
  tertiaryBorderColor: STUDIO_DARK.clusterStroke,
  lineColor: STUDIO_DARK.edge,
  textColor: STUDIO_DARK.nodeText,
  mainBkg: STUDIO_DARK.nodeFill,
  nodeBorder: STUDIO_DARK.nodeStroke,
  clusterBkg: STUDIO_DARK.clusterFill,
  clusterBorder: STUDIO_DARK.clusterStroke,
  titleColor: STUDIO_DARK.nodeText,
  edgeLabelBackground: STUDIO_DARK.edgeLabelBg,
  nodeTextColor: STUDIO_DARK.nodeText,
  actorBkg: STUDIO_DARK.nodeFill,
  actorBorder: STUDIO_DARK.nodeStroke,
  actorTextColor: STUDIO_DARK.nodeText,
  actorLineColor: STUDIO_DARK.edge,
  signalColor: STUDIO_DARK.edge,
  signalTextColor: STUDIO_DARK.nodeText,
  labelBoxBkgColor: STUDIO_DARK.edgeLabelBg,
  labelBoxBorderColor: STUDIO_DARK.nodeStroke,
  labelTextColor: STUDIO_DARK.nodeText,
  loopTextColor: STUDIO_DARK.nodeText,
  noteBkgColor: STUDIO_DARK.edgeLabelBg,
  noteTextColor: STUDIO_DARK.nodeText,
  noteBorderColor: STUDIO_DARK.nodeStroke,
  classText: STUDIO_DARK.nodeText,
  // Match Mermaid flowchart layout metrics (default inject is 16px + trebuchet-like).
  // If paint CSS uses a different size after we strip Mermaid <style>, labels overflow.
  fontFamily:
    'trebuchet ms, verdana, arial, sans-serif',
  fontSize: '16px',
}

export function usesStudioDarkVariables(theme: MermaidThemeId): boolean {
  return (
    theme === 'dark' ||
    theme === 'base' ||
    theme === 'neutral' ||
    theme === 'default'
  )
}

/** Same family Mermaid uses when laying out flowchart node boxes. */
const FONT = 'trebuchet ms, verdana, arial, sans-serif'

const FLOW = {
  // htmlLabels:true → Mermaid sizes boxes from real label metrics (no clipped text).
  // We still hard-paint shapes + foreignObject colors for dark studio chrome.
  htmlLabels: true as const,
  curve: 'basis' as const,
  padding: 18,
  nodeSpacing: 50,
  rankSpacing: 55,
  useMaxWidth: false,
  wrappingWidth: 200,
}

export function mermaidInitOptions(
  theme: MermaidThemeId,
  opts?: { studioDark?: boolean },
): MermaidConfig {
  const studioDark = opts?.studioDark ?? usesStudioDarkVariables(theme)

  if (studioDark) {
    return {
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      themeVariables: { ...MERMAID_DARK_THEME_VARIABLES },
      fontFamily: FONT,
      // Root htmlLabels takes precedence in Mermaid 11
      htmlLabels: true,
      flowchart: { ...FLOW },
    }
  }

  return {
    startOnLoad: false,
    securityLevel: 'loose',
    theme,
    fontFamily: FONT,
    htmlLabels: true,
    flowchart: { ...FLOW },
  }
}

// ── Source prep (frontmatter + flowchart classDef) ───────────────────────────

/**
 * True when Mermaid source is a flowchart/graph (only family that accepts
 * `classDef` syntax). Sequence, state, class, ER, pie, mindmap reject it.
 */
export function mermaidSourceSupportsClassDef(source: string): boolean {
  // Strip YAML frontmatter if present
  let body = source.trim()
  if (/^---\s*\r?\n/.test(body)) {
    const end = body.indexOf('\n---', 3)
    if (end !== -1) {
      body = body.slice(end + 4).trim()
    }
  }
  // Skip blank / comment lines
  const first = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('%%'))
  if (!first) return false
  return /^(flowchart|graph)\b/i.test(first)
}

/**
 * Prepend official frontmatter (+ flowchart-only classDef default).
 * classDef is flowchart/graph syntax only — never append for sequence/state/etc.
 * (User errors: state "DEFAULT_CLASSDEF_ID", sequence "got 'TXT'".)
 */
export function prepareStudioDarkSource(
  source: string,
  colors: StudioColors = STUDIO_DARK,
): string {
  let text = source.trim()
  if (!text) return text

  const hasFrontmatter = /^---\s*\r?\n/.test(text)
  if (!hasFrontmatter) {
    const fm = `---
config:
  theme: base
  themeVariables:
    darkMode: true
    background: "${colors.bg}"
    primaryColor: "${colors.nodeFill}"
    primaryTextColor: "${colors.nodeText}"
    primaryBorderColor: "${colors.nodeStroke}"
    mainBkg: "${colors.nodeFill}"
    lineColor: "${colors.edge}"
    nodeBorder: "${colors.nodeStroke}"
    nodeTextColor: "${colors.nodeText}"
    textColor: "${colors.nodeText}"
    classText: "${colors.nodeText}"
    edgeLabelBackground: "${colors.edgeLabelBg}"
    clusterBkg: "${colors.clusterFill}"
    clusterBorder: "${colors.clusterStroke}"
---
`
    text = fm + text
  }

  // Flowchart/graph only — classDef breaks sequence, state, class, ER, pie, mindmap
  if (
    mermaidSourceSupportsClassDef(text) &&
    !/classDef\s+default\b/i.test(text)
  ) {
    text += `\n    classDef default fill:${colors.nodeFill},stroke:${colors.nodeStroke},color:${colors.nodeText}`
  }

  return text
}

// ── Hard paint (layout-safe fill rewrite) ────────────────────────────────────

const NONE = new Set(['none', 'transparent'])

function force(
  el: Element,
  fill?: string,
  stroke?: string,
  color?: string,
): void {
  const s = el as SVGElement
  if (fill !== undefined) {
    el.setAttribute('fill', fill)
    s.style.setProperty('fill', fill, 'important')
  }
  if (stroke !== undefined) {
    el.setAttribute('stroke', stroke)
    s.style.setProperty('stroke', stroke, 'important')
  }
  if (color !== undefined) {
    s.style.setProperty('color', color, 'important')
  }
}

/**
 * Rewrite Mermaid-injected CSS fills (keep font-size/family so labels still fit
 * the boxes Mermaid already laid out). Then inject id-scoped overrides.
 */
function rewriteAndInjectStudioStyles(
  root: Element,
  colors: StudioColors,
): void {
  const svg =
    root.tagName.toLowerCase() === 'svg'
      ? root
      : root.querySelector('svg')
  if (!svg) return

  // Rewrite pale fills in Mermaid's own sheet — do NOT delete font-size rules
  svg.querySelectorAll('style').forEach((st) => {
    if (st.getAttribute('data-studio-paint') === '1') return
    let css = st.textContent || ''
    css = css
      .replace(/#ECECFF/gi, colors.nodeFill)
      .replace(/#ececff/gi, colors.nodeFill)
      .replace(/#EAEAEA/gi, colors.nodeFill)
      .replace(/#eaeaea/gi, colors.nodeFill)
      // common light label chips
      .replace(/#f9f9f9/gi, colors.edgeLabelBg)
      .replace(/#fff(?:fff)?\b/gi, colors.nodeFill)
    st.textContent = css
  })

  const doc = svg.ownerDocument || document
  if (!svg.getAttribute('id')) {
    svg.setAttribute(
      'id',
      `studio-mmd-${Math.random().toString(36).slice(2, 9)}`,
    )
  }
  const sid = svg.getAttribute('id') || 'studio-mmd'
  svg.setAttribute(
    'style',
    [
      svg.getAttribute('style') || '',
      'color-scheme:dark',
      'forced-color-adjust:none',
      '-webkit-print-color-adjust:exact',
      'print-color-adjust:exact',
      'overflow:visible',
    ]
      .filter(Boolean)
      .join(';'),
  )

  svg.querySelectorAll('style[data-studio-paint="1"]').forEach((s) => s.remove())
  const st = doc.createElementNS
    ? doc.createElementNS('http://www.w3.org/2000/svg', 'style')
    : doc.createElement('style')
  st.setAttribute('data-studio-paint', '1')
  // Colors only — never override font-size (layout already baked node widths)
  st.textContent = `
    #${sid} {
      color-scheme: dark;
      forced-color-adjust: none;
      overflow: visible;
    }
    /* Flowchart nodes */
    #${sid} g.node > path, #${sid} g.node > rect, #${sid} g.node > polygon,
    #${sid} g.node > circle, #${sid} g.node > ellipse,
    #${sid} g.node path.label-container, #${sid} g.node rect.label-container,
    #${sid} g.node .basic.label-container {
      fill: ${colors.nodeFill} !important;
      stroke: ${colors.nodeStroke} !important;
    }
    #${sid} g.node path[fill="none"], #${sid} g.node path[fill="transparent"],
    #${sid} g.node rect[fill="none"], #${sid} g.node rect[fill="transparent"] {
      fill: none !important;
    }
    #${sid} g.node text, #${sid} g.node tspan {
      fill: ${colors.nodeText} !important;
      color: ${colors.nodeText} !important;
    }
    #${sid} g.node foreignObject,
    #${sid} g.node foreignObject div,
    #${sid} g.node .nodeLabel,
    #${sid} g.node span {
      color: ${colors.nodeText} !important;
      background: transparent !important;
      background-color: transparent !important;
    }
    /* Mindmap nodes (Mermaid 11 — not g.node) */
    #${sid}.mindmapDiagram g rect,
    #${sid}.mindmapDiagram g polygon,
    #${sid}.mindmapDiagram g circle,
    #${sid}.mindmapDiagram g ellipse,
    #${sid}.mindmapDiagram g path.mindmap-node,
    #${sid}.mindmapDiagram g > path:not(.mindmap-edge):not([stroke-linecap]),
    #${sid} g.mindmap-node > path,
    #${sid} g.mindmap-node > rect,
    #${sid} g.mindmap-node > polygon,
    #${sid} g.mindmap-node > circle,
    #${sid} g.mindmap-node > ellipse,
    #${sid} section.mindmap-node,
    #${sid} [class*="mindmap-node"] > path,
    #${sid} [class*="mindmap-node"] > rect,
    #${sid} [class*="section-"] > path,
    #${sid} [class*="section-"] > rect {
      fill: ${colors.nodeFill} !important;
      stroke: ${colors.nodeStroke} !important;
    }
    #${sid}.mindmapDiagram text,
    #${sid}.mindmapDiagram tspan,
    #${sid} g.mindmap-node text,
    #${sid} g.mindmap-node tspan {
      fill: ${colors.nodeText} !important;
      color: ${colors.nodeText} !important;
    }
    #${sid}.mindmapDiagram foreignObject,
    #${sid}.mindmapDiagram foreignObject div,
    #${sid}.mindmapDiagram foreignObject span,
    #${sid} g.mindmap-node foreignObject,
    #${sid} g.mindmap-node foreignObject div {
      color: ${colors.nodeText} !important;
      background: transparent !important;
      background-color: transparent !important;
    }
    #${sid}.mindmapDiagram path[class*="edge"],
    #${sid}.mindmapDiagram line,
    #${sid}.mindmapDiagram polyline {
      fill: none !important;
      stroke: ${colors.edge} !important;
    }
    #${sid} .edgePath path, #${sid} .flowchart-link, #${sid} path.flowchart-link,
    #${sid} .edgePaths path {
      fill: none !important;
      stroke: ${colors.edge} !important;
    }
    #${sid} marker path, #${sid} .arrowheadPath {
      fill: ${colors.edge} !important;
      stroke: ${colors.edge} !important;
    }
    #${sid} .edgeLabel rect, #${sid} .labelBkg, #${sid} g.edgeLabel > rect {
      fill: ${colors.edgeLabelBg} !important;
      stroke: ${colors.clusterStroke} !important;
    }
    #${sid} .edgeLabel text, #${sid} .edgeLabel tspan,
    #${sid} g.edgeLabel text, #${sid} g.edgeLabel tspan {
      fill: ${colors.nodeText} !important;
      color: ${colors.nodeText} !important;
    }
    #${sid} g.edgeLabel foreignObject,
    #${sid} g.edgeLabel foreignObject div,
    #${sid} g.edgeLabel span {
      color: ${colors.nodeText} !important;
      background: ${colors.edgeLabelBg} !important;
      background-color: ${colors.edgeLabelBg} !important;
    }
    #${sid} g.cluster rect {
      fill: ${colors.clusterFill} !important;
      stroke: ${colors.clusterStroke} !important;
    }
  `
  svg.insertBefore(st, svg.firstChild)
}

/**
 * Force node/edge paints — rewrite Mermaid CSS, inject overrides, set attrs.
 * Preserves Mermaid font metrics so labels stay inside node boxes.
 */
function paintNodeGroupShapes(
  g: Element,
  colors: StudioColors,
): void {
  g.querySelectorAll('path, rect, polygon, circle, ellipse').forEach((el) => {
    if (el.closest('.katex')) return
    if (
      el.closest(
        '.edgePath, .flowchart-link, .edgePaths, marker, defs',
      )
    ) {
      return
    }
    try {
      const bb = (el as SVGGraphicsElement).getBBox?.()
      if (bb && bb.width < 0.5 && bb.height < 0.5) return
    } catch {
      /* not rendered yet */
    }
    const fa = (el.getAttribute('fill') || '').toLowerCase()
    if (NONE.has(fa)) {
      // label-container often starts as none then CSS paints — force fill
      const cls = (el.getAttribute('class') || '').toLowerCase()
      if (
        cls.includes('label-container') ||
        cls.includes('basic') ||
        cls.includes('mindmap') ||
        el.parentElement?.classList.contains('node') ||
        el.parentElement?.classList.contains('mindmap-node')
      ) {
        force(el, colors.nodeFill, colors.nodeStroke)
        return
      }
      force(el, undefined, colors.nodeStroke)
      return
    }
    // Always dark zinc for closed node/mindmap shapes (never leave white/pale)
    force(el, colors.nodeFill, colors.nodeStroke)
  })
  g.querySelectorAll('text, tspan').forEach((el) => {
    if (el.closest('.katex')) return
    force(el, colors.nodeText, undefined, colors.nodeText)
    el.setAttribute('fill', colors.nodeText)
  })
  g.querySelectorAll(
    'foreignObject div, foreignObject span, .nodeLabel, foreignObject',
  ).forEach((el) => {
    const h = el as HTMLElement
    if (!h.style) return
    h.style.setProperty('color', colors.nodeText, 'important')
    h.style.setProperty('background', 'transparent', 'important')
    h.style.setProperty('background-color', 'transparent', 'important')
  })
}

/**
 * Force node/edge paints — rewrite Mermaid CSS, inject overrides, set attrs.
 * Covers flowcharts (g.node) and mindmaps (mindmapDiagram / mindmap-node).
 * Preserves Mermaid font metrics so labels stay inside node boxes.
 */
export function paintStudioSvg(
  root: Element,
  colors: StudioColors = STUDIO_DARK,
): void {
  rewriteAndInjectStudioStyles(root, colors)

  // Flowchart nodes
  root.querySelectorAll('g.node').forEach((g) => {
    paintNodeGroupShapes(g, colors)
  })

  // Mindmap nodes — Mermaid 11 class mindmapDiagram + section/mindmap-node groups
  const mindRoots = root.matches?.('svg.mindmapDiagram')
    ? [root]
    : Array.from(root.querySelectorAll('svg.mindmapDiagram, .mindmapDiagram'))
  if (mindRoots.length === 0 && root.querySelector('[class*="mindmap"]')) {
    mindRoots.push(root)
  }
  mindRoots.forEach((svg) => {
    svg
      .querySelectorAll(
        'g.mindmap-node, g[class*="section-"], g[class*="mindmap"], [class*="mindmap-node"]',
      )
      .forEach((g) => paintNodeGroupShapes(g, colors))
    // Fallback: any closed shape not on an edge
    svg
      .querySelectorAll('path, rect, polygon, circle, ellipse')
      .forEach((el) => {
        if (
          el.closest(
            '.edgePath, .flowchart-link, .edgePaths, marker, defs, line',
          )
        ) {
          return
        }
        const fa = (el.getAttribute('fill') || '').toLowerCase()
        if (NONE.has(fa) && !el.getAttribute('class')?.includes('node')) {
          // skip pure connectors
          const tag = el.tagName.toLowerCase()
          if (tag === 'path' && !el.closest('g.mindmap-node, g.node')) {
            const d = el.getAttribute('d') || ''
            // thin connector-like paths often have no area fill
            if (!d.includes('z') && !d.includes('Z')) {
              force(el, 'none', colors.edge)
              return
            }
          }
        }
        try {
          const bb = (el as SVGGraphicsElement).getBBox?.()
          if (bb && bb.width < 0.5 && bb.height < 0.5) return
        } catch {
          /* ignore */
        }
        if (NONE.has(fa) && fa === 'none') {
          // only force if it looks like a closed node path
          const d = (el.getAttribute('d') || '').toLowerCase()
          if (d.includes('z') || el.tagName.toLowerCase() !== 'path') {
            force(el, colors.nodeFill, colors.nodeStroke)
          }
          return
        }
        force(el, colors.nodeFill, colors.nodeStroke)
      })
    svg.querySelectorAll('text, tspan').forEach((el) => {
      force(el, colors.nodeText, undefined, colors.nodeText)
      el.setAttribute('fill', colors.nodeText)
    })
    svg
      .querySelectorAll('foreignObject, foreignObject div, foreignObject span')
      .forEach((el) => {
        const h = el as HTMLElement
        if (!h.style) return
        h.style.setProperty('color', colors.nodeText, 'important')
        h.style.setProperty('background', 'transparent', 'important')
        h.style.setProperty('background-color', 'transparent', 'important')
      })
  })

  root
    .querySelectorAll(
      '.edgePath path, .flowchart-link, path.flowchart-link, .edgePaths path',
    )
    .forEach((el) => {
      force(el, 'none', colors.edge)
    })

  root.querySelectorAll('marker path, .arrowheadPath').forEach((el) => {
    force(el, colors.edge, colors.edge)
  })

  root
    .querySelectorAll('.edgeLabel rect, .labelBkg, g.edgeLabel > rect')
    .forEach((el) => {
      force(el, colors.edgeLabelBg, colors.clusterStroke)
    })

  root.querySelectorAll('g.cluster rect').forEach((el) => {
    force(el, colors.clusterFill, colors.clusterStroke)
  })

  root
    .querySelectorAll(
      '.edgeLabel text, .edgeLabel tspan, g.edgeLabel text, g.edgeLabel tspan, .cluster text',
    )
    .forEach((el) => {
      force(el, colors.nodeText, undefined, colors.nodeText)
      el.setAttribute('fill', colors.nodeText)
    })

  root
    .querySelectorAll(
      'g.edgeLabel foreignObject div, g.edgeLabel foreignObject span',
    )
    .forEach((el) => {
      const h = el as HTMLElement
      if (!h.style) return
      h.style.setProperty('color', colors.nodeText, 'important')
      h.style.setProperty('background', colors.edgeLabelBg, 'important')
      h.style.setProperty('background-color', colors.edgeLabelBg, 'important')
    })
}

/** Paint SVG markup string; return new markup. */
export function applyStudioPaintToSvgString(
  svg: string,
  colors: StudioColors = STUDIO_DARK,
): string {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return svg
  }
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.querySelector('parsererror')) return svg
  paintStudioSvg(root, colors)
  return new XMLSerializer().serializeToString(root)
}

// ── Serialized render ────────────────────────────────────────────────────────

let renderChain: Promise<unknown> = Promise.resolve()

export type MermaidRenderRequest = {
  id: string
  source: string
  theme: MermaidThemeId
  studioDark?: boolean
}

export type MermaidRenderResult = {
  svg: string
  mainBkg?: string
  theme?: string
}

export function renderMermaidSvg(
  req: MermaidRenderRequest,
): Promise<MermaidRenderResult> {
  const run = async (): Promise<MermaidRenderResult> => {
    const studioDark =
      req.studioDark !== undefined
        ? req.studioDark
        : usesStudioDarkVariables(req.theme)

    mermaid.initialize(mermaidInitOptions(req.theme, { studioDark }))

    const source = studioDark
      ? prepareStudioDarkSource(req.source)
      : req.source

    const { svg: raw } = await mermaid.render(req.id, source)

    const svg = studioDark ? applyStudioPaintToSvgString(raw) : raw

    let mainBkg: string | undefined
    let themeName: string | undefined
    try {
      const cfg = mermaid.mermaidAPI.getConfig()
      mainBkg = cfg.themeVariables?.mainBkg as string | undefined
      themeName = cfg.theme as string | undefined
    } catch {
      /* ignore */
    }
    return { svg, mainBkg, theme: themeName }
  }

  const next = renderChain.then(run, run)
  renderChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}
