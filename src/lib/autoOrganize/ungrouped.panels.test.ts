import { describe, expect, it } from 'vitest'
import { packCheatsheetLayout } from '@/lib/autoOrganize/packCheatsheet'
import type { CanvasItem, SheetCanvas } from '@/types'
import { DEFAULT_CANVAS } from '@/types'

function eq(
  id: string,
  title: string,
  folderId: string | null,
  x = 0,
  y = 0,
): CanvasItem {
  return {
    id,
    type: 'equation',
    title,
    latex: 'x = 1',
    x,
    y,
    width: 120,
    height: 48,
    zIndex: 1,
    folderId,
  }
}

const canvas: SheetCanvas = {
  ...DEFAULT_CANVAS,
  showPrintArea: true,
  printPageCount: 1,
  width: 900,
  height: 1200,
}

describe('auto-layout panels cover all blocks', () => {
  it('wraps folderless cards in an Ungrouped panel', () => {
    const items = [
      eq('a', 'Loose A', null),
      eq('b', 'Loose B', null),
      eq('c', 'Loose C', null),
    ]
    const packed = packCheatsheetLayout(items, canvas, {
      groupChrome: 'panels',
      panelGroupLevels: [1],
      panelBorderLevels: [1],
      groupByFolder: true,
      folders: [],
      density: 'sm',
    })
    expect(packed.layoutPanels.length).toBeGreaterThan(0)
    const covered = new Set(
      packed.layoutPanels.flatMap((p) => p.memberIds ?? []),
    )
    for (const it of packed.items.filter((i) => !i.hidden)) {
      expect(covered.has(it.id), `card ${it.id} should be in a panel`).toBe(
        true,
      )
    }
    expect(
      packed.layoutPanels.some((p) => /ungrouped/i.test(p.title ?? '')),
    ).toBe(true)
  })

  it('panels foldered + ungrouped cards together', () => {
    const folders = [
      { id: 'f1', name: 'Topic A', parentId: null },
      { id: 'f2', name: 'Topic B', parentId: null },
    ]
    const items = [
      eq('a1', 'In A', 'f1'),
      eq('a2', 'In A2', 'f1'),
      eq('b1', 'In B', 'f2'),
      eq('u1', 'Loose', null),
      eq('u2', 'Loose 2', null),
    ]
    const packed = packCheatsheetLayout(items, canvas, {
      groupChrome: 'panels',
      panelGroupLevels: [1, 2],
      panelBorderLevels: [1, 2],
      groupByFolder: true,
      folders,
      groupSort: 'name-asc',
      density: 'sm',
    })
    const covered = new Set(
      packed.layoutPanels.flatMap((p) => p.memberIds ?? []),
    )
    for (const id of ['a1', 'a2', 'b1', 'u1', 'u2']) {
      expect(covered.has(id), id).toBe(true)
    }
    // Stacked/placed: all non-hidden have finite coords in pack band
    for (const it of packed.items.filter((i) => !i.hidden)) {
      expect(Number.isFinite(it.x)).toBe(true)
      expect(Number.isFinite(it.y)).toBe(true)
      expect(it.width).toBeGreaterThan(0)
      expect(it.height).toBeGreaterThan(0)
    }
  })
})
