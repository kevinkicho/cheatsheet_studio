/**
 * CheatSheet Studio CLI — agent / script entrypoint.
 * Does not start Vite or the React app.
 */
import { readFileSync } from 'node:fs'
import { createSheet, SheetBuilder } from './builder'
import { findCatalogItem, searchCatalog } from './catalog'
import { appendOutlineToSheet, composeFromOutline } from './compose'
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
  packs          List packs (--json, --subject mathematics)
  pack           Compose pack → sheet (or --all -o dir/)
  merge          Merge multiple sheet JSON files into one
  append-outline Append outline blocks onto an existing sheet
  add-catalog    Append one or more seed items (--id a --id b)
  doctor         Health-check SDK (catalog, packs, cloud env)
  add-equation | add-table | add-process | add-figure
  layout         Auto-pack items (multi-column when tall)
  validate       Check sheet JSON shape
  summarize      Print summary (--verbose lists items)
  export-html    Sheet JSON → print HTML
  export-pdf     Sheet JSON → PDF (Playwright Chromium)
  push / pull    Firestore (CHEATSHEET_SA_PATH + CHEATSHEET_UID)
  mcp            Stdio MCP server for coding agents

Examples:
  npm run cheatsheet -- pack calc-derivatives -o out/calc.sheet.json
  npm run cheatsheet -- export-pdf out/calc.sheet.json -o out/calc.pdf
  npm run cheatsheet -- export-html out/calc.sheet.json -o out/calc.html
  npm run cheatsheet -- doctor
  npm run cheatsheet -- mcp

Web: Import/Export JSON · Ctrl+Shift+E / Ctrl+Shift+I

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

