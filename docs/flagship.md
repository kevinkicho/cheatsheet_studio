# Flagship product path

**Agent builds a midterm sheet → Import JSON → Export PDF**

This is the canonical story of CheatSheet Studio: headless authoring + polished UI + print delivery.

## 1. Agent (terminal)

```bash
# All flagships → JSON + HTML + PDF + PNG + JPG (needs Playwright Chromium once)
npx playwright install chromium   # once
npm run agent:flagships

# JSON only (fast, no Playwright)
npm run agent:flagships:json

# Single finance pack JSON
npm run agent:flagship
npm run agent:flagship:validate
```

Output under `examples/agent-out/` (gitignored):

| File | Purpose |
|------|---------|
| `*.sheet.json` | **Import** into Studio |
| `*.html` | Preview print layout |
| `*.pdf` / `*.png` / `*.jpg` | Shareable agent exports (not Studio WYSIWYG) |

Flagships are built from **Studio blocks**: seed equations/tables/figures + curated process flowcharts and mind maps.

## 2. Import (Studio)

Signed in:

| Action | Where |
|--------|--------|
| File picker | Top bar **Import JSON** or **My Sheets → Import JSON** |
| Drag-and-drop | Drop `.sheet.json` on Workspace / My Sheets |
| Modes | **new** sheet · **replace** open · **append** cards |
| After import | Toast + **fit print layout**; recent imports listed on My Sheets |

## 3. Export PDF

| Path | What you get |
|------|----------------|
| **Studio → Export → PDF** | WYSIWYG print-page capture (product quality) |
| **CLI `export-pdf`** | Clean agent HTML/PDF (automation; not pixel-identical) |

Process charts: agents supply `mermaidSource`. Workspace **Export JSON** preserves `mermaidSource` + `processFlow` for round-trip polish.

## Layout denser packs

```bash
npm run cheatsheet -- layout sheet.json --dense --mode sections
```

### In-app Auto layout (left sidebar)

With nothing selected on the canvas:

1. Open **Auto layout**
2. Pick **content size** (Extra small → Large), **gap**, **columns**
3. **Apply auto layout** — deterministic multi-column pack into print margins
4. Optional **AI organize with Ollama** — local `127.0.0.1:11434`, default model `gemma4:31b-cloud`

Ollama must be running (`ollama serve`). Optional env: `VITE_OLLAMA_MODEL`, `VITE_OLLAMA_BASE_URL`, `VITE_OLLAMA_USE_PROXY=true`.

## Publish SDK

```bash
npm run sdk:build
npm run sdk:pack
# after npm login:
cd packages/cheatsheet-sdk && npm publish --access public
```

See [packages/cheatsheet-sdk/PUBLISH.md](../packages/cheatsheet-sdk/PUBLISH.md).
