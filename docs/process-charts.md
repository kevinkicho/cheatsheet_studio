# Process charts

CheatSheet Studio process charts are **Mermaid diagrams** authored in the right
sidebar **Process** tool and placed as canvas cards.

**Mermaid version:** 11.x (`package.json`)  
**Authoring:** interactive visual editor (vendored
[saketkattu/mermaid-visual-editor](https://github.com/saketkattu/mermaid-visual-editor), MIT)

---

## User flow

1. Open **Process** in the right tools rail.
2. Choose a **diagram type** chip:
   - **Flowchart** — nodes, edges, 14 shapes, inspector (fill / border / text)
   - **Mind map** — radial hierarchy, promote/demote, bang/cloud shapes
3. Edit on the **dark** React Flow canvas (never a static Mermaid preview pane —
   the editor *is* the preview). Toolbar: **Inspector**, **Select (V)**,
   **Pan (H)**, shapes, **zoom fit** (min zoom ~5%), diagram **Reset**.
4. **Cloud library** (signed in): **Save new** / **Update saved** / **Load…**
   stores named Mermaid sources under the user’s `flowcharts` collection in
   Firestore. Load replaces the editor (with a replace warning when dirty).
5. Set a **title**, then **Add to canvas** (or **Update card** when a process
   card is selected).
6. On the board, process cards use the same solid panel chrome as equations.
   Diagrams paint as **SVG `fillContainer`** (vector at card size — see
   [vector-graphics.md](./vector-graphics.md)).

For both kinds, Mermaid source is **derived from the visual canvas** at
insert/update time (`getVisualEditorMermaidSource()`), so Add never depends on
stale empty React state.

---

## Diagram types

| Kind | Interactive editor | Notes |
|------|--------------------|--------|
| **Flowchart** | Yes | 14 official shapes (icon-only picker); inspector colors + hierarchy N/A |
| **Mind map** | Yes | Radial equal-slice layout; promote/demote via edge order; bang / cloud shapes |

Older sequence / state / class / ER / pie templates are **not** offered in the
Process panel chips. Existing cards of other kinds remain on the board if present.

---

## Architecture

| Piece | Role |
|-------|------|
| `CreateProcessChartPanel` | Sidebar: title, flowchart/mindmap chips, cloud library, visual editor, Add / Update |
| `MermaidVisualEditor` | Dark React Flow host; preferredKind-authoritative import; serialize to Mermaid |
| `layoutFromMermaid.ts` | Renders studio Mermaid SVG → measures `g.node` boxes + edge `d` paths → RF nodes/edges |
| `portLayout.ts` | Perimeter / radial connection ports; edge handle reconciliation |
| `mermaidTemplates.ts` | Starters for flowchart + official mindmap example |
| `flowchartLibrary.ts` + `flowchartLibraryStore` | Firestore CRUD for named flowcharts |
| `firestore.rules` → `flowcharts/{id}` | Owner-only read/write |
| `src/vendor/mermaid-visual-editor/*` | Vendored editor + mindmap layout / nodes / edges |
| Popovers / Import modal | Portaled to `document.body` |
| `canvasStore.addProcessChart` | Inserts a `process-chart` card (`contentFill: true`, `autoFit: false`) |
| `MermaidView` | Card / export SVG (`fillContainer` = vector at card size) |
| `mermaidTheme.ts` | Studio dark init, source prep, layout-safe paint |
| `CanvasCardBody` | Process → `MermaidView` fillContainer |

### Flowchart layout = Mermaid engine

On flowchart **import**, **Auto Layout**, and **direction** change:

1. Serialize the canvas (or starter) to Mermaid text.
2. `renderMermaidSvg({ theme: 'dark', studioDark: true })` — same pipeline as sheet cards.
3. Mount the SVG offscreen; for each `g.node`, read **center** from
   `transform="translate(cx,cy)"` and size from local `getBBox()` (not screen CTM).
4. Map boxes onto RF `position` / `width` / `height` (normalized with pad).
5. Copy `path.flowchart-link` geometry onto edges as `data.mermaidPath` (offset into
   RF space) and place edge labels from Mermaid `g.edgeLabel` translates.
6. User drag clears Mermaid paths so free-form routing falls back to smooth-step.

Goal: **editor appearance matches Add to canvas** without a separate preview pane.

```
Process panel
  └─ MermaidVisualEditor  →  mermaidSource string
         │
         ▼
  addProcessChart / updateItem  (type: process-chart)
         │
         ▼
  CanvasCardBody
    └─ MermaidView fillContainer
         └─ renderMermaidSvg → paintStudioSvg → SVG (viewBox, 100% × 100%)
```

---

## Studio dark theme

Default process cards use **studio dark** so diagrams match zinc UI chrome.

| Token | Value | Use |
|-------|--------|-----|
| Node fill | `#27272a` | Node bodies |
| Node stroke | `#71717a` | Borders |
| Node / label text | `#f4f4f5` | Light type on dark nodes |
| Edge | `#a1a1aa` | Connectors |
| Edge label bg | `#3f3f46` | Yes/No chips, etc. |
| Preview / panel bg family | `#12141a` / solid panel | Host chrome + visual editor canvas |

### Render stack (`mermaidTheme.ts` + host CSS)

1. **`mermaid.initialize`** — `theme: 'base'` + `themeVariables` (`MERMAID_DARK_THEME_VARIABLES`), `htmlLabels: true`.
2. **`prepareStudioDarkSource`** — YAML frontmatter with the same palette; for
   **flowchart/graph only**, append `classDef default …` (never for mindmap —
   mindmap rejects `classDef`).
3. **`mermaid.render`** — serialized queue (one site config mutation at a time).
4. **`paintStudioSvg`** — rewrite pale fills inside Mermaid’s injected `<style>`,
   plus id-scoped color overrides. Keep Mermaid’s stylesheet (label metrics).
5. **Host CSS** — `color-scheme: dark` and `forced-color-adjust: none` on
   `html` / `.mermaid-host` / SVG so Chrome Auto Dark does not invert painted fills.
6. **`MermaidView`** — paint after render and again after React commit
   (`useLayoutEffect`).

Forest (and non-studio themes) skip the studio path when selected.

---

## Canvas card behavior

| Field | Default for new process cards |
|-------|-------------------------------|
| `type` | `process-chart` |
| `mermaidTheme` | `dark` |
| `contentFill` | `true` — diagram fills the card body |
| `autoFit` | `false` — card size is fixed at insert (default ~420×320); user resizes |
| Render path | `MermaidView` `fillContainer` — SVG with viewBox at card display size (vector) |
| `keepAspectRatio` | `true` by default — SVG `preserveAspectRatio` meet; stretch uses `none` |

PDF export uses the same `MermaidView` path on print pages
([vector-graphics.md](./vector-graphics.md)).

---

## Unit coverage

- `src/lib/mermaidTheme.test.ts` — init, prepare source, paint, classDef gating  
- `src/lib/mermaidTemplates.test.ts` / `mermaidTemplates.render.test.ts` — templates  
- `src/vendor/mermaid-visual-editor/lib/flowchartShapes.test.ts` — 14-shape contract  
- `src/vendor/mermaid-visual-editor/lib/mindmap.test.ts` — radial layout / serialize  

---

## Optional isolation page

`public/mermaid-test.html` is a static harness for Mermaid paint outside React.
Serve via production build (`npm run build` then `firebase serve` or any static
server on `dist/`). It is **not** required for normal product use.

---

## Key files

| Path | Notes |
|------|--------|
| `src/components/tools/CreateProcessChartPanel.tsx` | Process tool shell (flowchart + mindmap chips) |
| `src/components/tools/MermaidVisualEditor.tsx` | Visual editor host + serialize helpers |
| `src/vendor/mermaid-visual-editor/` | Vendored MIT editor + mindmap + shapes |
| `src/components/math/MermaidView.tsx` | SVG render + fillContainer vector paint |
| `src/lib/mermaidTheme.ts` | Theme, prepare, paint, `renderMermaidSvg` |
| `src/lib/mermaidTemplates.ts` | Template sources / helpers |
| `src/components/canvas/CanvasCardBody.tsx` | Process → MermaidView fillContainer |
| `src/components/canvas/CanvasItemView.tsx` | Card chrome + free-transform + CanvasCardBody |
| `src/stores/canvasStore.ts` | `addProcessChart` |
| `src/index.css` | `.mermaid-host`, forced-color-adjust |
| `index.html` | `color-scheme` meta |

---

## Official Mermaid references

- [Theme configuration](https://mermaid.js.org/config/theming.html)  
- [Flowchart syntax](https://mermaid.js.org/syntax/flowchart.html)  
- [Mindmap syntax](https://mermaid.js.org/syntax/mindmap.html)  

*Product behavior lives in this file, [vector-graphics.md](./vector-graphics.md),
and the root README. Temporary debug scripts stay under `scripts/` if needed.*
