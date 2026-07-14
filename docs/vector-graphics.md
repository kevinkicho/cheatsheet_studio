# Vector graphics (equations & figures)

CheatSheet Studio is built for **crisp resize** on canvas, export, and print.  
**Equations and figures are authored as vector graphics** so cards stay sharp when you enlarge them.

## Policy for new content

**Always prefer vector.** Whenever you add block items (seed library, tools,
import helpers, or docs samples), author them so resize stays sharp:

| Kind | Author as | Why |
|------|-----------|-----|
| **Equation** | KaTeX-compatible **LaTeX** in the `latex` field | Scalable type (web fonts); canvas uses **font-size** fit |
| **Table** | Markdown **pipe table** (`tableMarkdown`) | HTML + **em** fonts; canvas uses **font-size** fit (not CSS-scale of a small bitmap) |
| **Figure / diagram** | **SVG** with a `viewBox` (`svgUrl(\`<svg…>\`)` or imported `.svg`) | Paths repaint at the card’s display size |
| **Process chart** | **Mermaid source** + **`processFlow` snapshot** | Flowchart + mind map paint editor geometry as SVG (Mermaid fallback if no snapshot) |
| **Photo** | PNG / JPEG / WebP / GIF via Import Image | Raster is appropriate for photographs only |

Euler’s identity is a pure LaTeX equation (`e^{i\pi} + 1 = 0`), not a bitmap.  
**Solubility Rules** and similar reference grids are markdown tables (vector type),
not screenshots of tables.

## Equations

Equations are stored and rendered as **LaTeX via KaTeX** (scalable type):

- Put math in the item’s `latex` field.
- Render with **KaTeX** (`LatexView` / `renderLatexToHtml`).
- On canvas, scale with **font-size fit** (`FitContent` `fitMethod="fontSize"`) when aspect ratio is locked, so KaTeX reflows as vector type when the card grows.
- Board zoom uses **paintZoom**: glyphs are laid out at screen resolution under CSS board zoom.

Library examples (including Euler’s identity) use pure LaTeX.  
Canvas cards use `CARD_DEFAULTS.equationFitMethod = 'fontSize'` for that path.  
When **Keep aspect ratio** is off, stretch mode uses transform scale so X and Y can change independently.

## Tables

Reference tables (e.g. solubility rules) are **markdown pipe tables**, not
raster images:

- Store in `tableMarkdown`; render with `MarkdownTable` using **em**-relative
  type and padding.
- Canvas `FitContent` uses **fontSize** fit (same path as equations) so enlarging
  the card grows real HTML text — not a scaled-up screenshot of a small table.
- During free-transform drag, transform fit may be used for speed; idle paint
  returns to fontSize for crisp type.

## Figures

Figures for diagrams use **SVG** with a proper `viewBox`:

- Catalog assets use `data:image/svg+xml,…` via `svgUrl()` in seed data
  (e.g. Production Possibility Frontier is pure SVG paths + text).
- Canvas cards paint SVG with **`fillContainer`** (100% × 100% + viewBox) so the
  browser **re-renders vectors at the card size**. They must **not** use
  FitContent CSS `transform` on a fixed 220×180 SVG (that looks soft/pixelated).
- `FigureView` **inlines** data-URL and local SVG markup.
- Seed tests assert every `type: 'figure'` entry is SVG.

Photographic images remain supported for real-world pictures; **diagrams and math illustrations use SVG**.

## Process charts

- **Flowcharts and mind maps** store a free-form **`processFlow` snapshot** from
  the interactive editor and paint it with `ProcessFlowView` (SVG viewBox,
  including pipe U-turns). Card geometry matches the Process tool — not a
  Mermaid re-layout.
- **Legacy cards** without a snapshot (older mind maps) still use
  **Mermaid → SVG** via `MermaidView` `fillContainer`.

See [process-charts.md](./process-charts.md).

## Catalog guarantee (seed + Firestore)

The offline catalog `SEED_LIBRARY` and the Admin seed (`npm run seed`) are
**vector-only**:

| Type | Count source | Vector form |
|------|----------------|-------------|
| equation | `eq(…)` | LaTeX string |
| table | `tbl(…)` | Markdown pipes |
| figure | `fig(…, svgUrl(…))` | SVG data URL + viewBox |

Automated checks:

- `src/data/seedLibrary.vector.test.ts` — fails CI if any seed item is raster
- `scripts/seed-library.ts` — refuses to write non-SVG figures / empty latex

