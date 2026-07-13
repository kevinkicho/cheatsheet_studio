# @cheatsheet-studio/sdk

Headless **SDK + CLI** for authoring [CheatSheet Studio](../../README.md) sheets from agents, scripts, or CI.

## npm package

```bash
# Monorepo
npm run sdk:build    # export seed catalog + tsc
npm run sdk:pack     # create tarball (inspect before publish)

# Publish (maintainers):
# cd packages/cheatsheet-sdk && npm publish --access public
```

Published name: **`@cheatsheet-studio/sdk`** (optional; monorepo works without publishing).

## Does this change the web app?

**No.** This package is isolated under `packages/cheatsheet-sdk/`.

| | Web app (`src/`, Vite) | SDK / CLI |
|--|------------------------|-----------|
| Runtime | React UI you already use | Node only |
| Bundle | Unchanged | Not linked into the app |
| When it runs | Browser | Terminal / agent |

Sheets produced here use the **same document shape** the app already loads (`canvas` + `items` + `folders`). Import in Studio, polish layout, export PDF — the UI stays the product surface.

## Flagship story (one path)

**Agent builds a midterm → Import JSON → Export PDF**

```bash
# From monorepo root — block-rich midterms + PDF/PNG/JPG
npx playwright install chromium   # once
npm run agent:flagships
# → examples/agent-out/*.{sheet.json,html,pdf,png,jpg}

npm run agent:flagships:json      # JSON only
npm run cheatsheet -- export-png out/sheet.json -o out/sheet.png
```

In the Studio (signed in):

1. **Import JSON** (mode: new / replace / append) or **drop** `.sheet.json`  
2. Toast + fit-print; Workspace shows the sheet  
3. Polish → **Export → PDF** (Studio WYSIWYG print pages)

Layout denser packs: `cheatsheet layout sheet.json --dense --mode sections`.

## Quick start (from monorepo root)

```bash
# Flagship pack (recommended first run)
npm run agent:flagship

# Or agent-friendly outline → full sheet
npm run cheatsheet -- compose examples/outline.demo.json -o examples/from-outline.sheet.json

# Or build step by step
npm run cheatsheet -- init -o examples/demo.sheet.json --title "Agent demo"
npm run cheatsheet -- add-equation examples/demo.sheet.json --title "Energy" --latex "E=mc^2"
npm run cheatsheet -- layout examples/demo.sheet.json
npm run cheatsheet -- validate examples/demo.sheet.json
```

### Open in the web app (no Admin required)

1. Generate `*.sheet.json` with the CLI/SDK  
2. In the Studio: **My Sheets → Import JSON** (or drag-and-drop onto Workspace / My Sheets)  
3. Workspace opens with the imported sheet (saved to your account when signed in)  
4. **Export → PDF** for print-page capture

### TypeScript API

```ts
import { createSheet, writeSheetFile } from './packages/cheatsheet-sdk/src/index.ts'

const sheet = createSheet({ title: 'Calc review' })
  .addEquation({ title: 'Chain rule', latex: '\\frac{dy}{dx}=\\frac{dy}{du}\\frac{du}{dx}' })
  .addProcess({
    title: 'Steps',
    mermaidSource: 'flowchart TD\n  A[Read]-->B[Differentiate]-->C[Simplify]',
  })
  .autoLayout()
  .build()

writeSheetFile('out/calc.sheet.json', sheet)
```

### Push to Firestore (optional)

Uses the same Admin SDK path as `npm run seed`. **Never commit** service account JSON.

```bash
npm run cheatsheet -- push examples/demo.sheet.json \
  --uid YOUR_FIREBASE_USER_UID \
  --sa ./path-to-serviceAccount.json
```

Then sign in as that user in the Studio and open **My Sheets**.

## CLI commands

| Command | Purpose |
|---------|---------|
| `init -o file.json` | New empty sheet |
| `compose outline.json -o file.json` | Outline → full sheet (agents) |
| `add-equation` / `add-table` / `add-process` / `add-figure` | Append cards |
| `layout` | Auto-pack into print margins (multi-column when tall) |
| `validate` | Structural check |
| `summarize` | One-line summary |
| `push` | Create/update Firestore `sheets` doc |
| `pull` | Download Firestore sheet → JSON |
| `packs` | List premade topic packs |
| `pack <id> -o file` | Compose a topic pack |
| `export-html` / `export-pdf` | Print HTML or PDF (Playwright) |
| `mcp` | Stdio MCP server for coding agents |

### MCP config

See [mcp.example.json](./mcp.example.json) and monorepo [`.mcp.json.example`](../../.mcp.json.example).

### Studio blocks (equations · process · figures)

```bash
npm run cheatsheet -- blocks --stats
npm run cheatsheet -- blocks --type equation --query quadratic
npm run cheatsheet -- blocks --type process --kind flowchart
npm run cheatsheet -- blocks --type figure

npm run cheatsheet -- init -o out/sheet.json --title "From blocks"
npm run cheatsheet -- add-blocks out/sheet.json --id math-quad --id proc-npv-screen --id fig-unit-circle
```

Outline demo: `examples/outline.blocks-demo.json` → `{ "type": "catalog", "ids": [...] }` or `{ "type": "blocks", "query": "…", "blockType": "process" }`.

### Topic packs

```bash
npm run cheatsheet -- packs
npm run cheatsheet -- packs --subject finance
npm run cheatsheet -- pack finance-midterm -o examples/agent-out/finance-midterm.sheet.json
npm run cheatsheet -- pack stats-bayes -o examples/bayes.sheet.json
```

Flagship pack id: **`finance-midterm`**.

## Design notes

- **Schema `v: 1`** — portable `SheetDocument`; Firestore payload omits `v`/`meta` (app ignores unknown fields).
- Process cards store **Mermaid source**; optional `processFlow` for exact editor fidelity (export from the app later).
- Layout is intentionally simple (vertical pack). Humans refine in the UI.

See also [docs/agent-sdk.md](../../docs/agent-sdk.md).
