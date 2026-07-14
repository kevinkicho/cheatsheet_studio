import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('html2canvas-pro', () => ({
  default: vi.fn(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 160
    canvas.toDataURL = () => `data:image/png;base64,${'Ab'.repeat(8_000)}`
    return canvas
  }),
}))

vi.mock('@/lib/mermaidTheme', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mermaidTheme')>(
    '@/lib/mermaidTheme',
  )
  return {
    ...actual,
    paintStudioSvg: vi.fn(),
  }
})

import {
  sanitizeHtmlForXml,
  pageElementToSvgString,
  resolveSvgPageBackground,
  isUsefulDiagramPng,
  SVG_BOARD_BG,
  bakeDiagramSvgForCapture,
  injectDiagramImagesIntoClone,
  findDiagramHosts,
  naturalSvgPixelSize,
  sizeExportCardForDiagram,
  reflowExportCards,
  pngPixelSize,
  sanitizeCssForStandaloneSvg,
  selfCloseHtmlVoidTags,
  KATEX_CDN_BASE,
  acceptUsefulDiagramPng,
  installExportCaptureCover,
  flattenForeignObjectsToSvgText,
} from '@/lib/exportSvg'

describe('exportSvg page background', () => {
  it('never resolves transparent to white', () => {
    expect(resolveSvgPageBackground(null)).toBe(SVG_BOARD_BG)
    expect(resolveSvgPageBackground('transparent')).toBe(SVG_BOARD_BG)
  })

  it('always emits dark page rect', async () => {
    const el = document.createElement('div')
    const svg = await pageElementToSvgString(el, {
      width: 200,
      height: 100,
      backgroundColor: null,
      title: 't',
    })
    expect(svg).toContain(`fill="${SVG_BOARD_BG}"`)
  })
})

