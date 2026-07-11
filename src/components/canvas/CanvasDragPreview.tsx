import type { LibraryItem } from '@/types'
import { DEFAULT_ITEM_STYLE } from '@/types'
import { FitContent } from '@/components/math/FitContent'
import { FigureView } from '@/components/math/FigureView'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'

/** Match canvasStore.estimateTableSize defaults for drag preview. */
function previewSize(lib: LibraryItem): { width: number; height: number } {
  if (lib.type === 'table' && lib.tableMarkdown) {
    const lines = lib.tableMarkdown
      .trim()
      .split('\n')
      .filter((l) => l.includes('|') && !/^\|?\s*[-:| ]+\s*\|?$/.test(l.trim()))
    const cols = Math.max(
      ...lines.map(
        (l) =>
          l
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|').length,
      ),
      1,
    )
    const rows = Math.max(lines.length, 1)
    return {
      width: Math.min(520, Math.max(220, cols * 88 + 40)),
      height: Math.min(480, Math.max(100, rows * 28 + 48)),
    }
  }
  if (lib.type === 'figure') return { width: 240, height: 220 }
  return { width: 280, height: 100 }
}

/**
 * Ghost preview while dragging from the library — matches the look of a
 * placed canvas card (not the compact library tile).
 */
export function CanvasDragPreview({ item }: { item: LibraryItem }) {
  const { width, height } = previewSize(item)
  const isFigure = item.type === 'figure' && Boolean(item.imageUrl)
  const style = DEFAULT_ITEM_STYLE
  const pad = isFigure ? 8 : (style.padding ?? 12)
  const titleH = 18
  const bodyH = Math.max(32, height - pad * 2 - titleH)

  return (
    <div
      className="pointer-events-none select-none shadow-2xl ring-2 ring-indigo-400/80"
      style={{
        width,
        height,
        // Same solid panel as canvas cards (figures included)
        background: style.background ?? 'rgba(30,32,40,0.95)',
        border: style.border,
        borderRadius: 8,
        color: style.color ?? '#e8eaed',
        fontSize: style.fontSize ?? 18,
        padding: pad,
        boxSizing: 'border-box',
        boxShadow:
          '0 0 0 1px rgba(129,140,248,0.45), 0 16px 40px rgba(0,0,0,0.45)',
      }}
    >
      <div className="mb-1 truncate text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {item.title}
      </div>
      <div style={{ height: bodyH, width: '100%' }}>
        {isFigure && item.imageUrl ? (
          <FigureView src={item.imageUrl} alt={item.title} />
        ) : (
          <FitContent
            mode="scale"
            minScale={0.2}
            baseFontSize={style.fontSize ?? 18}
            contentKey={`drag-${item.id}`}
            className="h-full w-full"
          >
            {(item.type === 'equation' || item.latex) && item.latex && (
              <LatexView
                latex={item.latex}
                className="overflow-visible text-inherit [&_.katex]:text-[1em] [&_.katex-display]:m-0"
              />
            )}
            {item.type === 'table' && item.tableMarkdown && (
              <MarkdownTable
                markdown={item.tableMarkdown}
                fitContent
                className="overflow-visible"
              />
            )}
          </FitContent>
        )}
      </div>
    </div>
  )
}
