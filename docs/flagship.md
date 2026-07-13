# Flagship product path

**Agent builds a midterm sheet → Import JSON → Export PDF**

This is the canonical story of CheatSheet Studio: headless authoring + polished UI + print delivery.

## 1. Agent (terminal)

```bash
# Interactive: pick packs, formats, density; then “continue?” after each batch
npx playwright install chromium   # once (for PDF/PNG/JPG)
npm run agent:flagships

# Non-interactive — full pipeline (all packs + all formats + dense auto-layout)
npm run agent:flagships:all
# same as: npm run agent:flagships -- --yes

# Full run + Ollama layout refine (needs OLLAMA_API_KEY in .env)
npm run agent:flagships:ai

# JSON only (fast)
npm run agent:flagships:json

# Custom non-interactive
npm run agent:flagships -- --yes --packs finance-midterm,calc-final --formats json,png --density xs
npm run agent:flagships -- --yes --ai --density sm --columns 2
```

Pipeline per pack: **compose Studio blocks → dense auto-layout (app density presets) → optional Ollama refine → export**.

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
4. Optional **AI organize with Ollama** (Cloud or local)

#### Ollama Cloud (recommended — no CORS)

Chrome cannot call `localhost:11434` from the Vite app origin. We use a **same-origin
Vite proxy** (`/ollama-proxy`) that forwards to [Ollama Cloud](https://docs.ollama.com/cloud)
and injects your API key **server-side**.

1. Create a key: https://ollama.com/settings/keys  
2. Copy `.env.example` → `.env` and set:

```env
OLLAMA_API_KEY=your_ollama_api_key_here
OLLAMA_MODE=cloud
VITE_OLLAMA_MODEL=gemma4:31b
```

3. **Restart** `npm run dev` (proxy reads env at startup)  
4. Auto layout → **AI organize with Ollama**

| Variable | Where | Purpose |
|----------|--------|---------|
| `OLLAMA_API_KEY` | `.env` only (no `VITE_`) | Bearer token for https://ollama.com |
| `OLLAMA_MODE` | `.env` | `cloud` or `local` |
| `OLLAMA_HOST` | `.env` | Optional proxy target override |
| `VITE_OLLAMA_MODEL` | `.env` | Model id (Cloud: `gemma4:31b`) |

Do **not** put the key in `VITE_OLLAMA_API_KEY` — that would embed it in the client bundle.

## Publish SDK

```bash
npm run sdk:build
npm run sdk:pack
# after npm login:
cd packages/cheatsheet-sdk && npm publish --access public
```

See [packages/cheatsheet-sdk/PUBLISH.md](../packages/cheatsheet-sdk/PUBLISH.md).
