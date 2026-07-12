# CheatSheet Studio

<div align="center">

**Math · Science · Economics · Finance cheat-sheet builder**

License: [MIT](./LICENSE) · Status: **active development** (v0.1.0)

</div>

<br />

<div align="center">
  <img
    src="screenshots/workspace.png"
    alt="CheatSheet Studio workspace — canvas with equations, library panel, and properties"
    width="920"
  />
  <p><em>Workspace: freeform canvas, subject library, properties, and tools</em></p>
</div>

<br />

A Firebase-backed app for building multi-page, print-aware cheat sheets from
**vector equations** (KaTeX), tables, **SVG figures**, and **Mermaid process
charts** (flowchart + mind map). Drag items from a curated library onto a
freeform board, free-transform cards, import images (including seamless GIF
loops), author dark-themed diagrams, export print pages to PDF/PNG/JPEG,
organize layers in nested folders, and sync sheets per Google account.

> **Firebase is required for production use.** Auth, Firestore, Storage, and
> Hosting are part of the product. A built-in seed library loads offline;
> sign-in, cloud sheets, flowchart library, and durable image upload need a
> configured Firebase project. Local **Auth emulators** support automated E2E
> without a real Google login.

---

## Current status (July 2026)

| Area | Status |
|------|--------|
| Core workspace (canvas, library, properties) | **Stable / usable** |
| Free-transform cards (8 handles, keep aspect default ON) | **Implemented** |
| Vector equations / figures / process SVG | **Implemented** — [docs/vector-graphics.md](docs/vector-graphics.md) |
| Multi-page print frames (scroll limited when frame on) | **Implemented** |
| Canvas minimap + tool toggles | **Implemented** |
| Per-page / printable / whole-board grids | **Implemented** |
| PDF / PNG / JPEG export (print pages, WYSIWYG capture) | **Implemented** |
| Library cards + catalog list (multi-sort) | **Implemented** |
| Nested outliner folders + multi-select | **Implemented** |
| Local image persistence (IndexedDB) + Storage promote | **Implemented** |
| GIF ping-pong bake at import | **Implemented** |
| Undo / redo (document history) | **Implemented** |
| Process charts (flowchart + mind map interactive editor, cloud library) | **Implemented** |
| My Sheets preview + card detail | **Implemented** |
| Color pickers (defaults + recent) | **Implemented** |
| Collapsible left / right / bottom chrome | **Implemented** |
| Unit + component tests (Vitest) | **Vitest** |
| E2E smoke + Auth-emulator workspace E2E | **Playwright** |
| Firebase Hosting deploy path | **Supported** (`dist/`) |