After upgrading the catalog, re-run **`npm run seed`** so Firestore
`libraryItems` matches the vector seed (overwrites system docs by id).

## Adding new library content

1. **Equation** → `eq(…, latex, …)` with KaTeX-compatible LaTeX.  
2. **Table** → `tbl(…, markdown, …)` pipe table (not a PNG of a table).  
3. **Figure** → `fig(…, svgUrl(\`<svg xmlns="…" viewBox="0 0 W H">…</svg>\`), …)`.  
4. Author math diagrams as **SVG** (or equations as LaTeX) so enlarge stays sharp.  
5. For **photos** only, use the image import flow (raster).

## Implementation map

| Area | Vector path |
|------|-------------|
| Equations on canvas | `CanvasCardBody` → `LatexView` + `FitContent` `fontSize` + `paintZoom` |
| Tables on canvas | `MarkdownTable` (em type) + `FitContent` `fontSize` |
| Figures on canvas | `FigureView` inline SVG / full-box sizing |
| Process charts | `ProcessFlowView` (flowchart snapshot) or `MermaidView` fillContainer |
| Library seed | `src/data/seedLibrary.ts` LaTeX + `tbl` + `svgUrl` |
| Defaults | `src/lib/cardDefaults.ts` (`equationFitMethod: 'fontSize'`) |
| Import diagrams | Prefer **SVG** in Import Image panel |

## Empty space above/below equations (letterboxing)

When a card is **taller** than the equation’s aspect ratio and **Scale content
to fill card** is on, FitContent uses **uniform** scale (keep aspect). The
content fills the **width**, so empty bands appear above and below. The % badge
may show values like 300%+ (content enlarged to fill).

| Approach tried | Effect |
|----------------|--------|
| Always CSS-transform scale | Soft type; still letterboxes |
| fontSize fit for equations | Sharp type; still letterboxes if card aspect ≠ content |
| contentFill max scale | Fills box; intentional letterbox when aspect differs |
| **Fit** (autoFit snug) | Resizes **card chrome** to content → gutters collapse |
| Stretch (keep aspect off) | Fills height by distorting type — usually worse |

**Safe workflow:** select the card → Properties → **Fit** (now also turns off
fill-scale so the card snugs to the equation). Or turn off “Scale content to
fill card” and resize manually. Avoid changing FitContent’s core measure loop
casually — it is shared by equations, tables, figures, and library tiles.

## Export

On-canvas and print layout keep **vector sources** (KaTeX, SVG, processFlow /
Mermaid). Raster export (PDF/PNG/JPEG) captures that layout with html2canvas-pro
via the shared `CanvasCardBody` (same paint as the export preview).

### Studio SVG export

Studio **Export → SVG** is a browser path (`src/lib/exportSvg.ts` +
`runSheetExport`), not the CLI Playwright print path.

| Concern | Approach |
|---------|----------|
| **Layout** | Same export DOM as PDF preview (`PdfExportPages`) — WYSIWYG positions |
| **Equations / tables** | Stay in the `foreignObject` HTML tree as KaTeX / HTML (**natural size**, `contentFill: false`) so type stays sharp and is not letterboxed |
| **Process / mind maps** | Mermaid htmlLabels use nested `foreignObject`s that break nested SVG/`file://`. Export **flattens FO labels → SVG text**, then embeds a high-contrast **PNG** (or SVG data URL for pure process-flow snapshots) inside each card as `<img>` |
| **Contrast** | Capture palette forces readable node fills/strokes/text on dark cards |
| **Fonts** | Collected app CSS drops local `/node_modules/katex` `@font-face` (404 on `file://`); injects **KaTeX CDN** faces |
| **Page background** | Defaults to board dark `#0f1115` so dark cards are not on white paper |

**Why not pure nested Mermaid SVG?** Mermaid’s default `htmlLabels` embeds HTML
inside SVG. Nesting that inside our page-level `foreignObject` is fragile in
Chrome `file://` viewers. Rasterizing only the diagram hosts (after FO flatten)
is the reliable path.

**Quality tips:** run **Auto-layout** (or pack) before export so process cards
have enough size; open SVG in a browser with network for KaTeX CDN fonts once.

Implementation: `pageElementToSvgString`, `captureDiagramHostV2`,
`bakeDiagramSvgForCapture`, `normalizeItemForExport`.
