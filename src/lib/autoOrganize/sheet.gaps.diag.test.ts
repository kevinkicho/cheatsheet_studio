import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { packCheatsheetLayout } from "./packCheatsheet"
import type { LayoutPanel } from "@/types"

function measureL2Gaps(panels: LayoutPanel[], l1: LayoutPanel) {
  const l2 = panels.filter(
    (p) =>
      (p.hierarchyLevel ?? 1) === 2 &&
      l1.memberIds?.length &&
      p.memberIds?.every((id) => l1.memberIds!.includes(id)),
  )
  const gaps: number[] = []
  for (let i = 0; i < l2.length; i++) {
    for (let j = i + 1; j < l2.length; j++) {
      const a = l2[i]!, b = l2[j]!
      const xOl = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const yOl = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      if (xOl > 2) {
        // vertical neighbors
        const yg = Math.max(0, Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)))
        if (yg < 200) gaps.push(yg)
      } else if (yOl > 2) {
        const xg = Math.max(0, Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)))
        if (xg < 200) gaps.push(xg)
      }
    }
  }
  gaps.sort((a, b) => a - b)
  return { n: l2.length, min: gaps[0], p25: gaps[Math.floor(gaps.length * 0.25)], med: gaps[Math.floor(gaps.length / 2)], max: gaps[gaps.length - 1], sample: gaps.slice(0, 15) }
}

describe("sheet auto-layout L2 gap fidelity", () => {
  const path = "examples/agent-out/everything.sheet.json"
  it.skipIf(!existsSync(path))("Biology L2 neighbor gaps near user 2px", () => {
    const sheet = JSON.parse(readFileSync(path, "utf8"))
    const packed = packCheatsheetLayout(
      sheet.items,
      { ...sheet.canvas, dissolvePrintArea: true, printPageCount: 8 },
      {
        density: "sm", multiPage: true, folders: sheet.folders, fitPrint: true,
        dissolvePrintArea: true, groupChrome: "panels", panelShape: "rect",
        panelGroupLevels: [1, 2], panelBorderLevels: [1, 2], groupSort: "name-asc",
        gap: 2, l1PanelGap: 2, l2PanelGap: 2, blockGap: 2, panelPadding: 4,
      },
    )
    const panels = packed.layoutPanels ?? []
    const l1 = panels.find((p) => /biology/i.test(p.title ?? "") && (p.hierarchyLevel ?? 1) === 1)!
    const m = measureL2Gaps(panels, l1)
    console.log("L2 gaps", m)
    // Neighboring L2s should often be near user gap (allow pad noise ≤ 8)
    // If min is huge, packing voids dominate
    expect(m.min).toBeLessThanOrEqual(12)
  })
})
