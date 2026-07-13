# Agent SDK & CLI

CheatSheet Studio can be driven **headlessly** by agents and scripts without opening the React UI.

## Isolation (no UI regression)

| Layer | Path | Touches browser app? |
|-------|------|----------------------|
| Web app | `src/**`, Vite | Unchanged |
| SDK + CLI | `packages/cheatsheet-sdk/**` | **No** — Node-only |
| Docs | `docs/agent-sdk.md` | No |

The package **does not** import React, Zustand stores, or Vite. Installing or running the CLI cannot change canvas behavior, styles, or Firebase client config.

## Document model

Agents produce a `SheetDocument`:

```json
{
  "v": 1,
  "title": "Agent demo",
  "canvas": { "...": "same shape as app SheetCanvas" },
  "items": [ { "type": "equation", "latex": "...", "x": 48, "y": 48, "...": "..." } ],
  "folders": []
}
```

This matches what Firestore stores under `sheets/{id}` (`ownerId`, `title`, `canvas`, `items`, `folders`, timestamps). The Studio already knows how to render those fields.

## Workflows

### Flagship path (agent → Import → Export PDF)

One story that exercises the full product:

```bash
# 1. Agent builds a midterm finance sheet (topic pack)
npm run agent:flagship
# → examples/agent-out/finance-midterm.sheet.json

# Optional: agent-side print PDF (Playwright; not Studio WYSIWYG)
npm run agent:flagship:pdf
```

Then in the Studio (signed in):

1. **My Sheets → Import JSON** (or drag the `.sheet.json` onto the window)  
2. Workspace opens with TVM / NPV / CAPM / WACC cards  
3. Polish layout if needed → top bar **Export → PDF** (print-page capture)

Toast feedback confirms success; invalid JSON shows a friendly error (not a silent fail).

```bash
npm run agent:flagship:validate   # pack + validate + summarize
```

### Local file + Import JSON (recommended)

1. Agent writes `*.sheet.json` (or an outline + `compose`)  
2. Human: **My Sheets → Import JSON** (or **drop** the file onto Workspace / My Sheets)  
3. Workspace opens; sheet is created under the signed-in user (or local fallback)  
4. Human polishes layout / process charts in the UI · **Export PDF** from the top bar  

This path never requires a service account in the browser.

### Outline compose (agents)

```bash
npm run cheatsheet -- compose examples/outline.demo.json -o out/sheet.json
```

Outline shape:

```json
{
  "title": "My topic",
  "blocks": [
    { "type": "heading", "title": "Section" },
    { "type": "equation", "title": "…", "latex": "…" },
    { "type": "table", "markdown": "| a | b |\n|---|---|" },
    { "type": "process", "mermaid": "flowchart TD\n A-->B", "kind": "flowchart" }
  ]
}
```

### Cloud push / pull (Admin)

**Never commit service account JSON.** Use env vars (also for MCP):

```bash
export CHEATSHEET_SA_PATH=./path-to-sa.json   # or GOOGLE_APPLICATION_CREDENTIALS
export CHEATSHEET_UID=your_firebase_uid
# optional: CHEATSHEET_PROJECT_ID, CHEATSHEET_SHEET_ID

npm run cheatsheet -- push out/sheet.json
npm run cheatsheet -- pull --sheet-id ID -o out/pulled.json
# flags still work: --uid --sa --sheet-id --project
```

MCP tools `cheatsheet_push` / `cheatsheet_pull` read the same env.

> Prefer Admin only in trusted environments. Do not embed service accounts in client apps or agent prompts.

## Print export (HTML / PDF)

```bash
npm run cheatsheet -- pack calc-derivatives -o out/calc.sheet.json
npm run cheatsheet -- export-html out/calc.sheet.json -o out/calc.html
# PDF needs Chromium once:
npx playwright install chromium
npm run cheatsheet -- export-pdf out/calc.sheet.json -o out/calc.pdf
# optional: --keep-html --light
```

HTML always works. PDF uses Playwright (already used for app E2E in this monorepo).  
Not a pixel clone of the Studio canvas — a clean print layout for sharing.

## Publishing the SDK (npm)

Package: `@cheatsheet-studio/sdk` under `packages/cheatsheet-sdk/`.

