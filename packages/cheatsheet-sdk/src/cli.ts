/**
 * CheatSheet Studio CLI — agent / script entrypoint.
 * Does not start Vite or the React app.
 */
import { readFileSync } from 'node:fs'
import { createSheet, SheetBuilder } from './builder'
import { findCatalogItem, searchCatalog } from './catalog'
import { composeFromOutline } from './compose'
import { pushSheetToFirestore } from './firebase-push'
import { pullSheetFromFirestore } from './firebase-pull'
import { readSheetFile, summarizeSheet, writeSheetFile } from './io'
import type { SheetOutline } from './outline'
import { SHEET_DOC_VERSION } from './types'
import { validateSheetDocument } from './validate'

function printHelp() {
  console.log(
    `
CheatSheet Studio CLI (headless SDK) — does not start the web app

Commands:
  init           Create a new empty sheet JSON
  compose        Build a sheet from an outline JSON file (agent-friendly)
  catalog-search Search seed library (equations/tables/figures)
  add-catalog    Append a seed catalog item by id or title
  add-equation | add-table | add-process | add-figure
  layout         Auto-pack items (multi-column when tall)
  validate       Check sheet JSON shape
  summarize      Print a one-line summary
  push           Upload to Firestore (firebase-admin)
  pull           Download a Firestore sheet to JSON

Examples:
  npm run cheatsheet -- compose examples/outline.demo.json -o out/from-outline.json
  npm run cheatsheet -- catalog-search --query quadratic --limit 5
  npm run cheatsheet -- add-catalog out/sheet.json --id math-quad
  npm run cheatsheet -- mcp   # stdio MCP server for coding agents

In the web app: My Sheets → Import JSON

Sheet schema version: v=${SHEET_DOC_VERSION}
`.trim(),
  )
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  return args[i + 1]
}

function requireArg(args: string[], name: string, label: string): string {
  const v = argValue(args, name)
  if (!v) {
    console.error(`Missing ${label} (${name})`)
    process.exit(1)
  }
  return v
}