/** Collect all values after repeated flags: --id a --id b */
function argValues(args: string[], name: string): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1]) {
      out.push(args[i + 1]!)
      i++
    }
  }
  return out
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
          'Usage: add-catalog <sheet.json> --id <id> [--id <id2> ...]',
        )
        process.exit(1)
      }
      let ids = argValues(args, '--id')
      const titleOnce = argValue(args, '--title')
      if (titleOnce) ids = [...ids, titleOnce]
      if (ids.length === 0) {
        console.error('Pass one or more --id <catalogId|title>')
        process.exit(1)
      }
      let builder = SheetBuilder.fromDocument(readSheetFile(file))
      const added: string[] = []
      for (const id of ids) {
        const found = await findCatalogItem(id)
        if (!found) {
          console.error(`Not found in seed catalog: ${id}`)
          process.exit(1)
        }
        builder = await builder.addFromCatalog(id)
        added.push(`${found.id} (${found.title})`)
      }
      const next = builder.autoLayout().build()
      writeSheetFile(file, next)
      console.log(`Added: ${added.join(', ')}`)
      console.log(summarizeSheet(next))
      return
    }

    if (cmd === 'merge') {
      // merge a.json b.json c.json -o out.json
      const files = args.slice(1).filter((a) => !a.startsWith('-') && a !== argValue(args, '-o') && a !== argValue(args, '--out'))
      const out = argValue(args, '-o') ?? argValue(args, '--out')
      if (files.length < 2 || !out) {
        console.error(
          'Usage: merge <sheet1.json> <sheet2.json> [...] -o <combined.sheet.json>',
        )
        process.exit(1)
      }
      const { mergeSheets } = await import('./merge')
      const sheets = files.map((f) => readSheetFile(f))
      const title = argValue(args, '--title')
      const merged = mergeSheets(sheets, { title })
      writeSheetFile(out, merged)
      console.log(`Merged ${files.length} sheets → ${out}`)
      console.log(summarizeSheet(merged))
      return
    }

    if (cmd === 'packs') {
      const { listTopicPacks } = await import('./topic-packs')
      const subject = argValue(args, '--subject')
      const packs = listTopicPacks({ subject })
      if (args.includes('--json')) {
        console.log(JSON.stringify({ packs, subject: subject ?? null }, null, 2))
        return
      }
      if (packs.length === 0) {
        console.log(
          subject
            ? `No packs for subject "${subject}"`
            : 'No topic packs found',
        )
        return
      }
      for (const p of packs) {
        const sub = p.subjects?.length ? ` [${p.subjects.join(', ')}]` : ''
        console.log(
          `${p.id.padEnd(24)} ${p.title}${sub}${
            p.description ? `\n  ${p.description}` : ''
          }`,
        )
      }
      console.log(
        `\nCompose: npm run cheatsheet -- pack <id> -o out.sheet.json`,
      )
      return
    }

    if (cmd === 'pack') {
      const all = args.includes('--all')
      const out = argValue(args, '-o') ?? argValue(args, '--out')
      if (!out) {
        console.error(
          all
            ? 'Usage: pack --all -o <outputDir/>'
            : 'Usage: pack <packId> -o <sheet.json>',
        )
        process.exit(1)
      }
      const { composeTopicPack, loadTopicPack, listTopicPacks } =
        await import('./topic-packs')
      const { mkdirSync } = await import('node:fs')
      const path = await import('node:path')

      if (all) {
        mkdirSync(out, { recursive: true })
        const packs = listTopicPacks()
        for (const p of packs) {
          const sheet = await composeTopicPack(p.id)
          const file = path.join(out, `${p.id}.sheet.json`)
          writeSheetFile(file, sheet)
          console.log(`  ${p.id} → ${file}`)
        }
        console.log(`Wrote ${packs.length} packs to ${out}`)
        return
      }

      const id = args[1]
      if (!id || id.startsWith('-')) {
        console.error('Usage: pack <packId> -o <sheet.json>')
        process.exit(1)
      }
      const meta = loadTopicPack(id)
      const sheet = await composeTopicPack(id)
      writeSheetFile(out, sheet)
      console.log(`Pack ${meta.id} → ${out}`)
      console.log(summarizeSheet(sheet))
      return
    }

    if (cmd === 'doctor') {
      const { runDoctor } = await import('./doctor')
      const report = await runDoctor()
      if (args.includes('--json')) {
        console.log(JSON.stringify(report, null, 2))
        process.exit(report.ok ? 0 : 1)
      }
      for (const c of report.checks) {
        console.log(`${c.ok ? '✓' : '✗'} ${c.name.padEnd(18)} ${c.detail}`)
      }
      console.log(report.ok ? '\nSDK OK' : '\nSDK has issues')
      process.exit(report.ok ? 0 : 1)
    }

    if (cmd === 'append-outline') {
      const sheetPath = args[1]
      const outlinePath = args[2]
      if (!sheetPath || !outlinePath) {
        console.error(
          'Usage: append-outline <sheet.json> <outline.json>\n' +
            'Adds outline.blocks to the existing sheet and re-layouts.',
        )
        process.exit(1)
      }
      const sheet = readSheetFile(sheetPath)
      const raw = JSON.parse(readFileSync(outlinePath, 'utf8')) as SheetOutline
      if (!Array.isArray(raw.blocks)) {
        console.error('outline.json must have a blocks array')
        process.exit(1)
      }
      const next = await appendOutlineToSheet(sheet, {
        blocks: raw.blocks,
        autoLayout: raw.autoLayout,
        notes: raw.notes,
      })
      writeSheetFile(sheetPath, next)
      console.log('Appended outline ·', summarizeSheet(next))
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
        console.error('Usage: summarize <sheet.json> [--verbose]')
        process.exit(1)
      }
      const sheet = readSheetFile(file)
      console.log(summarizeSheet(sheet))
      if (args.includes('--verbose') || args.includes('-v')) {
        for (const it of sheet.items) {
          const extra =
            it.latex?.slice(0, 40) ||
            it.tableMarkdown?.split('\n')[0] ||
            it.mermaidSource?.split('\n')[0] ||
            it.imageUrl?.slice(0, 40) ||
            ''
          console.log(
            `  [${it.zIndex}] ${it.type.padEnd(14)} ${(it.title ?? '').padEnd(24)} ${extra}`,
          )
        }
      }
      return
    }

    if (cmd === 'layout') {
      const file = args[1]
      if (!file) {
        console.error(
          'Usage: layout <sheet.json> [--columns 1|2|3] [--dense] [--mode columns|single|sections]',
        )
        process.exit(1)
      }
      const colsRaw = argValue(args, '--columns')
      const columns = colsRaw ? Number(colsRaw) : undefined
      const modeRaw = argValue(args, '--mode') as
        | 'columns'
        | 'single'
        | 'sections'
        | undefined
      const dense = args.includes('--dense')
      const next = SheetBuilder.fromDocument(readSheetFile(file))
        .autoLayout({
          ...(columns && Number.isFinite(columns)
            ? { columns, mode: 'columns' as const }
            : {}),
          ...(modeRaw ? { mode: modeRaw } : {}),
          ...(dense ? { dense: true } : {}),
        })
        .build()
      writeSheetFile(file, next)
      console.log('Laid out', summarizeSheet(next))
      return
    }

    if (cmd === 'export-html') {
      const file = args[1]
      if (!file) {
        console.error('Usage: export-html <sheet.json> -o <out.html> [--light]')
        process.exit(1)
      }
      const out = argValue(args, '-o') ?? argValue(args, '--out')
      if (!out) {
        console.error('Missing -o / --out path')
        process.exit(1)
      }
      const { writeSheetHtml } = await import('./export-print')
      const sheet = readSheetFile(file)
      const abs = writeSheetHtml(sheet, out, {
        dark: !args.includes('--light'),
      })
      console.log(`HTML → ${abs}`)
      return
    }

    if (cmd === 'export-pdf') {
      const file = args[1]
      if (!file) {
        console.error(
          'Usage: export-pdf <sheet.json> -o <out.pdf> [--keep-html] [--light]\n' +
            'Requires: npx playwright install chromium',
        )
        process.exit(1)
      }
      const out = argValue(args, '-o') ?? argValue(args, '--out')
      if (!out) {
        console.error('Missing -o / --out path')
        process.exit(1)
      }
      const { exportSheetPdf } = await import('./export-print')
      const sheet = readSheetFile(file)
      const result = await exportSheetPdf(sheet, out, {
        dark: !args.includes('--light'),
        keepHtml: args.includes('--keep-html'),
      })
      console.log(`PDF → ${result.pdfPath} (${result.engine})`)
      if (result.htmlPath) console.log(`HTML kept → ${result.htmlPath}`)
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
          'Usage: push <sheet.json> [--uid UID] [--sa sa.json] [--sheet-id id]\n' +
            'Auth env: CHEATSHEET_SA_PATH, CHEATSHEET_UID, CHEATSHEET_PROJECT_ID',
        )
        process.exit(1)
      }
      const { resolveCloudAuth, requireOwnerUid } = await import('./auth')
      const auth = resolveCloudAuth({
        sa: argValue(args, '--sa'),
        uid: argValue(args, '--uid'),
        sheetId: argValue(args, '--sheet-id'),
        projectId: argValue(args, '--project'),
      })
      const uid = requireOwnerUid(auth)
      const doc = readSheetFile(file)
      void pushSheetToFirestore(doc, {
        ownerId: uid,
        serviceAccountPath: auth.serviceAccountPath,
        sheetId: auth.defaultSheetId,
        projectId: auth.projectId,
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
      const { resolveCloudAuth } = await import('./auth')
      const auth = resolveCloudAuth({
        sa: argValue(args, '--sa'),
        sheetId: argValue(args, '--sheet-id'),
        projectId: argValue(args, '--project'),
      })
      const sheetId = auth.defaultSheetId
      if (!sheetId) {
        console.error(
          'Missing sheet id. Pass --sheet-id or set CHEATSHEET_SHEET_ID',
        )
        process.exit(1)
      }
      const out = argValue(args, '-o') ?? argValue(args, '--out')
      if (!out) {
        console.error('Missing -o / --out path')
        process.exit(1)
      }
      void pullSheetFromFirestore({
        sheetId,
        serviceAccountPath: auth.serviceAccountPath,
        projectId: auth.projectId,
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
