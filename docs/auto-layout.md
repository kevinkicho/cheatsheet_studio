# Studio Auto-layout

CheatSheet Studio’s **Auto-layout** packs canvas cards into a dense, multipage
print grid. Entry points:

- Toolbar **grid** button (quick pack at density **Small**)
- Left sidebar **Auto layout** panel (full controls)

Implementation: `packCheatsheetLayout` in [`src/lib/autoOrganize.ts`](../src/lib/autoOrganize.ts).

> CLI / SDK dense pack (`cheatsheet layout`, `everything`) is **related but not
> identical**. After Import JSON, run Studio Auto-layout for the browser packer.

---

## How packing works

1. **Group** cards by Layers folders (and optional section headings).
2. **Ideal size** per card → snap to **grid cells** (default **24px**).
3. **Area scale** so total cell area fills ~N print pages (readable floor:
   title ≥ **10px**, body ≥ **12px**; multipage prefers more pages over crush).
4. Each topic packs into a **natural tight block** (shelf of cards, not fixed
   columns/rows).
5. Topic blocks place with **free-flow maxrects** (hole-fill + gravity) — never
   a rigid row/column band layout.
6. **Paint:** equations/tables natural (`contentFill` off); process/figures fill.

---

## Group chrome

| Mode | Effect |
|------|--------|
| **Topic labels** | Banner heading cards per section |
| **Panels** | Frames around each group (export + canvas) |
| **Both** | Labels + panels |
| **None** | Cards only |

### Panel packing (when chrome includes panels)

| Control | Meaning |
|---------|---------|
| **Rectangle** | Full axis-aligned box around the group (empty corner included) |
| **N-gon (L-fill)** | Chrome follows **occupied card runs** only — L / stepped when the last shelf row is short |
| **Panel gap** | 0–48px clearance between panels (also chrome pad); `0` = flush |

### Panel group levels (multi-select)

Levels are depths in the Layers folder tree (**from the top**):

| Level | Example folders |
|-------|-----------------|
| **1** | `1.`, `2.`, `3.` (top sections) |
| **2** | `1.1`, `1.2` (subsections) |
| **3** | Third level; deeper paths clamp here |

**Multi-select** draws **nested** frames:

- **L1 only** — one panel per top folder (children merged).
- **L2 only** — one panel per subsection.
- **L1 + L2** — outer panel for `1.` wrapping inner panels for `1.1` / `1.2`.
- **L1 + L2 + L3** — three nested shells.

Cards always pack at the **deepest** selected level; chrome is emitted for
**each** selected level (outer pad slightly larger so parents clearly wrap
children).

### Group sort

Orders **panels** (not card order inside a panel):

| Option | Behavior |
|--------|----------|
| **No sorting** | Densest free-flow only |
| **Name A→Z** | Free-flow with soft ascending flow (earlier names tend top-left → later bottom-right) |
| **Name Z→A** | Same with descending flow |

Not a perfect sorted grid — a **noticeable** reading flow while still compacting.

### Per-panel fine-tune

With the **Select** tool, click a panel frame (canvas). Left sidebar shows
**Panel** properties:

- Title / show title chip  
- **Sort cards in panel** (none / A→Z / Z→A) — re-shelves only that panel’s cards  

---

## Density

| Preset | Role |
|--------|------|
| Extra small → Large | Scales content-native ideals; never below readable min card size |

Toolbar quick pack defaults to **Small**.

---

## Tips for agents & authors

1. Prefer **nested Layers folders** (`1.` → `1.1`) so multi-level panels work.
2. After CLI/SDK compose: **Import JSON** → **Auto-layout** → Export.
3. For chapter-scale frames: select **Level 1** (and **2** if you want nested
   subsection frames).
4. Use **N-gon** when groups have uneven last rows and you want L-shaped chrome
   instead of empty corners.

See also: root [README.md](../README.md) · [agent-sdk.md](./agent-sdk.md) · [cli.md](./cli.md).
