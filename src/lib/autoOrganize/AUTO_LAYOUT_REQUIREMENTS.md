# Auto-layout button — requirements (current baseline)

**Status:** Captured after the dense L1/L2 free-flow fix that restored Biology + Chemistry mosaics (2026-07-15).  
**Entry point (UI):** Properties → **Auto layout** panel → **Apply auto layout** (`AutoLayoutPanel.tsx` → `canvasStore.autoOrganize` → `packCheatsheetLayout`).  
**Enforcement:** `sheet.invariants.test.ts` + `LAYOUT_INVARIANTS.md`.  
**Do not change packing without updating those tests first.**

---

## 1. Product goal

One click packs the **whole sheet** into a dense, readable cheat-sheet layout:

- Cards stay **readable** (density changes size, not illegible microtype).
- **Layers folders** define topic clusters (L1 / L2 / L3 hierarchy).
- **Panels** (default) draw encapsulating frames; optional topic labels or none.
- Layout is **free-flow** (tetris-style), not forced equal columns or row shelves that leave large gutters.
- User knobs for **gaps**, **chrome**, **sort**, and **density** are honored.

Secondary: **AI organize with Ollama** applies the same option shape (or placements) after suggestion.

---

## 2. UI knobs (sidebar defaults)

| Control | Default | Meaning |
|---------|---------|---------|
| Content size (density) | `sm` | xs / sm / md / lg card size ladder (`DENSITY_PRESETS`) |
| Level 1 panel gap | `2` px | Stroke-to-stroke air between **outer** topic frames (L1) |
| Level 2 panel gap | `2` px | Stroke-to-stroke air between **sibling L2** frames inside an L1 |
| Block gap | `2` px | Card-to-card air **inside** a leaf pack |
| Group chrome | `panels` | `labels` \| `panels` \| `none` |
| Panel shape | `rect` | `rect` or `polygon` (n-gon) when chrome = panels |
| Panel pad | `4` px | Card edge → frame stroke only (**not** free-flow gap) |
| Panel group levels | `[1,2,3]` | Hierarchy depths that get group frames |
| Panel borders | `[1,2,3]` | Subset of group levels that draw a stroke |
| Group sort | `name-asc` | `name-asc` \| `name-desc` \| `none` |
| Fit into print box | `true` | Shrink single-page packs to content box |
| Multi-page | always `true` from UI | Prefer more pages over crushing content |
| Dissolve print area | from sheet props | Continuous pack band when on |

Also always from UI: `groupByFolder: true`, folders from canvas store.

**Legacy:** `gap` alias = L1 panel gap (export tags / old snapshots).

---

## 3. Gap semantics (critical)

### 3.1 What the user sees

Gaps are **stroke-to-stroke** (or card-to-card for blocks) in **pixels**, slider step 2, range 0–48.

### 3.2 What the packer must do

| Knob | Visual | Content-AABB clearance (for collision / free-flow) |
|------|--------|-----------------------------------------------------|
| L1 panel gap | Between L1 frames | `l1Gap + 2×pad` when L1 stroked |
| L2 panel gap (horizontal neighbors) | Between side-by-side L2 frames | `l2Gap + 2×pad` (**no title**) |
| L2 panel gap (vertical neighbors) | Between stacked L2 frames | `l2Gap + 2×pad + ~16px title chip` |
| Block gap | Between cards in a leaf | Exact `blockGap` px after densify |
| Panel pad | Inset only | Never treated as frame-to-frame free-flow by itself |

**Axis-aware L2 clear is mandatory.** Baking title into isotropic clearance made H ≈ 18px while V ≈ 2px at user gap 2.

### 3.3 Quantization

- Free-flow may use **grid cells** via `gapPxToCells` (**floor** of px/grid).
- Sub-cell gaps (e.g. 2px on 24px grid) → **0 free-flow cells**; **pixel post-passes** open exact min gaps.
- Do **not** force every positive gap to ≥1 cell (that re-kills 2px fidelity).

### 3.4 Residual voids vs min gap

- Post-passes **push** if closer than min (never only “hope”).
- Densify **pulls** residual free-flow voids **inside each L1** (pixel pack + void-fill).
- True neighbors should sit near user gap (min and p50 within a small band).
- Far non-neighbors may still have large empty distance (empty board, not a knob failure).

---

## 4. Hierarchy & chrome

### 4.1 Levels

- **L1** = top folders (1. Biology, 2. Chemistry, …).
- **L2+** = subsections (1.1, 1.2, …); cards pack at **deepest** selected group level.
- Multi-select levels: outer wraps inner (L1 contains L2 frames).
- **All visible body cards** must end up in some panel (or label section):
  - Layers folders → topic panels (name from folder).
  - Cards with **no** `folderId` → panel titled **Ungrouped**.
  - Orphan safety net after pack still wraps any uncovered card.
