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
| **None** | Cards only |

### Panel packing (when chrome is **Panels**)

| Control | Meaning |
|---------|---------|
| **Rectangle** | Full axis-aligned box around the group (empty corner included) |
| **N-gon (L-fill)** | Stepped/L polyomino chrome on **all bordered levels**. Fill per run; single exterior outline (no double borders). |
| **Level 1 panel gap** | Distance between outer (L1) topic frames |
| **Level 2 panel gap** | Distance between L2 subsection frames inside an L1 |
| **Block gap** | Distance between cards inside a leaf pack |
| **Panel pad** | Chrome inset (cards → frame stroke only) |

Rect and n-gon packing both honor these gaps. Title/header bands still clear
cards (exclusive title strip is separate from gap knobs).

Per-level “n-gon levels” toggles were removed — choose rectangle vs n-gon once for panel packing.

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

Cards pack at the **deepest** selected level. When more than one level is on
(e.g. L1+L2), packing is **hierarchical**: all leaf groups under the same
outer parent are free-flowed **together first**, then those outer boxes
free-flow on the page (**outer gap 0** so L1 frames can touch). That keeps
“1.” cards contiguous so **level-1 panels never stack over “2.” / “3.”**

Chrome rules:

- **Only the outermost level strokes** — one **solid** outer perimeter
  (AABB for multi-level; morphologically closed n-gon for single-level).
  No internal “room walls” inside an L1.
- Inner levels are **title chips only** (no frame fill/border).
- **Adjacent L1 panels merge** with a generous connect distance; shared
  internal edges are dropped. Each L1 keeps its title chip.
- Hierarchical pack expands into residual columns, densifies voids inside
  each L1, and prefers short/wide leaf packs.
- With panels on, **card borders are muted** so structure reads from the
  outer perimeter.

**Multipage:** continuous pack → no content-band straddles → map onto real
pages (margin gutters) → board-aware cleanup so cards never clip mid-page.

**Dissolve print pages** (Sheet properties): merge contiguous page frames into
one continuous printable band by freeing inter-page margin gutters (and slightly
freeing side margins). Auto-layout packs against that **max space**; combined
export collapses the same gutters when stitching.

**Move panels:** Select tool → click a panel → drag (members + nested chrome).

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

- **Auto-layout inside panel** — densely repositions **and resizes** cards to
  fill this frame, then rebuilds chrome (including n-gon outline) so the panel
  fully wraps its content  
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

## Export filename tags

After **Apply auto layout**, Export’s default file name is:

```text
{Sheet title}__auto_{density}_{chrome}_{shape}_L{levels}_{sort}_gap{px}
```

Example:

```text
Studio Everything — Full Catalog__auto_sm_panels_ngon_L1-2_az_gap6.svg
```

| Token | Meaning |
|-------|---------|
| `sm` / `xs` / `md` / `lg` | Density |
| `panels` / `labels` / `both` / `none` | Group chrome |
| `ngon` / `rect` | Panel shape (when chrome includes panels) |
| `L1` / `L1-2` / `L1-2-3` | Panel group levels |
| `az` / `za` / `nosort` | Group sort |
| `gap8` | Free-flow gap (px) |
| `pgap8` | Panel chrome pad (px) |

Share that filename when reporting layout issues so the pack settings are known.

See also: root [README.md](../README.md) · [agent-sdk.md](./agent-sdk.md) · [cli.md](./cli.md).
