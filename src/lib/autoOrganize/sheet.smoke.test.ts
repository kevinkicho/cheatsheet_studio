import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { packCheatsheetLayout } from "./packCheatsheet"

describe("sheet auto-layout smoke", () => {
  const path = "examples/agent-out/everything.sheet.json"
  it.skipIf(!existsSync(path))("packs everything without throw / L1 L2 paint-overlap", () => {
    const sheet = JSON.parse(readFileSync(path, "utf8"))
    let packed
    expect(() => {
      packed = packCheatsheetLayout(
        sheet.items,
        { ...sheet.canvas, dissolvePrintArea: true, printPageCount: 8 },
        {
          density: "sm", multiPage: true, folders: sheet.folders, fitPrint: true,
          dissolvePrintArea: true, groupChrome: "panels", panelShape: "rect",
          panelGroupLevels: [1, 2], panelBorderLevels: [1, 2], groupSort: "name-asc",
          gap: 2, l1PanelGap: 2, l2PanelGap: 2, blockGap: 2, panelPadding: 4,
        },
      )
    }).not.toThrow()
    const panels = packed!.layoutPanels ?? []
    expect(panels.length).toBeGreaterThan(5)
    expect(packed!.items.length).toBeGreaterThan(10)

    // Same-level L2 overlaps under same L1
    const l1s = panels.filter((p) => (p.hierarchyLevel ?? 1) === 1)
    const hits: string[] = []
    for (const l1 of l1s) {
      const l2 = panels.filter(
        (p) =>
          (p.hierarchyLevel ?? 1) === 2 &&
          p.memberIds?.every((id) => l1.memberIds?.includes(id)),
      )
      for (let i = 0; i < l2.length; i++) {
        for (let j = i + 1; j < l2.length; j++) {
          const a = l2[i]!, b = l2[j]!
          const xOl = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
          const yOl = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
          if (xOl > 2 && yOl > 2) hits.push(`${l1.title}: ${a.title} ∩ ${b.title}`)
        }
      }
    }
    console.log("L1 count", l1s.length, "panels", panels.length, "hits", hits.length, hits.slice(0, 12))
    // Also L1 peer overlaps
    for (let i = 0; i < l1s.length; i++) {
      for (let j = i + 1; j < l1s.length; j++) {
        const a = l1s[i]!, b = l1s[j]!
        const xOl = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const yOl = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if (xOl > 2 && yOl > 2) hits.push(`L1: ${a.title} ∩ ${b.title}`)
      }
    }
    console.log("all hits", hits)
    // Same-level panel paint overlaps must stay empty (gap/compact regressions)
    expect(hits).toEqual([])
    // Cards NaN?
    const bad = packed!.items.filter((i) => !Number.isFinite(i.x) || !Number.isFinite(i.y) || i.width < 1)
    expect(bad).toEqual([])
  })
})