- Tier card kinds (definition/list/callout/code/constant/identity-set/plot/matrix)
  are packed like equations/tables — never treated as section heading banners.

### 4.2 Borders

- Only selected border levels draw stroke; off = title chip only where applicable.
- Nested multi-level: avoid useless double-border clutter when product tests specify outermost-only variants.
- N-gon: orthogonal runs / outline follow **card runs**, not empty AABB corners; L2 leaves fully enclose cards.

### 4.3 Titles

- Panel title chips stay clear of cards (`ensureLeafTitleClearance` / exclusive title bands).
- Nested L1 header sits above nested L2 tops (readable parent header).
- Title band is **vertical chrome** only — never inflate horizontal L2 free-flow gap by title height.

---

## 5. Group sort

| Mode | Required behavior |
|------|-------------------|
| `name-asc` | L1 topics **top → bottom** in name order (numeric-aware: 1. Bio before 2. Chem … 7. Phys). No interleave of L1 bands. |
| `name-desc` | Reverse name order for L1 stack. |
| `none` | Document / first-seen order; free-flow may multi-order for density. |

**L2 density vs L2 reading order:** Inside an L1, **densest multi-order footprint pack** is required so shells are not empty. L1 order is the hard sort contract; L2 order is density-first (soft reading flow only if it does not open Swiss cheese).

