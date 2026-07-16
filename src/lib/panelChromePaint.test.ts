import { describe, expect, it } from 'vitest'
import type { LayoutPanel } from '@/types'
import {
  accentToSolidColor,
  hasNestedStrokedChild,
  panelWantsSoftFill,
  runOverlapArea,
} from './panelChromePaint'

function panel(
  id: string,
  level: 1 | 2 | 3,
  memberIds: string[],
  extra: Partial<LayoutPanel> = {},
): LayoutPanel {
  return {
    id,
    title: id,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    hierarchyLevel: level,
    memberIds,
    showStroke: true,
    accent: 'rgba(16, 185, 129, 0.55)',
    ...extra,
  }
}

describe('panelChromePaint', () => {
  it('detects nested stroked L2 under L1', () => {
    const l1 = panel('L1', 1, ['a', 'b', 'c', 'd'])
    const l2a = panel('L2a', 2, ['a', 'b'])
    const l2b = panel('L2b', 2, ['c', 'd'])
    const all = [l1, l2a, l2b]
    expect(hasNestedStrokedChild(l1, all)).toBe(true)
    expect(hasNestedStrokedChild(l2a, all)).toBe(false)
    expect(panelWantsSoftFill(l1, all)).toBe(false)
    expect(panelWantsSoftFill(l2a, all)).toBe(true)
    expect(panelWantsSoftFill(l2b, all)).toBe(true)
  })

  it('L1 alone (no nested stroke) still soft-fills', () => {
    const l1 = panel('L1', 1, ['a', 'b'])
    expect(panelWantsSoftFill(l1, [l1])).toBe(true)
  })

  it('title-only chrome never soft-fills', () => {
    const chip = panel('chip', 2, ['a'], { showStroke: false })
    const l1 = panel('L1', 1, ['a', 'b'])
    expect(panelWantsSoftFill(chip, [l1, chip])).toBe(false)
  })

  it('accentToSolidColor strips alpha', () => {
    expect(accentToSolidColor('rgba(16, 185, 129, 0.55)')).toBe(
      'rgb(16, 185, 129)',
    )
    expect(accentToSolidColor('#10b981')).toBe('rgb(16, 185, 129)')
  })

  it('runOverlapArea detects overlapping n-gon strips', () => {
    const disjoint = runOverlapArea([
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 0, y: 50, width: 80, height: 40 },
    ])
    expect(disjoint).toBe(0)
    const overlap = runOverlapArea([
      { x: 0, y: 0, width: 100, height: 60 },
      { x: 20, y: 40, width: 100, height: 60 },
    ])
    expect(overlap).toBeGreaterThan(0)
  })
})
