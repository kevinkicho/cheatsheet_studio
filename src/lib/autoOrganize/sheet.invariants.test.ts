/**
 * Kitchen-sink hard invariants for full-sheet auto-layout.
 *
 * These must stay green. Layout thrash happened because soft tests passed while
 * screenshots failed. See LAYOUT_INVARIANTS.md before changing postPlace.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { packCheatsheetLayout } from './packCheatsheet'
import type { LayoutPanel } from '@/types'

const SHEET = 'examples/agent-out/everything.sheet.json'

const DEFAULT_OPTS = {
  density: 'sm' as const,
  multiPage: true,
  fitPrint: true,
  dissolvePrintArea: true,
  groupChrome: 'panels' as const,
  panelShape: 'rect' as const,
  panelGroupLevels: [1, 2] as const,
  panelBorderLevels: [1, 2] as const,
  groupSort: 'name-asc' as const,
  gap: 2,
  l1PanelGap: 2,
  l2PanelGap: 2,
  blockGap: 2,
  panelPadding: 4,
}

function packEverything() {
  const sheet = JSON.parse(readFileSync(SHEET, 'utf8'))
  return packCheatsheetLayout(
    sheet.items,
    { ...sheet.canvas, dissolvePrintArea: true, printPageCount: 8 },
    { ...DEFAULT_OPTS, folders: sheet.folders },
  )
}

function strokedL1(panels: LayoutPanel[]) {
  return panels
    .filter((p) => (p.hierarchyLevel ?? 1) === 1 && p.showStroke !== false)
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

function l2Under(l1: LayoutPanel, panels: LayoutPanel[]) {
  return panels.filter(
    (p) =>
      (p.hierarchyLevel ?? 1) === 2 &&
      p.showStroke !== false &&
      l1.memberIds?.length &&
      p.memberIds?.every((id) => l1.memberIds!.includes(id)),
  )
}

function aabbOverlap(a: LayoutPanel, b: LayoutPanel, eps = 2) {
  const xOl =
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const yOl =
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return xOl > eps && yOl > eps
}

/** Nearest-neighbor stroke gaps (true edge-aligned neighbors only). */
function neighborGaps(panels: LayoutPanel[]) {
  const H: number[] = []
  const V: number[] = []
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i]!
      const b = panels[j]!
      const xOl =
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const yOl =
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      if (xOl > 8) {
        const g = Math.max(
          0,
          Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)),
        )
        if (g < 80) V.push(g)
      } else if (yOl > 8) {
        const g = Math.max(
          0,
          Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)),
        )
        if (g < 80) H.push(g)
      }
    }
  }
  const stats = (arr: number[]) => {
    if (arr.length === 0) return { n: 0, min: 0, p50: 0, max: 0 }
    const s = [...arr].sort((a, b) => a - b)
    return {
      n: s.length,
      min: s[0]!,
      p50: s[Math.floor(s.length / 2)]!,
      max: s[s.length - 1]!,
    }
  }
  return { H: stats(H), V: stats(V) }
}

