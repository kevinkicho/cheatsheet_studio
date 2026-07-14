import type {
  CanvasItem,
  LayoutPanel,
  SheetCanvas,
  TitleAlign,
} from '@/types'
import {
  DEFAULT_CANVAS,
  DEFAULT_MARGINS,
  DEFAULT_TITLE_FONT_SIZE,
  clampGridOpacity,
  normalizeGridExtent,
} from '@/types'
import { CanvasCardBody } from '@/components/canvas/CanvasCardBody'
import { CanvasGridLayer } from '@/components/canvas/CanvasGridLayer'
import {
  CARD_DEFAULTS,
  composeBorderCss,
} from '@/lib/cardDefaults'
import {
  resolveGridCoverage,
  resolvePageGridRect,
} from '@/lib/gridCoverage'
import type { PageRect } from '@/lib/exportPdf'

/** Match main canvas default board fill when canvas.background is missing. */
const DEFAULT_BOARD_BG = '#0f1115'
const DEFAULT_CARD_BG = 'rgba(30,32,40,0.92)'
const DEFAULT_CARD_COLOR = '#e8eaed'

function titleAlignCss(align: TitleAlign | undefined): CanvasTextAlign {
  if (align === 'center' || align === 'right') return align
  return 'left'
}

/**
 * Prefer hex/rgb for export capture — avoid modern color functions
 * that older html2canvas builds cannot parse.
 */
function sanitizeCssColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  if (value === 'transparent') return 'transparent'
  if (/oklch|oklab|lab\(|lch\(|color-mix|color\(/i.test(value)) return fallback
  return value
}

function ExportCard({
  item,
  x,
  y,
}: {
  item: CanvasItem
  x: number
  y: number
}) {
  const style = item.style ?? {}
  const transparent = item.transparentBackground === true
  const showTitle = item.showTitle !== false && Boolean(item.title)
  // Process charts need a little padding so the title row isn't flush/clipped
  const isProcess =
    item.type === 'process-chart' || Boolean(item.mermaidSource)
  const pad =
    style.padding ??
    (isProcess ? Math.max(CARD_DEFAULTS.padding, 6) : CARD_DEFAULTS.padding)
  const border = composeBorderCss(style)
  const bg = transparent
    ? 'transparent'
    : sanitizeCssColor(
        style.background && style.background !== 'transparent'
          ? style.background
          : undefined,
        DEFAULT_CARD_BG,
      )
  const color = sanitizeCssColor(style.color, DEFAULT_CARD_COLOR)
  const fontSize = style.fontSize ?? 18

  const needsMermaid =
    (item.type === 'process-chart' || Boolean(item.mermaidSource)) &&
    !item.processFlow

  return (
    <div
      data-export-card
      data-export-type={item.type}
      data-export-needs-mermaid={needsMermaid ? '1' : undefined}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: item.width,
        height: item.height,
        boxSizing: 'border-box',
        overflow: 'visible',
        zIndex: item.zIndex,
      }}
    >
      {/* Match CanvasItemView: title in flow (reserved), body flex-1 below */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: bg,
          border,
          borderRadius: 8,
          color,
          fontSize,
          padding: pad,
          boxSizing: 'border-box',
          boxShadow: transparent ? 'none' : '0 4px 16px rgba(0,0,0,0.25)',
        }}
      >
        {showTitle && (
          <div
            data-export-card-title
            style={{
              flexShrink: 0,
              height: Math.round(
                (style.titleFontSize ?? DEFAULT_TITLE_FONT_SIZE) * 1.6,
              ),
              minHeight: Math.round(
                (style.titleFontSize ?? DEFAULT_TITLE_FONT_SIZE) * 1.6,
              ),
              marginBottom: 2,
              padding: '0 4px',
              fontSize: style.titleFontSize ?? DEFAULT_TITLE_FONT_SIZE,
              fontWeight: 500,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#a1a1aa',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: titleAlignCss(item.titleAlign),
              lineHeight: 1.6,
              pointerEvents: 'none',
            }}
          >
            {item.title}
          </div>
        )}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <CanvasCardBody item={item} showBadge={false} />
        </div>
      </div>
    </div>
  )
}

