# Vector graphics (equations & figures)

CheatSheet Studio is built for **crisp resize** on canvas, export, and print.  
**Equations and figures are authored as vector graphics** so cards stay sharp when you enlarge them.

## Policy for new content

Whenever you add **new equations or figures** (seed library, tools, or docs samples):

| Kind | Author as | Why |
|------|-----------|-----|
| **Equation** | KaTeX-compatible **LaTeX** in the `latex` field | Scalable type (web fonts); canvas uses font-size fit |
| **Figure / diagram** | **SVG** with a `viewBox` (`svgUrl(\`<svg…>\`)` or imported `.svg`) | Paths repaint at the card’s display size |
| **Process chart** | **Mermaid source** | Renders to SVG that fills the card |
| **Photo** | PNG / JPEG / WebP / GIF via Import Image | Raster is appropriate for photographs |

Euler’s identity is a pure LaTeX equation (`e^{i\pi} + 1 = 0`), not a bitmap.

## Equations

Equations are stored and rendered as **LaTeX via KaTeX** (scalable type):

- Put math in the item’s `latex` field.
- Render with **KaTeX** (`LatexView` / `renderLatexToHtml`).
- On canvas, scale with **font-size fit** (`FitContent` `fitMethod="fontSize"`) when aspect ratio is locked, so KaTeX reflows as vector type when the card grows.
- Board zoom uses **paintZoom**: glyphs are laid out at screen resolution under CSS board zoom.

Library examples (including Euler’s identity) use pure LaTeX.  
Canvas cards use `CARD_DEFAULTS.equationFitMethod = 'fontSize'` for that path.  
When **Keep aspect ratio** is off, stretch mode uses transform scale so X and Y can change independently.

## Figures

Figures for diagrams use **SVG** with a proper `viewBox`:

- Catalog assets use `data:image/svg+xml,…` via `svgUrl()` in seed data.
- `FigureView` **inlines SVG** (data URLs and local `.svg` imports) at 100% width/height so paint matches the card’s display size.
- Seed library figures live in `src/data/seedLibrary.ts` as SVG strings.

Photographic images remain supported for real-world pictures; **diagrams and math illustrations use SVG**.

## Process charts (Mermaid)

Process charts are **Mermaid source** rendered to **SVG** with `fillContainer`, so diagrams paint at the card size (vector) without CSS `scale()`.

## Adding new library content

1. **Equation** → `eq(…, latex, …)` with KaTeX-compatible LaTeX.  
2. **Figure** → `fig(…, svgUrl(\`<svg xmlns="…" viewBox="0 0 W H">…</svg>\`), …)`.  
3. Author math diagrams and schematic figures as **SVG** (or LaTeX) so enlarge stays sharp.  
4. For photos, use the image import flow; for diagrams, SVG keeps full clarity on resize.

## Implementation map

| Area | Vector path |
|------|-------------|
| Equations on canvas | `CanvasCardBody` → `LatexView` + `FitContent` `fontSize` + `paintZoom` |
| Figures on canvas | `FigureView` inline SVG / full-box sizing |
| Process charts | `MermaidView` `fillContainer` (SVG viewBox) |
| Library seed | `src/data/seedLibrary.ts` LaTeX + `svgUrl` |
| Defaults | `src/lib/cardDefaults.ts` (`equationFitMethod: 'fontSize'`) |
| Import diagrams | Prefer **SVG** in Import Image panel |

## Export

On-canvas and print layout keep **vector sources** (KaTeX, SVG, Mermaid). Export to PDF/PNG/JPEG samples that high-quality layout at capture time for the target file format.