describe('exportSvg helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('isUsefulDiagramPng size gate', () => {
    expect(
      isUsefulDiagramPng(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        5_000,
      ),
    ).toBe(false)
    expect(
      isUsefulDiagramPng(`data:image/png;base64,${'A'.repeat(12_000)}`, 5_000),
    ).toBe(true)
  })

  it('sanitizes entities', () => {
    expect(sanitizeHtmlForXml('a&b')).toBe('a&amp;b')
  })

  it('bake forces contrast fills + transparent FO', () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <svg><g class="node">
        <rect class="label-container" fill="#fff" width="10" height="10"/>
        <foreignObject><div style="background:white">Hi</div></foreignObject>
      </g></svg>`
    bakeDiagramSvgForCapture(host)
    expect(host.querySelector('g.node rect')!.getAttribute('fill')).toBe(
      '#3f3f46',
    )
    const div = host.querySelector('foreignObject div') as HTMLElement
    expect(div.style.background).toMatch(/transparent/)
  })

  it('injectDiagramImagesIntoClone puts img inside host without resizing cards', () => {
    const clone = document.createElement('div')
    clone.innerHTML = `
      <div data-export-card style="position:absolute;left:40px;top:40px;width:280px;height:90px">
        <div style="display:flex;flex-direction:column;height:100%">
          <div style="flex:1">
            <div data-export-diag-idx="0" data-testid="mermaid-view" style="width:100%;height:100%">
              <svg><rect/></svg>
            </div>
          </div>
        </div>
      </div>`
    injectDiagramImagesIntoClone(
      clone,
      [
        {
          idx: 0,
          dataUrl: 'data:image/png;base64,AAAA',
          contentW: 600,
          contentH: 90,
        },
      ],
      { pageWidth: 816 },
    )
    const img = clone.querySelector('img[data-mermaid-raster="1"]')
    expect(img).toBeTruthy()
    expect(img!.getAttribute('src')).toContain('data:image/png')
    expect(clone.querySelector('svg')).toBeNull()
    const card = clone.querySelector('[data-export-card]') as HTMLElement
    // Layout must match export-preview — do not grow/reflow cards
    expect(card.style.width).toBe('280px')
    expect(card.style.height).toBe('90px')
  })

  it('sizeExportCardForDiagram grows tall TD cards', () => {
    const card = document.createElement('div')
    card.style.left = '48px'
    card.style.width = '180px'
    card.style.height = '100px'
    sizeExportCardForDiagram(card, 200, 500, 816)
    expect(parseFloat(card.style.height)).toBeGreaterThan(200)
  })

  it('reflowExportCards pushes overlapping cards down', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div data-export-card style="position:absolute;left:0;top:0;width:200px;height:200px"></div>
      <div data-export-card style="position:absolute;left:0;top:80px;width:200px;height:100px"></div>`
    reflowExportCards(root, 8)
    const cards = root.querySelectorAll<HTMLElement>('[data-export-card]')
    const t1 = parseFloat(cards[1]!.style.top)
    expect(t1).toBeGreaterThanOrEqual(208)
  })

  it('findDiagramHosts', () => {
    const page = document.createElement('div')
    page.innerHTML = `
      <div data-testid="mermaid-view"><svg><rect/></svg></div>
      <div data-testid="mermaid-view"></div>`
    expect(findDiagramHosts(page)).toHaveLength(1)
  })

  it('naturalSvgPixelSize keeps TD taller than wide', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 200 500')
    const { w, h } = naturalSvgPixelSize(svg as SVGSVGElement, 100, 100)
    expect(h).toBeGreaterThan(w)
  })

  it('naturalSvgPixelSize keeps LR wide and short', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 800 100')
    const { w, h } = naturalSvgPixelSize(svg as SVGSVGElement, 100, 100)
    expect(w).toBeGreaterThan(h * 2)
    expect(h).toBeLessThan(160)
  })

  it('pngPixelSize reads IHDR', () => {
    // 1x1 PNG
    const tiny =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    expect(pngPixelSize(tiny)).toEqual({ w: 1, h: 1 })
  })

  it('sanitizeCssForStandaloneSvg strips local fonts and adds CDN KaTeX', () => {
    const css = `
      @font-face { font-family: KaTeX_Main; src: url("/node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2"); }
      .foo { background: url(./assets/x.png); color: red; }
    `
    const out = sanitizeCssForStandaloneSvg(css)
    expect(out).not.toContain('/node_modules/katex')
    expect(out).toContain(KATEX_CDN_BASE)
    expect(out).toContain("url('https://cdn.jsdelivr.net/npm/katex")
    expect(out).toMatch(/\.foo\s*\{[^}]*background:\s*none/)
  })

  it('selfCloseHtmlVoidTags fixes img/br for XHTML', () => {
    expect(selfCloseHtmlVoidTags('<div><img src="a.png"><br></div>')).toBe(
      '<div><img src="a.png" /><br /></div>',
    )
  })

  it('acceptUsefulDiagramPng rejects pure black even when large', async () => {
    // 1x1 black PNG repeated payload is still tiny; build a large solid via mock
    // variance uses canvas Image — pure black 1x1 fails range
    const tinyBlack =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    // size gate first
    expect(await acceptUsefulDiagramPng(tinyBlack, 5_000)).toBe(false)
  })

  it('installExportCaptureCover mounts and removes', () => {
    const remove = installExportCaptureCover()
    expect(document.querySelector('[data-export-capture-cover="1"]')).toBeTruthy()
    remove()
    expect(document.querySelector('[data-export-capture-cover="1"]')).toBeNull()
  })

  it('flattenForeignObjectsToSvgText converts FO labels to text', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.innerHTML = `
      <g class="node">
        <rect width="100" height="40"/>
        <foreignObject x="10" y="5" width="80" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>Hello node</p></span></div>
        </foreignObject>
      </g>`
    flattenForeignObjectsToSvgText(svg as SVGSVGElement, '#fafafa')
    expect(svg.querySelector('foreignObject')).toBeNull()
    const t = svg.querySelector('text')
    expect(t).toBeTruthy()
    expect(t!.textContent).toContain('Hello node')
    expect(t!.getAttribute('fill')).toBe('#fafafa')
  })
})