**Dev vs Hosting:** `npm run dev` → [http://localhost:5173](http://localhost:5173)
serves **live source**. `firebase serve` → [http://localhost:5000](http://localhost:5000)
serves **last `npm run build`** only. Rebuild before testing Hosting-style ports.

**Docs:** [docs/README.md](./docs/README.md) ·
Process: [docs/process-charts.md](./docs/process-charts.md) ·
Vector: [docs/vector-graphics.md](./docs/vector-graphics.md)

---

## Features (current functionality)

### Canvas & tools
- Freeform board with **select (V)** and **pan (H)** tools  
- Drag from library, marquee multi-select, multi-move / multi-resize  
- **Free-transform** on selected cards: 8 handles (corners + edges); **Keep aspect ratio** default ON (Properties)  
- Zoom (in/out/reset), **fit print layout**, **fit content**, focus selection  
- **Minimap** (bottom-right overview; map icon toggles; drag to pan)  
- Grid on/off, snap-to-grid, tunable spacing (left **Grid settings**)  
- **Grid covers:** Full page · Printable area (margins) · Whole board  
- Soft opacity scale: slider **0–100% → CSS α 0–0.3**  
- Auto-organize packs cards into the printable content box  
- When **print frame is on**, board scroll size is limited to the print layout (+ pad); freeform size returns when the frame is off  

### Multi-page print frames
- Presets: Letter, Legal, Tabloid, A3/A4/A5 + orientation  
- **1–20 page frames** with vertical / horizontal / grid / **drag-and-place** layouts  
- Margin presets; fit-to-viewport uses the **full multi-page bounds**  
- Page labels and free-layout drag handles  

### Export (print pages)
- Top bar **Export** opens a fixed-size dialog (portaled so it is not clipped by the top bar)  
- **Scrollable preview** of selected print frames (light paper theme)  
- **Formats:** PDF (multi-page), PNG, JPEG (one file per page when multi-page)  
- **Pages:** multi-select which frames to include  
- **Color modes:** Color · Greyscale · Black & white (threshold)  
- Capture uses **html2canvas-pro** (Tailwind v4 `oklch` safe) via shared `CanvasCardBody` (matches viewport)  
- Only cards that intersect the dashed print frames are included  

### Library & content
- Subjects: Mathematics, Physics, Chemistry, Biology, Economics, Finance  
- Built-in **seed catalog** (deduped IDs) + optional Firestore seed  
- Bottom library: **Cards** or **List** (catalog-style split: list + resizable preview)  
- Catalog filters: search, subject, topic, type; **Clear** filters  
- **Multi-column sort** (list / Insert from catalog): click headers to stack sorts (asc → desc → clear); **Clear sort / Clear all**  
- Search ranking: title prefixes first; short queries ignore raw LaTeX  
- Library card previews **zoom-to-fill** the thumbnail  
- Custom equations (KaTeX), markdown tables, figure / image cards  
- **Vector graphics:** equations use KaTeX with **font-size fit** (+ board paintZoom); catalog figures use **inline SVG**; process charts use Mermaid SVG fill — see [docs/vector-graphics.md](docs/vector-graphics.md)  
- **New equations / figures** are authored as LaTeX or SVG (not raster diagrams)  
- Create Equation panel — **Insert from catalog** (equations only)  
- Import Image panel (preview, local persist, Storage upload when signed in; **SVG preferred for diagrams**)  
- GIF seamless loop via bake-at-import  

### Process charts (Mermaid)
- Right sidebar **Process** tool: **dark** interactive canvas (vendored [saketkattu/mermaid-visual-editor](https://github.com/saketkattu/mermaid-visual-editor), MIT)  
- **Diagram types:** **Flowchart** and **Mind map** only — both use the interactive React Flow editor (no static Mermaid preview pane)  
- Flowchart: 14 shapes (icon-only), inspector fill / border / text palette  
- Mind map: radial layout, promote/demote, bang/cloud shapes  
- **Cloud library** (signed in): save / load / delete named diagrams in Firestore (`flowcharts`)  
- Canvas cards: zinc studio dark + SVG **fillContainer** (vector at card size)  
- See [docs/process-charts.md](./docs/process-charts.md)  

### Layers & organization
- Outliner with **nested folders**, reparent, hide/lock per item or folder  
- Multi-select style/property edits  
- Color pickers: **default** swatch + **palette** + **recent** colors (localStorage)  
- Undo / redo with history batches for continuous drag  

### Account & sheets
- Google sign-in (popup + redirect)  
- Per-user cloud sheets (create, rename, switch, save, delete)  
- **My Sheets** tab: list + detail — print-area zoom-fit preview, multi-unit sizes, sortable/filterable cards table, content-chip highlights, keyboard ↑↓, delete confirm  
- Offline fallback: `local_*` sheets when Firestore is unavailable  
- Emulator mode: **Emulator sign-in** (email/password) for local E2E  

### App chrome
| Region | Role |
|--------|------|
| Top bar | Workspace / Library / Sheets, sheet switcher, print menu, **Export**, undo/redo, save, panel toggles, account |
| Left | Properties — collapsible **Sheet properties** + **Grid settings**, or selected card(s) (keep aspect, fill, style) |
| Center | Freeform canvas + print frames + minimap / tool strip |
| Right | Layers · Equation · **Process** · Image |
| Bottom | Collapsible library (cards/list, filters, multi-sort catalog) |

**Minimize panels:** left / right show a thin strip when collapsed (like the bottom library); hover resize handles for chevrons, or use top-bar panel icons.

---

## Stack

| Layer | Tech |
|-------|------|
| UI | React 19, Vite 8, TypeScript, Tailwind CSS v4 |
| State | Zustand (+ persist for UI prefs) |
| Math | KaTeX (font-size fit on canvas) |
| Diagrams | Mermaid 11 + vendored mermaid-visual-editor (Process tool) |
| DnD / layout | @dnd-kit, react-resizable-panels, @xyflow/react |
| Export | jspdf, html2canvas-pro |
| Backend | Firebase Auth, Firestore, Storage, Hosting |
| Tests | Vitest, Testing Library, Playwright |
| Local backend | Firebase Emulators (Auth; optional Firestore/Storage) |

---

## Prerequisites

1. **Node.js** 20+ and npm  
2. A **Firebase project** (production) with:
   - **Authentication** → Google enabled  
   - **Firestore** database  
   - **Storage**  
   - **Web app** config for `.env`  
3. **Firebase CLI** for emulators / deploy: `npm i -g firebase-tools`  
4. (Optional) **Java** only if you run **full** Firestore/Storage emulators  

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/kevinkicho/cheatsheet_studio.git
cd cheatsheet_studio
npm install
```

### 2. Firebase client config

```bash
cp .env.example .env
```

Fill from **Firebase Console → Project settings → Your apps → Web app**:

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |

**Do not commit `.env` or Admin SDK JSON.**

### 3. Console checklist & rules

1. Auth → Google on; authorized domains include `localhost` and Hosting domain  
2. Deploy rules (includes private `sheets` and `flowcharts`):

```bash
firebase login
firebase use mathstudy071026   # or your project
firebase deploy --only firestore:rules,storage
```

### 4. Run (production Firebase)

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### 5. Run with emulators (local Auth E2E / offline UI)

```bash
# Terminal A — Auth emulator (no Java)
npm run emulators:auth

# Terminal B — app pointed at emulators
npm run dev:emulators
```

Landing shows **Emulator sign-in** (test user is created on first use).  
Full Auth+Firestore+Storage (requires Java):

```bash
npm run emulators
# and set VITE_FIREBASE_EMULATORS_ALL=true when starting the app
```

Optional cloud library seed (Admin SDK JSON in project root — never commit):

```bash
npm run seed
```

---

## Deploy to Firebase Hosting

Hosting serves **`dist/`** only.

```bash
npm run build
firebase deploy --only hosting,firestore:rules
```

Or preview Hosting locally after a build:

```bash
npm run build
firebase serve    # http://localhost:5000 — must rebuild to see latest code
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (live source) |
| `npm run build` | `tsc -b` + Vite production build → `dist/` |
| `npm run preview` | Preview production build |
| `npm test` | Vitest unit + component tests |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright smoke only (`e2e/landing`, `e2e/workspace-grid`; **ignores** `e2e/emulator/`) |
| `npm run test:e2e:emulators` | Auth emulator + signed-in workspace E2E (`playwright.emulator.config.ts`) |
| `npm run test:e2e:emulators:full` | Auth+Firestore+Storage emulators (needs Java) |
| `npm run test:ci` | `vitest` + `build` |
| `npm run test:all` | Unit + smoke E2E + emulator E2E |
| `npm run emulators` / `emulators:auth` | Start Firebase emulators |
| `npm run dev:emulators` | Vite with emulator env flags |
| `npm run seed` | Seed `libraryItems` via Admin SDK |

---

## Testing

### Unit & component (Vitest + Testing Library)

Covers grid opacity mapping, page layouts, grid coverage, print helpers, export
helpers, canvas store, card defaults / free-transform aspect, sheets/auth
(mocked Firebase), keyboard shortcuts, Properties / Print menu / sidebars,
mermaid theme & templates, flowchart shapes / mindmap, and more.

App TypeScript build (`tsc -b`) **excludes** `*.test.*` and `src/test/**`; Vitest
uses a separate `vitest.config.ts`.

```bash
npm test
```

### E2E (Playwright)

```bash
# Smoke only — landing + auth gate (no Firebase login)
npm run test:e2e

# Signed-in workspace (Auth emulator + VITE_USE_FIREBASE_EMULATORS)
npm run test:e2e:emulators
```

CI (`.github/workflows/ci.yml`) runs, in order:

1. Unit tests (`npm test`)  
2. Smoke E2E (`npm run test:e2e`) — **does not** include `e2e/emulator/`  
3. Auth-emulator workspace E2E (`npm run test:e2e:emulators`)  
4. Production build (`npm run build`) + `dist/` checks  

---

## Architecture notes

- **State:** Zustand stores (`canvasStore`, `sheetsStore`, `authStore`, `libraryStore`, `uiStore`, `flowchartLibraryStore`)  
- **Shared card body:** `CanvasCardBody` — equations (KaTeX + FitContent fontSize), figures (FigureView SVG), process (MermaidView fillContainer); used by canvas + export  
- **Free-transform:** `src/lib/resizeHandles.ts`, `CanvasItemView`, `MultiSelectFrame`  
- **Vector policy:** [docs/vector-graphics.md](./docs/vector-graphics.md)  
- **Print / grid pure logic:** `src/lib/printSizes.ts`, `src/lib/gridCoverage.ts`  
- **Export:** `src/lib/exportPdf.ts`, `exportCapture.ts`, `runSheetExport.ts`, `components/export/`  
- **Library search / multi-sort:** `src/lib/libraryFilter.ts`, `src/lib/multiSort.ts`  
- **Process charts:** [docs/process-charts.md](./docs/process-charts.md)  
- **Colors:** `src/components/ui/ColorPicker.tsx`, `src/lib/recentColors.ts`  
- **Minimap:** `src/components/canvas/CanvasMinimap.tsx`  
- **Images:** `local-asset:` refs in IndexedDB; promote to Storage on cloud save  
- **Rules:** Sheets + flowcharts private to `ownerId == auth.uid`; system library read-only from client  

---

## Screenshots

<div align="center">
  <table>
    <tr>
      <td align="center" valign="middle">
        <img
          src="screenshots/workspace.png"
          alt="CheatSheet Studio main workspace"
          width="880"
        />
        <br />
        <sub>Main workspace with equation cards and library</sub>
      </td>
    </tr>
  </table>
</div>

---

## Security notes

- Never import Admin credentials into `src/`.  
- Web API keys are public in the browser; **Firestore / Storage rules** protect data.  
- Sheets and flowchart library entries are private to `ownerId == auth.uid`.  
- Emulator email sign-in is disabled unless `VITE_USE_FIREBASE_EMULATORS` is set.  

---

## License

Released under the [MIT License](./LICENSE).

**Attribution (courtesy):** Product direction and requirements by the project owner; implementation and iteration by **Grok / xAI**.
