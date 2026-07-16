import { describe, expect, it } from 'vitest'
import type { CanvasItem, LayoutPanel } from '@/types'
import {
  resolvePanelMemberIds,
  resyncLayoutPanelMembersFromFolders,
} from './resolveMembers'

const item = (
  id: string,
  folderId: string | null,
  over?: Partial<CanvasItem>,
): CanvasItem =>
  ({
    id,
    type: 'equation',
    title: id,
    x: 0,
    y: 0,
    width: 40,
    height: 30,
    zIndex: 1,
    folderId,
    ...over,
  }) as CanvasItem

describe('resolvePanelMemberIds / folder sync', () => {
  it('prefers live folder membership over stale memberIds', () => {
    const items = [
      item('a', 'old'),
      item('b', 'new'), // was in old panel.memberIds but moved
      item('c', 'old'),
    ]
    const panel: LayoutPanel = {
      id: 'p-old',
      folderId: 'old',
      title: 'Old',
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      // Stale: still lists b after move
      memberIds: ['a', 'b', 'c'],
    }
    const folders = [
      { id: 'old', parentId: null },
      { id: 'new', parentId: null },
    ]
    const ids = resolvePanelMemberIds(panel, items, [panel], folders)
    expect(ids.sort()).toEqual(['a', 'c'])
    expect(ids).not.toContain('b')
  })

  it('resync strips moved cards from old panel and attaches to new', () => {
    const items = [item('a', 'old'), item('b', 'new'), item('c', 'new')]
    const panels: LayoutPanel[] = [
      {
        id: 'p-old',
        folderId: 'old',
        title: 'Old',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        memberIds: ['a', 'b', 'c'],
      },
      {
        id: 'p-new',
        folderId: 'new',
        title: 'New',
        x: 300,
        y: 0,
        width: 200,
        height: 200,
        memberIds: [],
      },
    ]
    const folders = [
      { id: 'old', parentId: null },
      { id: 'new', parentId: null },
    ]
    const next = resyncLayoutPanelMembersFromFolders(panels, items, folders)
    expect(next.find((p) => p.id === 'p-old')?.memberIds).toEqual(['a'])
    expect(next.find((p) => p.id === 'p-new')?.memberIds?.sort()).toEqual([
      'b',
      'c',
    ])
  })

  it('includes nested sub-collection cards under parent panel folder', () => {
    const items = [item('a', 'parent'), item('b', 'child')]
    const panel: LayoutPanel = {
      id: 'p1',
      folderId: 'parent',
      title: 'Parent',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      memberIds: ['a'],
    }
    const folders = [
      { id: 'parent', parentId: null },
      { id: 'child', parentId: 'parent' },
    ]
    const ids = resolvePanelMemberIds(panel, items, [panel], folders)
    expect(ids.sort()).toEqual(['a', 'b'])
  })
})