export type ExportPageModel = {
  page: PageRect
  items: Array<CanvasItem & { exportX: number; exportY: number }>
}

/**
 * Print pages for preview + capture — same background, grid, and card body
 * as the main viewport (minus selection handles / page labels).
 */
export function PdfExportPages({
  pages,
  canvas,
  pageBackground,
}: {
  pages: ExportPageModel[]
  /** Full sheet canvas — grid + background match MainCanvas. */
  canvas?: SheetCanvas
  /** @deprecated Prefer `canvas.background`. */
  pageBackground?: string
}) {
  const c = canvas ?? { ...DEFAULT_CANVAS, background: pageBackground ?? DEFAULT_BOARD_BG }
  const boardBg = sanitizeCssColor(
    pageBackground ?? c.background,
    DEFAULT_BOARD_BG,
  )
  const margins = { ...DEFAULT_MARGINS, ...c.margins }
  const gridSpacing = Math.max(2, Math.round(c.gridSpacing ?? 24))
  const gridOpacity = clampGridOpacity(c.gridOpacity)
  const extent = normalizeGridExtent(c.gridExtent)
  const { useBoardGrid, usePerPageGrid } = resolveGridCoverage({
    showGrid: c.showGrid === true,
    showPrintArea: c.showPrintArea !== false,
    gridExtent: extent,
  })

  return (
    <div data-pdf-export-root style={{ color: DEFAULT_CARD_COLOR }}>
      {pages.map(({ page, items }) => {
        // Page-local grid geometry (origin = page top-left)
        const pageLocalOrigin = { x: 0, y: 0 }
        const perPageRect =
          usePerPageGrid
            ? resolvePageGridRect(
                extent,
                pageLocalOrigin,
                { width: page.width, height: page.height },
                margins,
              )
            : null

        return (
          <div
            key={page.index}
            data-pdf-page={page.index}
            style={{
              position: 'relative',
              width: page.width,
              height: page.height,
              background: boardBg,
              overflow: 'hidden',
              boxSizing: 'border-box',
              boxShadow: 'none',
              color: DEFAULT_CARD_COLOR,
            }}
          >
            {/* Grid under cards — same tiles / opacity as MainCanvas */}
            {useBoardGrid && (
              <CanvasGridLayer
                left={0}
                top={0}
                width={page.width}
                height={page.height}
                spacing={gridSpacing}
                opacity={gridOpacity}
                phaseX={page.x}
                phaseY={page.y}
              />
            )}
            {perPageRect && (
              <CanvasGridLayer
                left={perPageRect.left}
                top={perPageRect.top}
                width={perPageRect.width}
                height={perPageRect.height}
                spacing={gridSpacing}
                opacity={gridOpacity}
              />
            )}

            {/* Group panels under cards (board → page local coords) */}
            {(c.layoutPanels ?? [])
              .filter((p) => panelIntersectsPage(p, page))
              .map((p) => (
                <ExportLayoutPanel
                  key={p.id}
                  panel={p}
                  x={p.x - page.x}
                  y={p.y - page.y}
                  pageOrigin={{ x: page.x, y: page.y }}
                />
              ))}

            {items.map((it) => (
              <ExportCard
                key={it.id}
                item={it}
                x={it.exportX}
                y={it.exportY}
              />
            ))}

            {/* Titles after cards; deeper hierarchy levels paint last (on top) */}
            {(c.layoutPanels ?? [])
              .filter((p) => panelIntersectsPage(p, page))
              .slice()
              .sort(
                (a, b) => (a.hierarchyLevel ?? 1) - (b.hierarchyLevel ?? 1),
              )
              .map((p) => (
                <ExportLayoutPanelTitle
                  key={`${p.id}-title`}
                  panel={p}
                  pageOrigin={{ x: page.x, y: page.y }}
                />
              ))}
          </div>
        )
      })}
    </div>
  )
}

function panelIntersectsPage(
  p: LayoutPanel,
  page: PageRect,
): boolean {
  return (
    p.x < page.x + page.width &&
    p.x + p.width > page.x &&
    p.y < page.y + page.height &&
    p.y + p.height > page.y
  )
}

