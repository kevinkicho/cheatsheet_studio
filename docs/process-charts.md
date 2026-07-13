# Process charts

CheatSheet Studio process charts are authored in the right sidebar **Process**
tool and placed as canvas cards.

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
   **Pan (H or Shift+drag)**, shapes, **zoom fit**, diagram **Reset**.
4. Drag **port → port** to connect. Lines use orthogonal **smooth-step “pipe”**
   curves. Drop a link on empty canvas → new rectangle + connection.
5. **Cloud library** (signed in): **Save new** / **Update saved** / **Load…**
   stores Mermaid source **and** flowchart `processFlow` snapshots under the
   user’s `flowcharts` collection. Load restores free-form layout when present.
6. Set a **title**, then **Add to canvas** (or **Update card** when a process
   card is selected).
7. On the board, process cards use solid panel chrome. **Flowcharts** paint the
   free-form **`processFlow` snapshot** (same geometry as the interactive
   editor). **Mind maps** still use Mermaid SVG. Both stay vector at card size —
   see [vector-graphics.md](./vector-graphics.md).

At insert/update:

| Payload | Source | Used for |
|---------|--------|----------|
| `mermaidSource` | `getVisualEditorMermaidSource()` | Re-open, library, mind-map cards |
| `processFlow` | `getVisualEditorProcessFlow()` | Flowchart card paint + print export |

Selecting a flowchart card loads its `processFlow` into the editor (live edits
push back while the card stays selected). **Delete** in the editor removes only
nodes/edges — not the canvas card.

---

## Diagram types

| Kind | Interactive editor | Card paint |
|------|--------------------|------------|
| **Flowchart** | Yes | `processFlow` snapshot → `ProcessFlowView` SVG |
| **Mind map** | Yes | Mermaid SVG via `MermaidView` |

Older sequence / state / class / ER / pie templates are **not** offered in the
Process panel chips. Existing cards of other kinds remain on the board if present.

---

## Architecture

| Piece | Role |
|-------|------|
| `CreateProcessChartPanel` | Sidebar: title, flowchart/mindmap chips, cloud library, visual editor, Add / Update |
| `MermaidVisualEditor` | Dark React Flow host; prefer `processFlow` on load; serialize Mermaid + snapshot helpers |
| `processFlowSnapshot.ts` | Capture / restore / SVG paint for free-form flowcharts |
| `ProcessFlowView` | Card body SVG from snapshot (viewBox includes edge U-turns) |
| `edgePath.ts` | Shared pipe router (smooth-step); port-locked plugs; reverse multi “No” U-turn |
| `portLayout.ts` | Perimeter ports (stadium mid-sides); handle normalize / reconcile |
| `layout.ts` → `cleanFlowchartLayout` | Dagre stack after Mermaid size measure; face-port handles for auto edges |
| `layoutFromMermaid.ts` | Optional Mermaid SVG measure for import sizes |
| `flowchartLibrary.ts` + store | Firestore CRUD; persists `mermaidSource` + `processFlow` |
| `src/vendor/mermaid-visual-editor/*` | Vendored editor + mindmap layout / nodes / edges |
| `canvasStore.addProcessChart` | Inserts `process-chart` with `processFlow` when captured |
| `keyboardShortcuts` | Delete in process editor does **not** remove canvas cards |

### Flowchart: editor is source of truth

```
Process panel (React Flow editor)
  │  nodes, edges, ports, pipe paths
  ├─ getVisualEditorMermaidSource()  → mermaidSource (text)
  └─ getVisualEditorProcessFlow()    → processFlow snapshot
         │
         ▼
  addProcessChart / updateItem  (type: process-chart)
         │
         ▼
  CanvasCardBody / export
    └─ ProcessFlowView (flowchart with processFlow)
    └─ MermaidView (mind map, or flowchart fallback without snapshot)
```

1. **Import / template** — Mermaid text → optional size measure →
   `cleanFlowchartLayout` (dagre ranks + face ports). Edges paint as smooth-step
   pipes (not Mermaid free paths).
