# CheatSheet Studio CLI guide

Headless CLI for agents and scripts (`packages/cheatsheet-sdk`).  
**Does not start Vite or the React app.** Output is portable `SheetDocument` JSON the Studio can **Import**.

```bash
# From monorepo root
npm run cheatsheet -- <command> [args…]
# or
npx tsx packages/cheatsheet-sdk/src/cli.ts <command> [args…]
```

Help:

```bash
npm run cheatsheet -- help
```

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Quick start for agents](#quick-start-for-agents)
3. [Kitchen-sink “everything” + SVG export](#kitchen-sink-everything--svg-export)
4. [Commands reference](#commands-reference)
5. [Print / vector export notes](#print--vector-export-notes)
6. [Studio round-trip](#studio-round-trip)
7. [npm scripts](#npm-scripts)
8. [Related docs](#related-docs)

---

## Prerequisites

| Need | When |
|------|------|
| Node **≥ 20** | Always |
| Monorepo root as cwd | Loading live seed catalog (`src/data/seedLibrary.ts`) |
| `npx playwright install chromium` | `export-pdf`, `export-svg`, `export-png`, `export-jpg` |
| `CHEATSHEET_SA_PATH` + `CHEATSHEET_UID` | `push` / `pull` only (optional) |

---

## Quick start for agents

```bash
# 1) Build a sheet (pick one)
npm run cheatsheet -- pack finance-midterm -o out/finance.sheet.json
npm run agent:everything   # full catalog stress sheet

# 2) Validate
npm run cheatsheet -- validate out/finance.sheet.json
npm run cheatsheet -- summarize out/finance.sheet.json --verbose

# 3) Export (headless print layout — not Studio canvas pixels)
npm run cheatsheet -- export-html out/finance.sheet.json -o out/finance.html
npx playwright install chromium   # once
npm run cheatsheet -- export-svg out/finance.sheet.json -o out/finance.svg
npm run cheatsheet -- export-pdf out/finance.sheet.json -o out/finance.pdf --keep-html
```

Human polish path: **Import JSON** in Studio → **Auto-layout** → **Export → PDF/SVG** (WYSIWYG).

---

## Kitchen-sink “everything” + SVG export

### What `everything` builds

- **All** seed catalog items (equations, tables, figures) **+** curated process blocks  
- Grouped into Layers folders: **Subject → Topic** (plus section banners)  
- **Dense shelf pack** by default (variable-size cards side-by-side, multipage)

> **Layout caveat:** CLI `everything` uses the SDK shelf packer (`packCheatsheetDocument`),
> **not** the Studio Auto-layout button (`packCheatsheetLayout` in `src/lib/autoOrganize.ts`).
> They are related but not identical. After Import, press **Auto-layout** for Studio’s
> free-flow 24px grid pack (multipage by default; nested panel levels, n-gon chrome —
> see [auto-layout.md](./auto-layout.md)). Studio SVG **All together** stitches pages
> into **one** file.

```bash
# Counts by type/subject
npm run agent:everything:stats
# or
npm run cheatsheet -- everything --stats
npm run cheatsheet -- everything --stats --json

# Full kitchen sink (dense shelf pack)
npm run agent:everything
# → examples/agent-out/everything.sheet.json

# Filters
npm run cheatsheet -- everything --subject finance -o out/fin-all.sheet.json
npm run cheatsheet -- everything --type equation --type process --limit 80 -o out/stress.sheet.json
npm run cheatsheet -- everything --density xs -o out/stress.sheet.json
npm run cheatsheet -- everything --no-layout -o out/raw.sheet.json
npm run cheatsheet -- everything --title "Layout stress" -o out/stress.sheet.json

# Re-pack any existing sheet with the dense mosaic
npm run cheatsheet -- layout out/sheet.json --pack --density sm
```

### Agent: export SVG from everything

```bash
# One-shot (recommended for agents)
npm run agent:everything:svg

# Equivalent steps
npm run agent:everything
npx playwright install chromium   # once per machine
npm run cheatsheet -- export-svg \
  examples/agent-out/everything.sheet.json \
  -o examples/agent-out/everything.svg \
  --keep-html
```

Outputs (CLI print path):

| File | Role |
|------|------|
| `everything.sheet.json` | Import into Studio |
| `everything.svg` | Vector SVG (viewBox = packed surface) |
| `everything.vector.html` | Chrome-friendly companion if pure `.svg` is awkward offline |
| `everything.print.html` | Intermediate print HTML (deleted unless `--keep-html`) |

**Studio vs CLI SVG**

| Path | Engine | Use when |
|------|--------|----------|
| **CLI `export-svg`** | Playwright + print HTML (`export-print.ts`) | Agents/CI, no browser UI |
| **Studio Export → SVG** | Live canvas host (`exportSvg.ts`) | Human WYSIWYG after Import + Auto-layout |

They are **not** pixel-identical. CLI is for automated stress tests; Studio is for final polished look.

### Optional: multipage PDF from everything

```bash
npm run cheatsheet -- export-pdf \
  examples/agent-out/everything.sheet.json \
  -o examples/agent-out/everything.pdf \
  --keep-html
```

---

## Commands reference

### Authoring

| Command | Purpose |
|---------|---------|
| `init -o sheet.json` | Empty sheet skeleton |
| `compose <outline.json> -o sheet.json` | Outline → sheet (`autoLayout` unless disabled) |
| `append-outline <sheet.json> <outline.json>` | Append blocks + re-layout |
| `pack <packId> -o sheet.json` | Topic pack → sheet |
| `pack --all -o dir/` | All packs into a directory |
| `everything -o sheet.json` | **Full catalog** kitchen sink |
| `everything --stats` | Catalog counts only |
| `merge a.json b.json -o out.json` | Merge sheets |
| `add-blocks sheet.json --id id1 --id id2` | Append catalog ids |
| `add-equation` / `add-table` / `add-process` / `add-figure` | Append one block |
| `layout sheet.json [--dense] [--mode sections\|columns\|single] [--columns N]` | Re-pack items in place |

### Catalog

| Command | Purpose |
|---------|---------|
| `blocks [--type equation\|table\|figure\|process] [--query …] [--kind flowchart\|mindmap]` | List/search Studio blocks |
| `catalog-search` | Alias of `blocks` |
| `packs [--subject mathematics] [--json]` | List topic packs |
| `doctor [--json]` | SDK health (catalog, packs, cloud env) |

### Validate / inspect

| Command | Purpose |
|---------|---------|
| `validate sheet.json` | Schema / shape checks |
| `summarize sheet.json [--verbose]` | Title, counts, print size |

### Export

| Command | Purpose |
|---------|---------|
| `export-html sheet.json -o out.html [--light]` | Print HTML (zoomable in browser) |
| `export-svg sheet.json -o out.svg [--keep-html] [--light] [--plain]` | **Vector SVG** (+ optional vector HTML) |
| `export-pdf sheet.json -o out.pdf [--keep-html] [--light] [--plain]` | PDF via Playwright |
| `export-png sheet.json -o out.png [--scale 2]` | Raster PNG |
| `export-jpg sheet.json -o out.jpg [--scale 2]` | Raster JPEG |

Common export flags:

- `--light` — light paper theme (default is dark)  
- `--keep-html` — keep intermediate `.print.html`  
- `--plain` — simpler print CSS (less rich)  
- `--scale N` — raster only (default 2)

### Cloud (optional)

```bash
export CHEATSHEET_SA_PATH=./sa.json
export CHEATSHEET_UID=<firebase_uid>
npm run cheatsheet -- push out/sheet.json
npm run cheatsheet -- pull --sheet-id ID -o out/pulled.json
```

### MCP

```bash
npm run cheatsheet:mcp
# or: npm run cheatsheet -- mcp
```

---

## Print / vector export notes

1. **Prefer `export-svg` or `export-html` over PNG** when agents need scalable output.  
2. Install Chromium once: `npx playwright install chromium`.  
3. **Large everything sheets** (100+ cards, many pages) can take minutes for Playwright SVG/PDF.  
4. If `.svg` looks blank in some viewers, open the sibling **`.vector.html`**.  
5. Studio SVG export (in-app) uses a different pipeline optimized for Mermaid embeds — use that after Import when matching the canvas matters.

---

## Studio round-trip

1. Agent writes `*.sheet.json` (`everything`, `pack`, `compose`, …)  
2. Human/agent: **Import JSON** (or drop file)  
3. Optional: **Auto-layout** in Studio (app grid packer)  
4. **Export → PDF / SVG / PNG** from the top bar (WYSIWYG)  

JSON schema version: see CLI help (`Sheet schema version: v=…`).

---

## npm scripts

| Script | Command |
|--------|---------|
| `npm run cheatsheet -- …` | CLI entry |
| `npm run agent:everything` | Full catalog → `examples/agent-out/everything.sheet.json` |
| `npm run agent:everything:stats` | Catalog counts |
| `npm run agent:everything:svg` | Everything sheet **+** CLI SVG export |
| `npm run agent:flagship` | finance-midterm pack |
| `npm run agent:flagships` | Interactive multi-pack pipeline |
| `npm run agent:flagships:all` | Non-interactive all packs |
| `npm run test:sdk` | SDK unit tests |

---

## Related docs

- [auto-layout.md](./auto-layout.md) — Studio Auto-layout (free-flow, nested panels, n-gon)  
- [agent-sdk.md](./agent-sdk.md) — TypeScript API, MCP, layout philosophy  

- [flagship.md](./flagship.md) — flagship product path  
- [vector-graphics.md](./vector-graphics.md) — vector policy + Studio SVG export  
- Root [README.md](../README.md) — app features and setup  