function ExportLayoutPanel({
  panel,
  pageOrigin,
}: {
  panel: LayoutPanel
  x: number
  y: number
  pageOrigin: { x: number; y: number }
}) {
  const accent = panel.accent ?? 'rgba(99, 102, 241, 0.55)'
  const isPoly = (panel.shape ?? 'rect') === 'polygon'
  const fill = /rgba?\(/i.test(accent)
    ? accent.replace(/[\d.]+\s*\)$/, isPoly ? '0.04)' : '0.07)')
    : isPoly
      ? 'rgba(99, 102, 241, 0.04)'
      : 'rgba(99, 102, 241, 0.06)'
  const runs =
    panel.runs && panel.runs.length > 0
      ? panel.runs
      : [{ x: panel.x, y: panel.y, width: panel.width, height: panel.height }]
  const useOutline = isPoly && Boolean(panel.outlinePath)
  const ox = pageOrigin.x
  const oy = pageOrigin.y

  return (
    <div
      data-export-layout-panel={panel.id}
      data-layout-panel-shape={panel.shape ?? 'rect'}
    >
      {useOutline ? (
        <>
          {runs.map((r, i) => (
            <div
              key={`${panel.id}-fill-${i}`}
              style={{
                position: 'absolute',
                left: r.x - ox,
                top: r.y - oy,
                width: r.width,
                height: r.height,
                boxSizing: 'border-box',
                border: 'none',
                background: fill,
                zIndex: 0,
                pointerEvents: 'none',
              }}
            />
          ))}
          <svg
            data-export-layout-panel-outline={panel.id}
            width={panel.width + 4}
            height={panel.height + 4}
            viewBox={`${panel.x - 2} ${panel.y - 2} ${panel.width + 4} ${panel.height + 4}`}
            style={{
              position: 'absolute',
              left: panel.x - ox - 2,
              top: panel.y - oy - 2,
              width: panel.width + 4,
              height: panel.height + 4,
              overflow: 'visible',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          >
            <path
              d={panel.outlinePath}
              fill="transparent"
              stroke={accent}
              strokeWidth={1.5}
              strokeLinejoin="miter"
              strokeLinecap="square"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </>
      ) : (
        runs.map((r, i) => (
          <div
            key={`${panel.id}-run-${i}`}
            style={{
              position: 'absolute',
              left: r.x - ox,
              top: r.y - oy,
              width: r.width,
              height: r.height,
              boxSizing: 'border-box',
              border: `1.5px solid ${accent}`,
              borderRadius: 6,
              background: fill,
              zIndex: 0,
              pointerEvents: 'none',
            }}
          />
        ))
      )}
    </div>
  )
}

function ExportLayoutPanelTitle({
  panel,
  pageOrigin,
}: {
  panel: LayoutPanel
  x?: number
  y?: number
  pageOrigin: { x: number; y: number }
}) {
  if (panel.showTitle === false || !panel.title) return null
  const accent = panel.accent ?? 'rgba(99, 102, 241, 0.55)'
  const level = panel.hierarchyLevel ?? 1
  const box = {
    x: panel.x - pageOrigin.x,
    y: panel.y - pageOrigin.y,
    maxW: Math.max(48, panel.width - 8),
  }
  return (
    <div
      data-export-layout-panel-title={panel.id}
      data-layout-panel-title-level={level}
      style={{
        position: 'absolute',
        left: box.x + 4,
        top: box.y + 3,
        maxWidth: box.maxW,
        padding: level <= 1 ? '3px 8px' : '1px 5px',
        fontSize: level <= 1 ? 10 : 8,
        fontWeight: level <= 1 ? 700 : 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: '#e0e7ff',
        lineHeight: 1.25,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        background: 'rgba(15, 17, 21, 0.94)',
        borderRadius: 3,
        border: `1px solid ${accent}`,
        // L1 above L2 so parent header stays readable when nested
        zIndex: level <= 1 ? 60 : 50 + level,
        pointerEvents: 'none',
      }}
    >
      {panel.title}
    </div>
  )
}