**Forbidden:** Global gravity with `contentTop = packTop` that ignores other L1s as obstacles (L1 freefall: Biology under #6, General on top).

---

## 6. Density & packing quality

### 6.1 Required look

- **Dense mosaic** of L2 panels inside each L1 (like a filled brickwork, not floating islands).
- No **empty L1 shells** (huge frame + 1–2 panels stuck on an edge).
- No large Swiss-cheese columns beside tall L2s when smaller L2s can fill residual holes.

### 6.2 Kitchen-sink floors (default sidebar opts)

On `examples/agent-out/everything.sheet.json`:

| Check | Floor (approx) |
|-------|----------------|
| Biology card fill (card area / L1 AABB) | ≥ **0.50** |
| Chemistry card fill | ≥ **0.42** |
| Biology L2 coverage (L2 AABBs over L1) | ≥ **0.70** |
| Chemistry L2 coverage | ≥ **0.60** |
| Chemistry L2 count | ≥ **6** |

### 6.3 How packing works (current design)

Per L1:

1. Shrink each L2 **leaf interior** (cards) to a tight free-flow bbox.  
2. **Pixel densest** multi-order footprint pack of those leaves (`packLeavesPixelDense`): contact-first, void-fill, gravity **inside that L1 band only**.  
3. Stack L1 clusters by `groupSort` (`restackParentClusters`).  
4. Pixel L2 min-gap (axis-aware) + block gap; restack L1 again if needed.

**Forbidden packing mistakes:**

- Packing only L2 **inflated AABBs** that include empty corners as solid blockers (classic Genetics void).  
- Cross-L1 freefall densify.  
- Order-locking L2 insertion so Chemistry becomes a hollow frame.

---

## 7. Overlaps & containment

1. **No same-level paint overlap** among stroked panels (L1 peers; L2 siblings under the same L1).  
2. Cards remain **finite** and their centers stay **inside** their L1 chrome (± small pad slack).  
3. Cards in a leaf do not paint-overlap each other after block-gap separation.  
4. Nested L2 stays visually inside L1 after finalize/nest/clamp.

---

## 8. Multipage & print

- UI always requests **multi-page**.  
- Prefer more pages over crushing fonts/cards (area scale floors).  
- **Dissolve printable page areas** (sheet property): merge multipage frames into one **super-page** printable rectangle.
  - **Only outer margins** are non-printable (user margin settings on the exterior).
  - Inter-page stack gap and facing margins between tiles are **removed** (gap 0).
  - Layout-aware outer size:
    - vertical: 1 × N pages tall  
    - horizontal: N × 1 pages wide  
    - grid: cols × rows abutted (e.g. 6 pages → 3×2; printable = full outer − outer margins)  
    - free: pack as vertical dissolve (user positions kept for chrome only)
  - Example: Letter 816×1056, margins 48, 6-page grid 3×2 → outer 2448×2112, printable **2352×2016**.
  - Auto-layout packs into that full rectangle; canvas draws one dashed outer + one green content box.
- Fit-print: when single-page path is used, shrink into print box if needed.  
- Multipage seam helpers must not leave cards straddling gutters incorrectly.

---

## 9. Pipeline contract (`postPlace` / multi-level)

```
1. Densify card interiors per leaf
2. repackGroupsInParents:
     - tight leaf interiors
     - packLeavesPixelDense inside each L1
     - stack parents by groupSort
3. Axis-aware L2 min-gap (content clear H/V)
4. restackParentClusters (hard L1 order)
5. Block gap → re-clear L2
6. Final L1 restack + L2 clear
7. Clamp pack band → multipage seams
8. finalizeLayoutPanels → enforce stroke min-gap → nest/clamp chrome
```

**Priority if goals conflict:**

1. No same-level paint overlap  
2. L1 order matches Group sort  
3. Neighbor gap **floor** ≈ user L1/L2/block knobs  
4. Density / residual voids  

---

## 10. UI behavior (Apply button)

- Button disabled when no visible cards.  
- Show busy/status: yield frames so React paints “Packing…” before sync pack runs.  
- On success: status summarizes density, chrome, levels, gap knobs, panel shape.  
- On failure: show error string.  
- Does not hang; pack is sync but UI must remain responsive enough to show status.

---

## 11. In-panel auto-layout (related, not the sheet button)

Separate path (`relayoutPanelContents` / `denseRelayout`):

- Dense free-flow **inside** one panel (and nested L2 chrome when L1 selected).  
- Must not cascade-push unrelated sheet panels.  
- Rect vs n-gon: same card places; chrome differs.  
- Content sort A→Z by default on panel.  
- Repeated clicks must not shrink cards or drift right / overflow.  
- Parity intent: same leaf tetris quality as sheet n-gon/hard densify.

---

## 12. Verification commands

```bash
# Hard kitchen-sink (order, overlaps, gaps, density floors)
npx vitest run src/lib/autoOrganize/sheet.invariants.test.ts

# Smoke overlaps + broader suite
npx vitest run src/lib/autoOrganize/sheet.smoke.test.ts src/lib/autoOrganize.cheatsheet.test.ts

# In-panel gaps / parity
npx vitest run src/lib/autoOrganize/inpanel.gaps.test.ts src/lib/autoOrganize/inpanel.compare.test.ts
```

Default kitchen-sink options (match sidebar):

```
density: sm
groupChrome: panels
panelShape: rect
panelGroupLevels: [1, 2]   # tests use 1+2; UI default also includes 3
panelBorderLevels: [1, 2]
groupSort: name-asc
l1PanelGap / l2PanelGap / blockGap: 2
panelPadding: 4
multiPage: true
dissolvePrintArea: true
```

---

## 13. Regression gallery (must not return)

| Symptom | Root cause class |
|---------|------------------|
| Biology under Mathematics; #5 on top of page | Cross-L1 freefall densify |
| Chemistry huge empty green shell | Order-lock L2s or freefall sparse pack |
| V gap 2px, H gap ~18px | Title baked into isotropic L2 clear |
| Wishy-washy 2px next to 74px neighbors | Min-gap only; no within-L1 void-fill |
| Genetics empty purple corner blocks everyone | Leaf AABB includes empty corner as solid |
| Same-level L2 paint overlaps | Missing axis-aware clear / enforce |
| Gap sliders dead until 25px | ceil/min-1 cell free-flow |
| Cards on panel stroke | No pack-band chrome inset |

---

## 14. Safe change process

1. Add/adjust a **failing** assertion in `sheet.invariants.test.ts` that encodes the screenshot.  
2. One hypothesis, one change.  
3. Run invariant suite + cheatsheet suite.  
4. Update this file if product requirements change.  
5. Never land global freefall, isotropic title+gap, or density without coverage floors.

---

## 15. Key code map

| Concern | Location |
|---------|----------|
| UI Apply button | `src/components/properties/AutoLayoutPanel.tsx` |
| Store entry | `src/stores/canvasStore.ts` → `autoOrganize` |
| Main pack | `src/lib/autoOrganize/packCheatsheet.ts` |
| Post-place pipeline | `src/lib/autoOrganize/packCheatsheet/postPlace.ts` |
| Dense L2-in-L1 pack | `src/lib/autoOrganize/densify/repackParents.ts` + `packLeavesPixel.ts` |
| L1 restack order | `src/lib/autoOrganize/densify/restackParents.ts` |
| Axis-aware L2 clear | `src/lib/autoOrganize/densify/leafCollisions.ts` |
| Gap knobs resolve | `src/lib/autoOrganize/constants.ts` (`resolveLayoutGaps`, `gapPxToCells`) |
| Panel finalize / enforce | `packCheatsheet/finalizePanels.ts`, `densify/enforceInvariants.ts` |
| Hard tests | `src/lib/autoOrganize/sheet.invariants.test.ts` |
| Process freeze notes | `src/lib/autoOrganize/LAYOUT_INVARIANTS.md` |
