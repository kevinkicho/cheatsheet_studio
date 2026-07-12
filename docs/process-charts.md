# Process charts

CheatSheet Studio process charts are **Mermaid flowcharts** authored in the
right sidebar **Process** tool and placed as canvas cards.

**Mermaid version:** 11.x (`package.json`)  
**Authoring:** visual drag-and-drop editor (vendored [saketkattu/mermaid-visual-editor](https://github.com/saketkattu/mermaid-visual-editor), MIT)

---

## User flow

1. Open **Process** in the right tools rail.
2. Pick a **diagram type** template (flowchart, sequence, state, class, ER, pie,
   mindmap) and, for flowcharts, a **direction** (TD / LR / BT / RL).
   Choosing a type **replaces** the editor contents; if the viewport already has
   a diagram, the app asks for confirmation (unsaved editor work is discarded;
   canvas cards and the cloud library are not deleted).
3. **Flowchart:** edit on the dark visual canvas (nodes, edges, shapes).
   Toolbar: **Inspector**, **Select (V)**, **Pan (H)**, shapes, **zoom fit**.
   **Other kinds:** studio-dark Mermaid preview only; Add places the template.
4. **Cloud library** (signed in): **Save new** / **Update saved** / **Load…**
   stores named Mermaid sources under the user’s `flowcharts` collection in
   Firestore. Load replaces the editor (with the same replace warning when dirty).
5. Set a **title**, then **Add to canvas** (or **Update card** when a process
   card is selected).
6. On the board, cards use the same solid panel chrome as equations. With
   **Scale content to fill card** enabled (default), the diagram scales into the
   card body via `FitContent` (CSS transform).

For flowcharts, Mermaid source is **derived from the visual canvas** at
insert/update time (`getVisualEditorMermaidSource()`), so Add never depends on
a stale empty React state.

---

## Architecture

| Piece | Role |
|-------|------|
| `CreateProcessChartPanel` | Sidebar: title, kind/direction templates, cloud library, visual editor or preview, Add / Update |
| `MermaidVisualEditor` | Dark React Flow canvas; serializes to Mermaid flowchart source |
| `mermaidTemplates.ts` | Starter sources for each diagram kind + direction helpers |
| `flowchartLibrary.ts` + `flowchartLibraryStore` | Firestore CRUD for named flowcharts |
| `firestore.rules` → `flowcharts/{id}` | Owner-only read/write |
| `src/vendor/mermaid-visual-editor/*` | Vendored editor (relative imports for Vite) |
| Popovers / Import modal | Portaled to `document.body` (escape overflow / transform clipping) |
| `canvasStore.addProcessChart` | Inserts a `process-chart` card (`contentFill: true`, `autoFit: false`) |
| `MermaidView` | Renders card / export Mermaid SVG |
| `mermaidTheme.ts` | Studio dark init, source prep, layout-safe paint |
| `CanvasItemView` | Wraps `MermaidView` in `FitContent` (`fitMethod="transform"`) |
| `FitContent` | Fits async content into the card; remeasures when Mermaid finishes |
| Color pickers | Shared defaults + recent colors via `ColorPicker` / `recentColors` |

```
Process panel
  └─ MermaidVisualEditor  →  mermaidSource string
         │
         ▼
  addProcessChart / updateItem  (type: process-chart)
         │
         ▼
  CanvasItemView
    └─ FitContent (transform, contentFill)
         └─ MermaidView
              └─ renderMermaidSvg → paintStudioSvg → SVG in .mermaid-host
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
   **flowchart/graph only**, append `classDef default …` (never for sequence,
   state, class, ER, pie, mindmap — those reject `classDef`).
3. **`mermaid.render`** — serialized queue (one site config mutation at a time).
4. **`paintStudioSvg`** — rewrite pale fills (e.g. `#ECECFF`) **inside** Mermaid’s
   injected `<style>` (keep font metrics), plus id-scoped color overrides and
   presentation attributes. Do **not** delete Mermaid’s stylesheet wholesale
   (that causes label overflow).
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
| `contentFill` | `true` — scale diagram up/down to the card body |
| `autoFit` | `false` — card size is fixed at insert (default ~420×320); user resizes |
| Fit method | CSS `transform` (not font-size; SVG is not KaTeX) |

`FitContent` observes the card box **and** inner content, and remeasures when
Mermaid’s async SVG appears (`onRendered` + delayed passes). Toggle
**Scale content to fill card** in Properties to cap at shrink-only (`maxScale: 1`)
vs fill (`maxScale` up to 64).

PDF export uses the same `MermaidView` path on print pages.

---

## Templates & kinds

Process panel **Diagram type** buttons load `mermaidTemplate(kind, direction)`:

| Kind | Interactive editor | Canvas card |
|------|--------------------|-------------|
| Flowchart | Yes (React Flow) | Serialized flowchart |
| Sequence, state, class, ER, pie, mindmap | Preview only (`MermaidView`) | Template source as-is |

Direction controls apply only to flowcharts (rewrites header + reloads editor).

Unit coverage:

- `src/lib/mermaidTheme.test.ts` — init, prepare source, paint, classDef gating  
- `src/lib/mermaidTemplates.test.ts` / `mermaidTemplates.render.test.ts` — templates  

---

## Optional isolation page

`public/mermaid-test.html` is a static harness for Mermaid paint outside React.
Serve via production build (`npm run build` then `firebase serve` or any static
server on `dist/`). It is **not** required for normal product use.

---

## Key files

| Path | Notes |
|------|--------|
| `src/components/tools/CreateProcessChartPanel.tsx` | Process tool shell |
| `src/components/tools/MermaidVisualEditor.tsx` | Visual editor host + serialize helpers |
| `src/vendor/mermaid-visual-editor/` | Vendored MIT editor + `NOTICE.md` / `LICENSE` |
| `src/components/math/MermaidView.tsx` | SVG render + measure |
| `src/lib/mermaidTheme.ts` | Theme, prepare, paint, `renderMermaidSvg` |
| `src/lib/mermaidTemplates.ts` | Template sources / helpers |
| `src/components/math/FitContent.tsx` | Scale-to-card |
| `src/components/canvas/CanvasItemView.tsx` | Card body + FitContent wrap |
| `src/stores/canvasStore.ts` | `addProcessChart` |
| `src/index.css` | `.mermaid-host`, forced-color-adjust |
| `index.html` | `color-scheme` meta |

---

## Official Mermaid references

- [Theme configuration](https://mermaid.js.org/config/theming.html)  
- [Flowchart syntax](https://mermaid.js.org/syntax/flowchart.html)  

*Do not reintroduce long trial/proof markdown under `docs/`. Product behavior
belongs in this file and the README; temporary debug scripts live under
`scripts/` if needed.*
