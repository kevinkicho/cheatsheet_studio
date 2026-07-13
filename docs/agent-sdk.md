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

### Local file + Import JSON (recommended)

1. Agent writes `*.sheet.json` (or an outline + `compose`)  
2. Human: **My Sheets → Import JSON** → file picker  
3. Workspace opens; sheet is created under the signed-in user (or local fallback)  
4. Human polishes layout / process charts in the UI  

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

```bash
npm run cheatsheet -- push out/sheet.json --uid UID --sa ./sa.json
npm run cheatsheet -- pull --sheet-id ID --sa ./sa.json -o out/pulled.json
```

> Prefer Admin only in trusted environments. Do not embed service accounts in client apps or agent prompts.

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

Tools: `cheatsheet_compose`, `cheatsheet_validate`, `cheatsheet_catalog_search`,
`cheatsheet_add_catalog`, `cheatsheet_init`, `cheatsheet_summarize`.

Point your agent’s MCP config at: `npx tsx packages/cheatsheet-sdk/src/cli.ts mcp`
(from the monorepo root).

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
