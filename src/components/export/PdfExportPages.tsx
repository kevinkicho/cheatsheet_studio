import type { CanvasItem, SheetCanvas, TitleAlign } from '@/types'
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
  const pad = style.padding ?? CARD_DEFAULTS.padding
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

  return (
    <div
      data-export-card
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
            style={{
              flexShrink: 0,
              height: Math.round(
                (style.titleFontSize ?? DEFAULT_TITLE_FONT_SIZE) * 1.6,
              ),
              marginBottom: 2,
              padding: '0 2px',
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

            {items.map((it) => (
              <ExportCard
                key={it.id}
                item={it}
                x={it.exportX}
                y={it.exportY}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