function cardFill(l1: LayoutPanel, items: { id: string; hidden?: boolean; x: number; y: number; width: number; height: number }[]) {
  const members = (l1.memberIds ?? [])
    .map((id) => items.find((i) => i.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c && !c.hidden)
  if (members.length === 0 || l1.width * l1.height < 1) return 0
  const area = members.reduce((s, m) => s + m.width * m.height, 0)
  return area / (l1.width * l1.height)
}

describe.skipIf(!existsSync(SHEET))('sheet auto-layout kitchen-sink invariants', () => {
  const packed = packEverything()
  const panels = packed.layoutPanels ?? []
  const l1s = strokedL1(panels)

  it('A: L1 topics stack A→Z top-to-bottom without interleave', () => {
    expect(l1s.length).toBeGreaterThanOrEqual(5)
    const titles = l1s.map((p) => p.title ?? '')
    // Numbered kitchen-sink topics: 1. Biology … 7. Physics
    const sorted = [...titles].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
    )
    expect(titles).toEqual(sorted)
    for (let i = 1; i < l1s.length; i++) {
      const prev = l1s[i - 1]!
      const cur = l1s[i]!
      // No vertical interleave: each L1 starts at/after previous bottom
      expect(cur.y).toBeGreaterThanOrEqual(prev.y + prev.height - 2)
    }
  })

  it('B: no same-level paint overlaps (L1 peers or L2 siblings under same L1)', () => {
    const hits: string[] = []
    for (let i = 0; i < l1s.length; i++) {
      for (let j = i + 1; j < l1s.length; j++) {
        if (aabbOverlap(l1s[i]!, l1s[j]!)) {
          hits.push(`L1: ${l1s[i]!.title} ∩ ${l1s[j]!.title}`)
        }
      }
    }
    for (const l1 of l1s) {
      const l2 = l2Under(l1, panels)
      for (let i = 0; i < l2.length; i++) {
        for (let j = i + 1; j < l2.length; j++) {
          if (aabbOverlap(l2[i]!, l2[j]!)) {
            hits.push(`${l1.title}: ${l2[i]!.title} ∩ ${l2[j]!.title}`)
          }
        }
      }
    }
    expect(hits).toEqual([])
  })

  it('C: L2 neighbor stroke gaps floor near user L2 gap (2px) on both axes', () => {
    const bio = l1s.find((p) => /biology/i.test(p.title ?? ''))
    const chem = l1s.find((p) => /chemistry/i.test(p.title ?? ''))
    expect(bio).toBeTruthy()
    expect(chem).toBeTruthy()
    for (const l1 of [bio!, chem!]) {
      const l2 = l2Under(l1, panels)
      expect(l2.length).toBeGreaterThanOrEqual(4)
      const g = neighborGaps(l2)
      // True neighbors should often sit at ~user gap (allow pad/chrome noise)
      if (g.H.n > 0) {
        expect(g.H.min).toBeLessThanOrEqual(12)
        expect(g.H.p50).toBeLessThanOrEqual(24)
      }
      if (g.V.n > 0) {
        expect(g.V.min).toBeLessThanOrEqual(12)
        expect(g.V.p50).toBeLessThanOrEqual(24)
      }
    }
  })

  it('D: no empty L1 shells (Biology + Chemistry card fill floor)', () => {
    // Guards Swiss-cheese L1s (screenshot 155735) and hollow Chemistry shells.
    const bio = l1s.find((p) => /biology/i.test(p.title ?? ''))!
    const chem = l1s.find((p) => /chemistry/i.test(p.title ?? ''))!
    const bioFill = cardFill(bio, packed.items)
    const chemFill = cardFill(chem, packed.items)
    expect(bioFill).toBeGreaterThan(0.5)
    expect(chemFill).toBeGreaterThan(0.42)
    expect(l2Under(chem, panels).length).toBeGreaterThanOrEqual(6)
    // L2 coverage: fraction of L1 covered by any L2 AABB (catches sparse skyline)
    const coverage = (l1: LayoutPanel) => {
      const l2 = l2Under(l1, panels)
      if (l2.length === 0) return 0
      const step = 12
      let cells = 0
      let hit = 0
      for (let y = l1.y; y < l1.y + l1.height; y += step) {
        for (let x = l1.x; x < l1.x + l1.width; x += step) {
          cells++
          if (
            l2.some(
              (p) =>
                x >= p.x &&
                x < p.x + p.width &&
                y >= p.y &&
                y < p.y + p.height,
            )
          ) {
            hit++
          }
        }
      }
      return cells > 0 ? hit / cells : 0
    }
    // Hard bar for screenshot 155735 Swiss cheese
    expect(coverage(bio)).toBeGreaterThan(0.7)
    expect(coverage(chem)).toBeGreaterThan(0.6)
  })

  it('E: cards stay finite and inside their L1 chrome (no freefall out of parent)', () => {
    const byId = new Map(packed.items.map((i) => [i.id, i]))
    for (const l1 of l1s) {
      for (const id of l1.memberIds ?? []) {
        const c = byId.get(id)
        if (!c || c.hidden) continue
        expect(Number.isFinite(c.x)).toBe(true)
        expect(Number.isFinite(c.y)).toBe(true)
        expect(c.width).toBeGreaterThan(0)
        // Center of card inside expanded L1 (pad slack)
        const cx = c.x + c.width / 2
        const cy = c.y + c.height / 2
        expect(cx).toBeGreaterThanOrEqual(l1.x - 8)
        expect(cx).toBeLessThanOrEqual(l1.x + l1.width + 8)
        expect(cy).toBeGreaterThanOrEqual(l1.y - 8)
        expect(cy).toBeLessThanOrEqual(l1.y + l1.height + 8)
      }
    }
  })
})
