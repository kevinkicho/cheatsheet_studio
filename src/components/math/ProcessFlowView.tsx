/**
 * Renders a free-form process diagram snapshot as SVG.
 * Fills the card like MermaidView (no double FitContent letterbox).
 */
import { useMemo } from 'react'
import {
  isProcessFlowSnapshot,
  processFlowToSvg,
  type ProcessFlowSnapshot,
} from '@/lib/processFlowSnapshot'

type Props = {
  snapshot: ProcessFlowSnapshot
  className?: string
  title?: string
  /**
   * meet = uniform scale (even spacing when resizing card)
   * none = stretch to fill card (non-uniform if card aspect ≠ diagram)
   */
  preserveAspect?: 'meet' | 'none'
}

export function ProcessFlowView({
  snapshot,
  className,
  title,
  preserveAspect = 'meet',
}: Props) {
  // Depend on geometry fields so SVG rebuilds whenever paths/nodes change
  // (object identity alone can miss deep updates from the editor sync).
  const geomKey = [
    snapshot.width,
    snapshot.height,
    snapshot.nodes.map((n) => `${n.id}:${n.x},${n.y},${n.width}x${n.height}`).join(';'),
    snapshot.edges
      .map(
        (e) =>
          `${e.id}:${e.path ?? ''}:${e.labelX ?? ''}:${e.labelY ?? ''}:${e.label ?? ''}`,
      )
      .join(';'),
  ].join('#')

  const svg = useMemo(() => {
    if (!isProcessFlowSnapshot(snapshot)) return ''
    return processFlowToSvg(snapshot, { preserveAspect })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geomKey encodes snapshot paint state
  }, [geomKey, preserveAspect])

  if (!svg) {
    return (
      <div
        className={className}
        style={{ color: '#a1a1aa', fontSize: 12, padding: 8 }}
      >
        Empty diagram
      </div>
    )
  }

  return (
    <div
      className={className}
      title={title}
      role="img"
      aria-label={title ?? 'Process chart'}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
