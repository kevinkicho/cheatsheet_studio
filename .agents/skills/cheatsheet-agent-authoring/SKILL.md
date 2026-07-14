---
name: cheatsheet-agent-authoring
description: >
  Author CheatSheet Studio sheets via the headless SDK/CLI for agents.
  Use when building math/science/finance cheat sheets programmatically,
  composing topic packs, searching the seed catalog, or round-tripping
  JSON with the web app (Import/Export). Triggers: "make a sheet",
  "cheatsheet CLI", "topic pack", "compose outline", agent sheet JSON.
---

# CheatSheet Studio — Agent authoring

## Isolation

- Headless code: `packages/cheatsheet-sdk/` (Node only)
- Does **not** change the React canvas UI
- Web: **Export JSON** (Workspace, `Ctrl+Shift+E`) · **Import JSON** (My Sheets)

## Preferred workflows

### 0. Flagship path (demo the product)

```bash
# All flagships → JSON + HTML + PDF + PNG + JPG (block-rich sheets)
npx playwright install chromium   # once
npm run agent:flagships
# → examples/agent-out/{finance-midterm,calc-final,stats-midterm,micro-midterm}.{sheet.json,html,pdf,png,jpg}

npm run agent:flagships:json      # JSON only, no Playwright
npm run agent:flagship:validate

# denser layout / single format:
npm run cheatsheet -- layout out/sheet.json --dense --mode sections
npm run cheatsheet -- export-png out/sheet.json -o out/sheet.png
npm run cheatsheet -- export-jpg out/sheet.json -o out/sheet.jpg
```

Flagships use **Studio blocks** (seed equations/figures + process flowcharts/mind maps).  
User: **Import** `*.sheet.json` → polish → Studio **Export PDF** (WYSIWYG).

### 1. Topic pack (fastest)

```bash
npm run cheatsheet -- packs
npm run cheatsheet -- pack finance-midterm -o out/finance-midterm.sheet.json
npm run cheatsheet -- pack calc-derivatives -o out/calc.sheet.json
```

17+ packs — run `npm run cheatsheet -- packs` (filter: `--subject finance`).

```bash
npm run cheatsheet -- doctor
npm run cheatsheet -- packs --subject mathematics
npm run cheatsheet -- pack --all -o out/packs/
npm run cheatsheet -- merge a.sheet.json b.sheet.json -o combined.sheet.json
# Demo: pwsh scripts/agent-sheet-workflow.ps1 finance-midterm
```

User: **My Sheets → Import JSON** → polish in Workspace.

### 2. Custom outline (prefer **folders** = Layers)

Folders are the main agent hook for layout quality: same-folder cards pack as a
tight cluster before the next folder. Studio Layers shows the same collections.

Write `outline.json`:

```json
{
  "title": "My topic",
  "autoLayout": true,
  "blocks": [
    {
      "type": "folder",
      "name": "1. Core formulas",
      "heading": "1. Core formulas",
      "banner": true,
      "blocks": [
        { "type": "catalog", "ids": ["math-quad", "math-pythag"] },
        { "type": "equation", "title": "…", "latex": "…" }
      ]
    },
    {
      "type": "folder",
      "name": "2. Workflows",
      "heading": "2. Workflows",
      "banner": true,
      "blocks": [
        { "type": "process", "mermaid": "flowchart TD\n A-->B", "kind": "flowchart" },
        { "type": "table", "markdown": "| a | b |\n|---|---|" }
      ]
    }
  ]
}
```

Legacy flat outlines still work (`heading` + loose blocks). Prefer folders when
building multi-section midterm sheets.

```bash
npm run cheatsheet -- compose outline.json -o out/sheet.json
npm run cheatsheet -- validate out/sheet.json
```

### 3. Studio blocks (preferred content)

Use curated equations / figures / process charts instead of inventing content:

```bash
npm run cheatsheet -- blocks --type equation --query quadratic
npm run cheatsheet -- blocks --type process --kind flowchart
npm run cheatsheet -- blocks --type figure
npm run cheatsheet -- add-blocks out/sheet.json --id math-quad --id proc-npv-screen --id fig-unit-circle
```

Outline: `{ "type": "catalog", "id": "math-quad" }` or `{ "type": "catalog", "ids": ["…"] }`  
or `{ "type": "blocks", "query": "npv", "blockType": "process", "limit": 1 }`.

### 4. Append more content

```bash
npm run cheatsheet -- append-outline out/sheet.json extra.outline.json
```

### 5. Print PDF / HTML

```bash
npx playwright install chromium   # once
npm run cheatsheet -- export-pdf out/sheet.json -o out/sheet.pdf
npm run cheatsheet -- export-html out/sheet.json -o out/sheet.html
```

### 6. Cloud (trusted only)

```bash
export CHEATSHEET_SA_PATH=./sa.json
export CHEATSHEET_UID=<firebase_uid>
npm run cheatsheet -- push out/sheet.json
```

### 5. Round-trip with UI

1. User **Export JSON** from Workspace (or `Ctrl+Shift+E`)
2. Agent edits / appends outline / re-layouts
3. User **Import JSON** on My Sheets

## MCP

```bash
npm run cheatsheet:mcp
```

Config: monorepo `.mcp.json.example` (cwd = workspace root).

Tools include: `cheatsheet_compose`, `cheatsheet_compose_pack`,
`cheatsheet_list_packs`, `cheatsheet_append_outline`,
`cheatsheet_catalog_search`, `cheatsheet_validate`, …

## TypeScript API

```ts
import {
  composeFromOutline,
  composeTopicPack,
  appendOutlineToSheet,
  createSheet,
  writeSheetFile,
} from './packages/cheatsheet-sdk/src/index.ts'
```

## Rules of thumb

- Prefer **Studio blocks** (`blocks` / `catalog`) for equations, figures, and process charts
- Prefer **folders** (`type: "folder"`) so Auto layout / pack collocates related cards
- Use topic packs for full midterm sheets; use blocks to customize
- Always `validate` before telling the user to import
- Layout is automatic; humans refine free-transform in the app
- Studio export: PDF / **SVG** (vector) / PNG / JPEG
- Never commit Firebase service account JSON; `push` is optional Admin only

## Docs

- [docs/agent-sdk.md](../../../docs/agent-sdk.md)
- [packages/cheatsheet-sdk/README.md](../../../packages/cheatsheet-sdk/README.md)
