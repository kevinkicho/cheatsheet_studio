# Flagship product path

**Agent builds a midterm sheet → Import JSON → Export PDF**

This is the canonical story of CheatSheet Studio: headless authoring + polished UI + print delivery.

## 1. Agent (terminal)

```bash
npm run agent:flagship          # finance-midterm
npm run agent:flagships         # + calc-final, stats-midterm, micro-midterm
npm run agent:flagship:validate
# optional agent PDF (not Studio WYSIWYG):
npm run agent:flagship:pdf
```

Output: `examples/agent-out/*.sheet.json` (gitignored dumps; regenerate anytime).

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

## Publish SDK

```bash
npm run sdk:build
npm run sdk:pack
# after npm login:
cd packages/cheatsheet-sdk && npm publish --access public
```

See [packages/cheatsheet-sdk/PUBLISH.md](../packages/cheatsheet-sdk/PUBLISH.md).