async function run() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    printHelp()
    process.exit(0)
  }

  try {
    if (cmd === 'mcp') {
      const { startMcpServer } = await import('./mcp-server')
      await startMcpServer()
      return
    }

    if (cmd === 'init') {
      const out = argValue(args, '-o') ?? argValue(args, '--out')
      if (!out) {
        console.error('Missing -o / --out path')
        process.exit(1)
      }
      const title = argValue(args, '--title') ?? 'Untitled sheet'
      const sheet = createSheet({
        title,
        meta: { createdBy: 'cli', source: 'cheatsheet-cli' },
      }).build()
      writeSheetFile(out, sheet)
      console.log(`Wrote ${out}`)
      console.log(summarizeSheet(sheet))
      return
    }

    if (cmd === 'compose') {
      const outlinePath = args[1]
      if (!outlinePath) {
        console.error(
          'Usage: compose <outline.json> -o <sheet.json>\n' +
            'Outline blocks: equation|table|process|figure|heading|catalog',
        )
        process.exit(1)
      }
      const out = argValue(args, '-o') ?? argValue(args, '--out')
      if (!out) {
        console.error('Missing -o / --out path')
        process.exit(1)
      }
      const raw = JSON.parse(readFileSync(outlinePath, 'utf8')) as SheetOutline
      if (!raw || typeof raw.title !== 'string' || !Array.isArray(raw.blocks)) {
        console.error('Outline needs title (string) and blocks (array)')
        process.exit(1)
      }
      const sheet = await composeFromOutline(raw)
      writeSheetFile(out, sheet)
      console.log(`Composed ${out}`)
      console.log(summarizeSheet(sheet))
      return
    }

    if (cmd === 'catalog-search') {
      const query = argValue(args, '--query') ?? args[1] ?? ''
      const typeRaw = argValue(args, '--type')
      const type =
        typeRaw === 'equation' ||
        typeRaw === 'table' ||
        typeRaw === 'figure'
          ? typeRaw
          : 'all'
      const limit = Number(argValue(args, '--limit') ?? '15')
      const hits = await searchCatalog({ query, type, limit })
      if (hits.length === 0) {
        console.log('No catalog matches')
        return
      }
      for (const h of hits) {
        console.log(
          `${h.id.padEnd(22)} ${h.type.padEnd(9)} ${h.title}${
            h.topic ? ` · ${h.topic}` : ''
          }`,
        )
      }
      console.log(`(${hits.length} result(s))`)
      return
    }

    if (cmd === 'add-catalog') {
      const file = args[1]
      if (!file) {
        console.error(
          'Usage: add-catalog <sheet.json> --id <catalogId|title>',
        )
        process.exit(1)
      }
      const id =
        argValue(args, '--id') ??
        argValue(args, '--title') ??
        requireArg(args, '--id', 'catalog id or title')
      const found = await findCatalogItem(id)
      if (!found) {
        console.error(`Not found in seed catalog: ${id}`)
        process.exit(1)
      }
      const next = await SheetBuilder.fromDocument(readSheetFile(file))
        .addFromCatalog(id)
        .then((b) => b.build())
      writeSheetFile(file, next)
      console.log(`Added catalog ${found.id} (${found.title}) ·`, summarizeSheet(next))
      return
    }

    if (cmd === 'validate') {
      const file = args[1]
      if (!file) {
        console.error('Usage: validate <sheet.json>')
        process.exit(1)
      }
      const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
      const result = validateSheetDocument(raw)
      if (!result.ok) {
        console.error('INVALID')
        for (const i of result.issues) {
          console.error(`  ${i.path || '(root)'}: ${i.message}`)
        }
        process.exit(1)
      }
      console.log('OK', summarizeSheet(result.sheet))
      return
    }

    if (cmd === 'summarize') {
      const file = args[1]
      if (!file) {
        console.error('Usage: summarize <sheet.json>')
        process.exit(1)
      }
      console.log(summarizeSheet(readSheetFile(file)))
      return
    }

    if (cmd === 'layout') {
      const file = args[1]
      if (!file) {
        console.error('Usage: layout <sheet.json> [--columns 1|2|3]')
        process.exit(1)
      }
      const colsRaw = argValue(args, '--columns')
      const columns = colsRaw ? Number(colsRaw) : undefined
      const next = SheetBuilder.fromDocument(readSheetFile(file))
        .autoLayout(
          columns && Number.isFinite(columns)
            ? { columns, mode: 'columns' }
            : undefined,
        )
        .build()
      writeSheetFile(file, next)
      console.log('Laid out', summarizeSheet(next))
      return
    }

    if (cmd === 'add-equation') {
      const file = args[1]
      if (!file) {
        console.error(
          'Usage: add-equation <sheet.json> --latex "..." [--title "..."]',
        )
        process.exit(1)
      }
      const latex = requireArg(args, '--latex', 'LaTeX')
      const title = argValue(args, '--title')
      const next = SheetBuilder.fromDocument(readSheetFile(file))
        .addEquation({ latex, title })
        .build()
      writeSheetFile(file, next)
      console.log('Added equation ·', summarizeSheet(next))
      return
    }

    if (cmd === 'add-table') {
      const file = args[1]
      if (!file) {
        console.error(
          'Usage: add-table <sheet.json> --markdown "| a | b |" [--title "..."]',
        )
        process.exit(1)
      }
      const md = requireArg(args, '--markdown', 'markdown table').replace(
        /\\n/g,
        '\n',
      )
      const title = argValue(args, '--title')
      const next = SheetBuilder.fromDocument(readSheetFile(file))
        .addTable({ tableMarkdown: md, title })
        .build()
      writeSheetFile(file, next)
      console.log('Added table ·', summarizeSheet(next))
      return
    }

    if (cmd === 'add-process') {
      const file = args[1]
      if (!file) {
        console.error(
          'Usage: add-process <sheet.json> --mermaid "flowchart TD\\n A-->B" [--kind flowchart|mindmap]',
        )
        process.exit(1)
      }
      const mermaid = requireArg(args, '--mermaid', 'Mermaid source').replace(
        /\\n/g,
        '\n',
      )
      const title = argValue(args, '--title')
      const kindRaw = argValue(args, '--kind')
      const mermaidKind =
        kindRaw === 'mindmap' ? ('mindmap' as const) : ('flowchart' as const)
      const next = SheetBuilder.fromDocument(readSheetFile(file))
        .addProcess({ mermaidSource: mermaid, title, mermaidKind })
        .build()
      writeSheetFile(file, next)
      console.log('Added process ·', summarizeSheet(next))
      return
    }

    if (cmd === 'add-figure') {
      const file = args[1]
      if (!file) {
        console.error(
          'Usage: add-figure <sheet.json> --url "https://.../fig.svg" [--title "..."]',
        )
        process.exit(1)
      }
      const imageUrl = requireArg(args, '--url', 'image URL')
      const title = argValue(args, '--title')
      const next = SheetBuilder.fromDocument(readSheetFile(file))
        .addFigure({ imageUrl, title })
        .build()
      writeSheetFile(file, next)
      console.log('Added figure ·', summarizeSheet(next))
      return
    }

    if (cmd === 'push') {
      const file = args[1]
      if (!file) {
        console.error(
          'Usage: push <sheet.json> --uid <ownerUid> --sa <serviceAccount.json> [--sheet-id id]',
        )
        process.exit(1)
      }
      const uid = requireArg(args, '--uid', 'Firebase owner uid')
      const sa = requireArg(args, '--sa', 'service account JSON path')
      const sheetId = argValue(args, '--sheet-id')
      const doc = readSheetFile(file)
      void pushSheetToFirestore(doc, {
        ownerId: uid,
        serviceAccountPath: sa,
        sheetId,
      })
        .then((r) => {
          console.log(
            r.created
              ? `Created Firestore sheet ${r.sheetId}`
              : `Updated Firestore sheet ${r.sheetId}`,
          )
          console.log(
            'Open Studio → My Sheets, or use Import JSON for local files.',
          )
        })
        .catch((e) => {
          console.error('Push failed:', e)
          process.exit(1)
        })
      return
    }

    if (cmd === 'pull') {
      const sheetId = requireArg(args, '--sheet-id', 'Firestore sheet id')
      const sa = requireArg(args, '--sa', 'service account JSON path')
      const out = argValue(args, '-o') ?? argValue(args, '--out')
      if (!out) {
        console.error('Missing -o / --out path')
        process.exit(1)
      }
      void pullSheetFromFirestore({
        sheetId,
        serviceAccountPath: sa,
      })
        .then((doc) => {
          writeSheetFile(out, doc)
          console.log(`Pulled ${out}`)
          console.log(summarizeSheet(doc))
        })
        .catch((e) => {
          console.error('Pull failed:', e)
          process.exit(1)
        })
      return
    }

    console.error(`Unknown command: ${cmd}`)
    printHelp()
    process.exit(1)
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}

void run()
