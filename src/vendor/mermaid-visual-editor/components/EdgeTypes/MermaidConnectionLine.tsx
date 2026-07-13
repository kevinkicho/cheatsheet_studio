/**
 * Connection preview while dragging a new edge — rubber-band from the port
 * you started on to the cursor (matches manual plug feel).
 */
import type { ConnectionLineComponentProps } from '@xyflow/react'

export function MermaidConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
}: ConnectionLineComponentProps) {
  // Straight rubber band — endpoints are the actual handles RF reports
  const path = `M${fromX},${fromY} L${toX},${toY}`

  return (
    <g>
      <path
        fill="none"
        stroke="var(--neu-icon-active, #818cf8)"
        strokeWidth={1.5}
        strokeDasharray="6 4"
        d={path}
        className="react-flow__connection-path"
      />
    </g>
  )
}
