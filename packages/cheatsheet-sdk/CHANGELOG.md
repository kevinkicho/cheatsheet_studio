# Changelog

## 0.3.2

- Layout v2: dense multi-column, **sections** mode (headings as bands), multi-page pageCount hint
- Flagship packs: **`finance-midterm`**, **`calc-final`**, **`stats-midterm`**, **`micro-midterm`**
- CLI `layout --dense` / `--mode sections|columns|single`
- App import modes: new / replace / append + recent-import history + fit-print after import
- CI smoke for flagship packs; export PDF parity note (Studio vs CLI)

## 0.3.1

- Flagship pack **`finance-midterm`** (TVM, NPV/IRR, CAPM, WACC + decision flows)
- Monorepo scripts: `agent:flagship`, `agent:flagship:pdf`, `agent:flagship:validate`
- App: shared Import JSON path (toast, drag-drop overlay, My Sheets + TopBar)

## 0.3.0

- `export-html` / `export-pdf` (Playwright) for agent delivery
- MCP export tools · PUBLISH.md for npm
- 16+ topic packs maintained

## 0.2.2

- 16 topic packs (+ series, accounting)
- `merge` sheets · multi `--id` on add-catalog · `packs --subject`
- `summarize --verbose` · agent workflow scripts
- Ctrl+Shift+I import shortcut

## 0.2.1

- 14 topic packs (complex, org-chem, micro S&D, …)
- `pack --all -o dir/` generate every pack
- `doctor` CLI + MCP health check
- Workspace top-bar **Import JSON** (alongside Export)

## 0.2.0

- Topic packs: calc, lin-algebra, finance (CAPM/NPV), physics, chem, bio, econ, stats
- `append-outline` CLI + MCP tool
- Seed catalog snapshot for npm (`data/seed-catalog.json`)
- Cloud auth helpers (`CHEATSHEET_SA_PATH`, `CHEATSHEET_UID`, …)
- MCP `cheatsheet_push` / `cheatsheet_pull` with env-based credentials
- TypeScript build → `dist/` for publishable package
- MCP config examples

## 0.1.0

- Initial headless SDK + CLI: compose, validate, layout, catalog, push/pull
- My Sheets Import JSON integration in host app (separate)