```bash
# From monorepo root — see packages/cheatsheet-sdk/PUBLISH.md
npm run sdk:build
npm run sdk:pack
cd packages/cheatsheet-sdk && npm publish --access public
```

The React app does **not** depend on the published package; monorepo continues to use `tsx` sources.

## Seed catalog (agents)

```bash
npm run cheatsheet -- catalog-search --query quadratic --limit 5
npm run cheatsheet -- add-catalog out/sheet.json --id math-quad
```

Outline blocks can use `{ "type": "catalog", "id": "math-quad" }` (id or title).

## MCP server (coding agents)

Minimal stdio JSON-RPC tools (no extra MCP npm dependency):

```bash
npm run cheatsheet:mcp
```

**Cursor / Claude Desktop example** — copy [`.mcp.json.example`](../.mcp.json.example)
to your client config (or merge `mcpServers`):

```json
{
  "mcpServers": {
    "cheatsheet-studio": {
      "command": "npx",
      "args": ["tsx", "packages/cheatsheet-sdk/src/cli.ts", "mcp"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

Also: `packages/cheatsheet-sdk/mcp.example.json`.

Tools: `cheatsheet_compose`, `cheatsheet_compose_pack`, `cheatsheet_list_packs`,
`cheatsheet_validate`, `cheatsheet_catalog_search`, `cheatsheet_add_catalog`,
`cheatsheet_init`, `cheatsheet_summarize`.

## Topic packs

Premade outlines under `packages/cheatsheet-sdk/topic-packs/`:

| Pack id | Theme |
|---------|--------|
| **`finance-midterm`** | **Flagship** — TVM, NPV/IRR, CAPM, WACC midterm sheet |
| `calc-derivatives` | Calculus derivatives |
| `calc-integrals` | FTC, substitution, parts |
| `lin-algebra` | Linear algebra essentials |
| `stats-bayes` | Bayes theorem |
| `finance-capm` | CAPM |
| `finance-npv` | NPV & IRR |
| `econ-elasticity` | Price elasticity of demand |
| `physics-kinematics` | 1D kinematics |
| `physics-energy` | Work & energy |
| `chem-stoichiometry` | Stoichiometry / limiting reagent |
| `bio-genetics` | Hardy–Weinberg / monohybrid |
| `complex-numbers` | Complex / polar form |
| `org-chem-basics` | Organic functional groups |
| `micro-supply-demand` | Supply & demand shocks |

```bash
npm run cheatsheet -- doctor
npm run cheatsheet -- packs --subject mathematics
npm run agent:flagship
npm run cheatsheet -- pack finance-midterm -o out/finance-midterm.sheet.json
npm run cheatsheet -- pack finance-capm -o out/capm.sheet.json
npm run cheatsheet -- pack --all -o out/packs/
npm run cheatsheet -- merge a.sheet.json b.sheet.json -o combined.sheet.json
npm run cheatsheet -- add-catalog sheet.json --id math-quad --id math-binom
npm run cheatsheet -- append-outline out/capm.sheet.json extra.outline.json
# Windows: pwsh scripts/agent-sheet-workflow.ps1 finance-midterm
# Unix:    bash scripts/agent-sheet-workflow.sh finance-midterm
```

Then **My Sheets → Import JSON** (or drop the file) in the app.

## Workspace export / import loop

| Direction | Where |
|-----------|--------|
| Out | Workspace → **Export JSON** or **Ctrl/Cmd+Shift+E** |
| In | Workspace / My Sheets → **Import JSON** or **Ctrl/Cmd+Shift+I** |

Round-trip: polish in UI → Export JSON → agent appends / re-layouts → Import JSON.

Agent skill for coding assistants: [`.agents/skills/cheatsheet-agent-authoring/SKILL.md`](../.agents/skills/cheatsheet-agent-authoring/SKILL.md).

## Extending safely

- Prefer adding helpers **inside** `packages/cheatsheet-sdk`  
- If the app schema gains fields, bump `SHEET_DOC_VERSION` and document migrations  
- Avoid importing SDK code into `src/` unless you deliberately want a shared module  
  (app import uses a thin `src/lib/sheetDocumentImport.ts` copy of validation)

## Tests

```bash
npm run test:sdk
# or
npm test -- --run packages/cheatsheet-sdk
```
