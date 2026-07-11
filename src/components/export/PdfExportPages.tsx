import type { CanvasItem, TitleAlign } from '@/types'
import { FitContent } from '@/components/math/FitContent'
import { FigureView } from '@/components/math/FigureView'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import {
  CARD_DEFAULTS,
  composeBorderCss,
  isFigureLike,
} from '@/lib/cardDefaults'
import type { PageRect } from '@/lib/exportPdf'

const TITLE_BAND = 22

function titleAlignCss(align: TitleAlign | undefined): CanvasTextAlign {
  if (align === 'center' || align === 'right') return align
  return 'left'
}

/**
 * Prefer hex/rgb for export capture — avoid Tailwind class colors (oklch)
 * which older html2canvas builds cannot parse.
 */
function sanitizeCssColor(value: string | undefined, fallback: string): string {
  if (!value || value === 'transparent') return fallback
  // Reject modern color functions that can still slip through item styles
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
  const figure = isFigureLike(item)
  const transparent = item.transparentBackground === true
  const showTitle = item.showTitle !== false
  const pad = style.padding ?? 12
  const border = composeBorderCss(style)
  // Light paper theme for export (hex only)
  const bg = transparent
    ? 'transparent'
    : sanitizeCssColor(
        style.background && style.background !== 'transparent'
          ? style.background
          : undefined,
        '#f8fafc',
      )
  const color = sanitizeCssColor(
    style.color && style.color !== '#e8eaed' ? style.color : undefined,
    '#111827',
  )
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
        overflow: 'hidden',
        background: bg,
        border,
        borderRadius: 6,
        color,
        fontSize,
        padding: pad,
        display: 'flex',
        flexDirection: 'column',
        zIndex: item.zIndex,
      }}
    >
      {showTitle && (
        <div
          style={{
            flexShrink: 0,
            height: TITLE_BAND - 4,
            marginBottom: 4,
            fontSize: 11,
            fontWeight: 600,
            color: '#374151',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: titleAlignCss(item.titleAlign),
          }}
        >
          {item.title || 'Untitled'}
        </div>
      )}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {figure && item.imageUrl ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <FigureView
              src={item.imageUrl}
              alt={item.title || 'figure'}
              className=""
            />
          </div>
        ) : (
          <FitContent
            className=""
            baseFontSize={fontSize}
            maxScale={CARD_DEFAULTS.maxFillScale}
            contentKey={item.latex ?? item.tableMarkdown ?? item.id}
          >
            {(item.type === 'equation' ||
              item.type === 'custom-equation' ||
              item.latex) &&
              item.latex && (
                <LatexView
                  latex={item.latex}
                  className="export-latex"
                />
              )}
            {(item.type === 'table' || item.tableMarkdown) &&
              item.tableMarkdown && (
                <MarkdownTable
                  markdown={item.tableMarkdown}
                  fitContent
                  printTheme
                  className=""
                />
              )}
          </FitContent>
        )}
      </div>
    </div>
  )
}

export type ExportPageModel = {
  page: PageRect
  items: Array<CanvasItem & { exportX: number; exportY: number }>
}

/**
 * Off-screen white print pages for capture (light theme for paper).
 * Uses inline styles only so html2canvas-pro does not hit Tailwind oklch.
 */
export function PdfExportPages({
  pages,
}: {
  pages: ExportPageModel[]
}) {
  return (
    <div data-pdf-export-root style={{ color: '#111827' }}>
      {pages.map(({ page, items }) => (
        <div
          key={page.index}
          data-pdf-page={page.index}
          style={{
            position: 'relative',
            width: page.width,
            height: page.height,
            background: '#ffffff',
            overflow: 'hidden',
            boxSizing: 'border-box',
            boxShadow: 'none',
            color: '#111827',
          }}
        >
          {items.map((it) => (
            <ExportCard
              key={it.id}
              item={it}
              x={it.exportX}
              y={it.exportY}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
