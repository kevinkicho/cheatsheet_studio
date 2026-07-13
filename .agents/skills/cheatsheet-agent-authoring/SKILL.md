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

### 1. Topic pack (fastest)

```bash
npm run cheatsheet -- packs
npm run cheatsheet -- pack calc-derivatives -o out/calc.sheet.json
```

16+ packs — run `npm run cheatsheet -- packs` (filter: `--subject finance`).

```bash
npm run cheatsheet -- doctor
npm run cheatsheet -- packs --subject mathematics
npm run cheatsheet -- pack --all -o out/packs/
npm run cheatsheet -- merge a.sheet.json b.sheet.json -o combined.sheet.json
# Demo: pwsh scripts/agent-sheet-workflow.ps1 calc-derivatives
```

User: **My Sheets → Import JSON** → polish in Workspace.

### 2. Custom outline

Write `outline.json`:

```json
{
  "title": "My topic",
  "autoLayout": true,
  "blocks": [
    { "type": "heading", "title": "Section" },
    { "type": "equation", "title": "…", "latex": "…" },
    { "type": "table", "markdown": "| a | b |\n|---|---|" },
    { "type": "process", "mermaid": "flowchart TD\n A-->B", "kind": "flowchart" },
    { "type": "catalog", "id": "math-quad" }
  ]
}
```

```bash
npm run cheatsheet -- compose outline.json -o out/sheet.json
npm run cheatsheet -- validate out/sheet.json
```

### 3. Seed catalog

```bash
npm run cheatsheet -- catalog-search --query quadratic --limit 8
npm run cheatsheet -- add-catalog out/sheet.json --id math-quad
```

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

- Prefer **catalog** / topic packs for real Studio formulas over inventing LaTeX
- Always `validate` before telling the user to import
- Layout is automatic; humans refine free-transform in the app
- Never commit Firebase service account JSON; `push` is optional Admin only

## Docs

- [docs/agent-sdk.md](../../../docs/agent-sdk.md)
- [packages/cheatsheet-sdk/README.md](../../../packages/cheatsheet-sdk/README.md)
