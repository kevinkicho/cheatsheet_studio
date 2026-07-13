/**
 * Live edge paint registry — exact paths FlowEdge is drawing right now.
 * captureProcessFlow prefers these so canvas cards match the interactive editor 1:1.
 */
export type LiveEdgePaint = {
  path: string
  labelX: number
  labelY: number
}

const paints = new Map<string, LiveEdgePaint>()

export function setLiveEdgePaint(edgeId: string, paint: LiveEdgePaint): void {
  if (!paint.path) {
    paints.delete(edgeId)
    return
  }
  paints.set(edgeId, paint)
}

export function getLiveEdgePaint(edgeId: string): LiveEdgePaint | undefined {
  return paints.get(edgeId)
}

export function clearLiveEdgePaint(edgeId: string): void {
  paints.delete(edgeId)
}

export function clearAllLiveEdgePaint(): void {
  paints.clear()
}
