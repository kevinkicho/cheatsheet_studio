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

Sheets produced here use the **same document shape** the app already loads (`canvas` + `items` + `folders`). After `push` (or a future import UI), open **My Sheets / Workspace** as usual — layout and polish stay in the Studio.

## Quick start (from monorepo root)

```bash
# Agent-friendly outline → full sheet
npm run cheatsheet -- compose examples/outline.demo.json -o examples/from-outline.sheet.json

# Or build step by step
npm run cheatsheet -- init -o examples/demo.sheet.json --title "Agent demo"
npm run cheatsheet -- add-equation examples/demo.sheet.json --title "Energy" --latex "E=mc^2"
npm run cheatsheet -- layout examples/demo.sheet.json
npm run cheatsheet -- validate examples/demo.sheet.json
```

### Open in the web app (no Admin required)

1. Generate `*.sheet.json` with the CLI/SDK  
2. In the Studio: **My Sheets → Import JSON**  
3. Workspace opens with the imported sheet (saved to your account when signed in)

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
| `mcp` | Stdio MCP server for coding agents |

### MCP config

See [mcp.example.json](./mcp.example.json) and monorepo [`.mcp.json.example`](../../.mcp.json.example).

### Topic packs

```bash
npm run cheatsheet -- packs
npm run cheatsheet -- pack stats-bayes -o examples/bayes.sheet.json
```

## Design notes

- **Schema `v: 1`** — portable `SheetDocument`; Firestore payload omits `v`/`meta` (app ignores unknown fields).
- Process cards store **Mermaid source**; optional `processFlow` for exact editor fidelity (export from the app later).
- Layout is intentionally simple (vertical pack). Humans refine in the UI.

See also [docs/agent-sdk.md](../../docs/agent-sdk.md).