2. **User plugs** — `manualConnect` + `sourceHandle` / `targetHandle` pin
   endpoints. Routing stays locked when other edges are added.
3. **Reverse multi-edge (e.g. No)** — same-side U-turn with clearance so pipes
   do not cut through node bodies.
4. **Add to canvas** — clones snapshot; card SVG uses **baked paths** and a
   viewBox expanded for U-turn bounds so geometry matches the editor.

### Interaction notes

| Action | Behavior |
|--------|----------|
| Port → port connect | Curved pipe; `manualConnect: true` |
| Drop link on empty | New rectangle + edge |
| Shift + left-drag | Temporary pan (selection key null so Shift is free) |
| Delete / Backspace | RF nodes/edges only while editor has focus or selection |
| Auto-connect toggle | Re-layout rewire only; imports still show edges when off |

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

Mind maps and Mermaid-only cards still use `mermaidTheme.ts` (`theme: base` +
studio variables + `paintStudioSvg`). Flowchart cards with `processFlow` paint
the same palette in `processFlowToSvg`.

---

## Canvas card behavior

| Field | Default for new process cards |
|-------|-------------------------------|
| `type` | `process-chart` |
| `mermaidTheme` | `dark` |
| `mermaidSource` | Serialized Mermaid text |
| `processFlow` | Snapshot when flowchart capture succeeds |
| `contentFill` | `true` — diagram fills the card body |
| `autoFit` | `false` — card size fixed at insert (~420×320); user resizes |
| Render path | Flowchart + `processFlow` → `ProcessFlowView`; else `MermaidView` fillContainer |
| `keepAspectRatio` | `true` by default — SVG meet; stretch uses `none` |

PDF export uses the same paint path on print pages
([vector-graphics.md](./vector-graphics.md)).

---

## Unit coverage

- `src/lib/processFlowSnapshot.test.ts` — capture, SVG, RF round-trip, multi No path  
- `src/vendor/mermaid-visual-editor/lib/edgePath.test.ts` — pipe routes, locked plugs, reverse multi  
- `src/vendor/mermaid-visual-editor/lib/portLayout.test.ts` — ports, stadium mid-sides, reconcile  
- `src/lib/keyboardShortcuts.test.ts` — Delete does not steal process-editor focus  
- `src/lib/mermaidTheme.test.ts` / `mermaidTemplates.test.ts` — Mermaid theme + templates  
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
| `src/components/tools/MermaidVisualEditor.tsx` | Visual editor host + serialize / snapshot helpers |
| `src/lib/processFlowSnapshot.ts` | Capture, restore, card SVG |
| `src/components/math/ProcessFlowView.tsx` | Snapshot → SVG on canvas cards |
| `src/vendor/mermaid-visual-editor/lib/edgePath.ts` | Shared smooth-step pipe router |
| `src/vendor/mermaid-visual-editor/lib/portLayout.ts` | Connection ports |
| `src/vendor/mermaid-visual-editor/lib/layout.ts` | Dagre clean stack layout |
| `src/vendor/mermaid-visual-editor/` | Vendored MIT editor + mindmap + shapes |
| `src/components/math/MermaidView.tsx` | Mermaid SVG (mind maps / fallback) |
| `src/lib/mermaidTheme.ts` | Theme, prepare, paint, `renderMermaidSvg` |
| `src/components/canvas/CanvasCardBody.tsx` | Process → ProcessFlowView or MermaidView |
| `src/stores/canvasStore.ts` | `addProcessChart` |
| `src/lib/keyboardShortcuts.ts` | Canvas vs process-editor Delete isolation |

---

## Official Mermaid references

- [Theme configuration](https://mermaid.js.org/config/theming.html)  
- [Flowchart syntax](https://mermaid.js.org/syntax/flowchart.html)  
- [Mindmap syntax](https://mermaid.js.org/syntax/mindmap.html)  

*Product behavior lives in this file, [vector-graphics.md](./vector-graphics.md),
and the root README.*
