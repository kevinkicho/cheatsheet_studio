import type { LayoutPanel } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'

function accentFill(accent: string, alpha = 0.08): string {
  if (/rgba?\(/i.test(accent)) {
    return accent.replace(/[\d.]+\s*\)$/, `${alpha})`)
  }
  return `rgba(99, 102, 241, ${alpha})`
}

/**
 * Layout panel frames. Clickable when Select tool is active so users can
 * fine-tune title / content sort in the left sidebar.
 */
export function LayoutPanelsLayer({
  panels,
  interactive = false,
}: {
  panels: LayoutPanel[] | undefined
  interactive?: boolean
}) {
  const selectedPanelId = useCanvasStore((s) => s.selectedPanelId)
  const selectPanel = useCanvasStore((s) => s.selectPanel)

  if (!panels?.length) return null

  return (
    <>
      <div
        className={`absolute inset-0 z-[1] ${interactive ? '' : 'pointer-events-none'}`}
        data-testid="layout-panels-layer"
      >
        {[...panels]
          .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
          .map((p) => {
          const accent = p.accent ?? 'rgba(99, 102, 241, 0.55)'
          // Outer hierarchy levels: lighter fill; inner: slightly stronger
          const level = p.hierarchyLevel ?? 1
          const fill = accentFill(accent, level <= 1 ? 0.04 : 0.08)
          const selected = selectedPanelId === p.id
          const runs =
            p.runs && p.runs.length > 0
              ? p.runs
              : [
                  {
                    x: p.x,
                    y: p.y,
                    width: p.width,
                    height: p.height,
                  },
                ]
          const borderW = selected ? 2 : level <= 1 ? 2 : 1.5

          return (
            <div
              key={p.id}
              data-layout-panel={p.id}
              data-layout-panel-shape={p.shape ?? 'rect'}
              data-layout-panel-level={level}
              data-selected={selected ? '1' : undefined}
            >
              {runs.map((r, i) => (
                <div
                  key={`${p.id}-run-${i}`}
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  onClick={
                    interactive
                      ? (e) => {
                          e.stopPropagation()
                          selectPanel(p.id)
                        }
                      : undefined
                  }
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            selectPanel(p.id)
                          }
                        }
                      : undefined
                  }
                  style={{
                    position: 'absolute',
                    left: r.x,
                    top: r.y,
                    width: r.width,
                    height: r.height,
                    boxSizing: 'border-box',
                    border: selected
                      ? `${borderW}px solid ${accent}`
                      : `${borderW}px solid ${accent}`,
                    borderRadius: level <= 1 ? 8 : 5,
                    background: fill,
                    zIndex: p.zIndex ?? 0,
                    cursor: interactive ? 'pointer' : undefined,
                    boxShadow: selected
                      ? `0 0 0 1px ${accentFill(accent, 0.4)}`
                      : undefined,
                    pointerEvents: interactive ? 'auto' : 'none',
                  }}
                />
              ))}
            </div>
          )
        })}
      </div>

      <div
        className="pointer-events-none absolute inset-0 z-[30]"
        data-testid="layout-panel-titles"
        aria-hidden
      >
        {panels.map((p) => {
          if (p.showTitle === false || !p.title) return null
          const accent = p.accent ?? 'rgba(99, 102, 241, 0.55)'
          const selected = selectedPanelId === p.id
          // N-gon: title on topmost-leftmost run (AABB corner can sit in a hole /
          // another group's territory when free-grid interleaves topics).
          const titleBox = (() => {
            if (p.runs && p.runs.length > 0) {
              const topY = Math.min(...p.runs.map((r) => r.y))
              const anchor = [...p.runs]
                .filter((r) => Math.abs(r.y - topY) < 0.5)
                .sort((a, b) => a.x - b.x)[0]!
              return {
                x: anchor.x,
                y: anchor.y,
                maxW: Math.max(40, anchor.width - 4),
              }
            }
            return { x: p.x, y: p.y, maxW: Math.max(40, p.width - 4) }
          })()
          return (
            <div
              key={`${p.id}-title`}
              data-layout-panel-title={p.id}
              style={{
                position: 'absolute',
                left: titleBox.x + 2,
                top: titleBox.y + 1,
                maxWidth: titleBox.maxW,
                padding: '2px 6px',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: accentFill(accent, 0.98),
                lineHeight: 1.25,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                background: 'rgba(15, 17, 21, 0.82)',
                borderRadius: 3,
                border: selected
                  ? `1px solid ${accent}`
                  : `1px solid ${accentFill(accent, 0.35)}`,
                boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
              }}
            >
              {p.title}
            </div>
          )
        })}
      </div>
    </>
  )
}
