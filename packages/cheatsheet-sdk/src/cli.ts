/**
 * CheatSheet Studio CLI — agent / script entrypoint.
 * Does not start Vite or the React app.
 */
import { readFileSync } from 'node:fs'
import { createSheet, SheetBuilder } from './builder'
import {
  catalogStats,
  findCatalogItem,
  searchCatalog,
  searchBlocks,
} from './catalog'
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
  blocks         List/search Studio blocks (equation|table|figure|process)
  catalog-search Alias of blocks (seed library + process charts)
  add-blocks     Append Studio blocks by id (eq / figure / process…)
  add-catalog    Same as add-blocks
  packs          List packs (--json, --subject mathematics)
  pack           Compose pack → sheet (or --all -o dir/)
  everything     Kitchen-sink sheet: FULL catalog + dense shelf pack (subject/topic folders)
  merge          Merge multiple sheet JSON files into one
  append-outline Append outline blocks onto an existing sheet
  doctor         Health-check SDK (catalog, packs, cloud env)
  add-equation | add-table | add-process | add-figure
  layout         Pack sheet: --pack (dense shelf) or legacy column waterfall
  validate       Check sheet JSON shape
  summarize      Print summary (--verbose lists items)
  export-html    Sheet JSON → print HTML (vector in browser — zoom forever)
  export-svg     Sheet JSON → SVG (vector layout; prefer over PNG for scale)
  export-pdf     Sheet JSON → PDF (Playwright; print-friendly vectors)
  export-png     Sheet JSON → PNG *raster* screenshot (pixels — will pixelate)
  export-jpg     Sheet JSON → JPEG *raster* screenshot
  push / pull    Firestore (CHEATSHEET_SA_PATH + CHEATSHEET_UID)
  mcp            Stdio MCP server for coding agents

Examples:
  npm run cheatsheet -- blocks --type process --kind flowchart
  npm run cheatsheet -- blocks --type equation --query quadratic
  npm run cheatsheet -- add-blocks out/sheet.json --id math-quad --id proc-npv-screen --id fig-unit-circle
  npm run cheatsheet -- pack calc-derivatives -o out/calc.sheet.json
  npm run cheatsheet -- everything -o examples/agent-out/everything.sheet.json
  npm run cheatsheet -- everything --stats
  npm run cheatsheet -- everything --subject finance --limit 40 -o out/fin-stress.sheet.json
  npm run cheatsheet -- export-svg examples/agent-out/everything.sheet.json -o examples/agent-out/everything.svg
  npm run agent:everything:svg
  npm run cheatsheet -- doctor
  npm run cheatsheet -- mcp

Full CLI guide: docs/cli.md

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

    if (cmd === 'blocks' || cmd === 'catalog-search') {
      const query = argValue(args, '--query') ?? (args[1]?.startsWith('-') ? '' : args[1] ?? '')
      const typeRaw = argValue(args, '--type')
      const type =
        typeRaw === 'equation' ||
        typeRaw === 'table' ||
        typeRaw === 'figure' ||
        typeRaw === 'process'
          ? typeRaw
          : 'all'
      const kindRaw = argValue(args, '--kind')
      const processKind =
        kindRaw === 'flowchart' || kindRaw === 'mindmap' ? kindRaw : 'all'
      const subject = argValue(args, '--subject')
      const limit = Number(argValue(args, '--limit') ?? '25')
      const asJson = args.includes('--json')
      if (args.includes('--stats')) {
        const stats = await catalogStats()
        console.log(JSON.stringify(stats, null, 2))
        return
      }
      const hits = await searchBlocks({
        query,
        type,
        processKind,
        subject,
        limit,
      })
      if (asJson) {
        console.log(JSON.stringify(hits, null, 2))
        return
      }
      if (hits.length === 0) {
        console.log('No blocks match. Try --type equation|table|figure|process')
        return
      }
      for (const h of hits) {
        const extra =
          h.type === 'process'
            ? ` · ${h.mermaidKind ?? 'flowchart'}`
            : h.topic
              ? ` · ${h.topic}`
              : ''
        console.log(
          `${h.id.padEnd(26)} ${h.type.padEnd(9)} ${h.title}${extra}`,
        )
      }
      console.log(`(${hits.length} block(s))`)
      return
    }

    if (cmd === 'add-blocks' || cmd === 'add-catalog') {
      const file = args[1]
      if (!file) {
        console.error(
          'Usage: add-blocks <sheet.json> --id <id> [--id <id2> ...]',
        )
        process.exit(1)
      }
      let ids = argValues(args, '--id')
      const titleOnce = argValue(args, '--title')
      if (titleOnce) ids = [...ids, titleOnce]
      if (ids.length === 0) {
        console.error(
          'Pass one or more --id <blockId|title>  (math-quad, proc-npv-screen, fig-unit-circle, …)',
        )
        process.exit(1)
      }
      let builder = SheetBuilder.fromDocument(readSheetFile(file))
      const added: string[] = []
      for (const id of ids) {
        const found = await findCatalogItem(id)
        if (!found) {
          console.error(`Block not found: ${id}`)
          process.exit(1)
        }
        builder = await builder.addFromCatalog(id)
        added.push(`${found.id} [${found.type}] (${found.title})`)
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

    if (cmd === 'everything' || cmd === 'pack-everything') {
      const { composeEverything, everythingCatalogStats } = await import(
        './compose-everything'
      )
      const statsOnly = args.includes('--stats')
      const subjects = argValues(args, '--subject')
      const typesRaw = argValues(args, '--type')
      const types = typesRaw.filter((t): t is 'equation' | 'table' | 'figure' | 'process' =>
        ['equation', 'table', 'figure', 'process'].includes(t),
      )
      const limitRaw = argValue(args, '--limit')
      const limit = limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 0) : undefined
      const noLayout = args.includes('--no-layout')
      const title = argValue(args, '--title')
      const densityRaw = argValue(args, '--density') as
        | 'xs'
        | 'sm'
        | 'md'
        | 'lg'
        | undefined
      const density =
        densityRaw && ['xs', 'sm', 'md', 'lg'].includes(densityRaw)
          ? densityRaw
          : undefined
      const out = argValue(args, '-o') ?? argValue(args, '--out')

      if (statsOnly) {
        const stats = await everythingCatalogStats({
          subjects: subjects.length ? subjects : undefined,
          types: types.length ? types : undefined,
          limit,
        })
        if (args.includes('--json')) {
          console.log(JSON.stringify(stats, null, 2))
        } else {
          console.log(`Catalog match: ${stats.total} items`)
          console.log('By type:', stats.byType)
          console.log('By subject:', stats.bySubject)
        }
        return
      }

      if (!out) {
        console.error(
          'Usage: everything -o <sheet.json> [--subject finance]... [--type equation]... [--limit N]\n' +
            '                    [--no-layout] [--density xs|sm|md|lg] [--title "..."]\n' +
            '       everything --stats [--subject finance] [--json]\n' +
            'Builds a kitchen-sink sheet with every seed + process block (folders by subject/topic).\n' +
            'Default layout: dense shelf pack (side-by-side mosaic), not single-column waterfall.',
        )
        process.exit(1)
      }

      const sheet = await composeEverything({
        title,
        noLayout,
        limit,
        density,
        subjects: subjects.length ? subjects : undefined,
        types: types.length ? types : undefined,
      })
      writeSheetFile(out, sheet)
      console.log(`Everything sheet → ${out}`)
      console.log(summarizeSheet(sheet))
      const vis = sheet.items.filter((i) => !i.hidden)
      const xs = new Set(vis.map((i) => Math.round(i.x / 20)))
      console.log(
        `Pack: ${vis.length} cards, ~${xs.size} column slots, ${sheet.canvas.printPageCount ?? 1} page(s)`,
      )
      console.log(
        '\nDense pack applied (SDK shelf mosaic). For Studio’s exact grid packer: Import → Auto-layout → Export.',
      )
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
          'Usage: layout <sheet.json> [--pack] [--density xs|sm|md|lg] [--columns 1|2|3] [--dense] [--mode columns|single|sections]\n' +
            '  --pack   Dense shelf mosaic (recommended; matches cheatsheet intent)\n' +
            '  default  Legacy column waterfall (layout.ts)',
        )
        process.exit(1)
      }
      const usePack =
        args.includes('--pack') ||
        args.includes('--shelf') ||
        args.includes('--mosaic')
      if (usePack) {
        const { packEverythingSheet } = await import('./compose-everything')
        const densityRaw = argValue(args, '--density') as
          | 'xs'
          | 'sm'
          | 'md'
          | 'lg'
          | undefined
        const density =
          densityRaw && ['xs', 'sm', 'md', 'lg'].includes(densityRaw)
            ? densityRaw
            : 'sm'
        const next = packEverythingSheet(readSheetFile(file), {
          density,
          fitOnePage: args.includes('--fit-one-page'),
        })
        writeSheetFile(file, next)
        console.log('Packed (shelf mosaic)', summarizeSheet(next))
        return
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
      console.log('Laid out (column waterfall)', summarizeSheet(next))
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
          'Usage: export-pdf <sheet.json> -o <out.pdf> [--keep-html] [--light] [--plain]\n' +
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
        rich: !args.includes('--plain'),
      })
      console.log(`PDF → ${result.pdfPath} (${result.engine})`)
      return
    }

    if (cmd === 'export-svg') {
      const file = args[1]
      if (!file) {
        console.error(
          'Usage: export-svg <sheet.json> -o <out.svg> [--keep-html] [--light] [--plain]\n' +
            'Vector export (zoom forever in a browser). Prefer over PNG for scalability.\n' +
            'Requires: npx playwright install chromium',
        )
        process.exit(1)
      }
      const out = argValue(args, '-o') ?? argValue(args, '--out')
      if (!out) {
        console.error('Missing -o / --out path')
        process.exit(1)
      }
      const { exportSheetSvg } = await import('./export-print')
      const sheet = readSheetFile(file)
      const result = await exportSheetSvg(sheet, out, {
        dark: !args.includes('--light'),
        keepHtml: args.includes('--keep-html'),
        rich: !args.includes('--plain'),
      })
      console.log(
        `SVG → ${result.svgPath} (${result.width}×${result.height} viewBox)`,
      )
      if (result.htmlPath) {
        console.log(
          `Vector HTML → ${result.htmlPath}  (open this in Chrome if .svg is blank)`,
        )
      }
      return
    }

    if (cmd === 'export-png' || cmd === 'export-jpg' || cmd === 'export-jpeg') {
      const file = args[1]
      const isJpg = cmd === 'export-jpg' || cmd === 'export-jpeg'
      if (!file) {
        console.error(
          `Usage: ${cmd} <sheet.json> -o <out.${isJpg ? 'jpg' : 'png'}> [--keep-html] [--light] [--plain] [--scale 1|2|3]\n` +
            'NOTE: PNG/JPG are *raster* (pixels). For infinite scale use export-svg or export-html.\n' +
            'Requires: npx playwright install chromium\n' +
            '  --scale 2 (default) ≈ retina; --scale 3 for denser pixels only',
        )
        process.exit(1)
      }
      const out = argValue(args, '-o') ?? argValue(args, '--out')
      if (!out) {
        console.error('Missing -o / --out path')
        process.exit(1)
      }
      const scaleRaw = argValue(args, '--scale')
      const scaleN = scaleRaw ? Number(scaleRaw) : 2
      const scale =
        scaleN === 1 || scaleN === 2 || scaleN === 3 ? scaleN : 2
      const { exportSheetPng, exportSheetJpeg } = await import('./export-print')
      const sheet = readSheetFile(file)
      const common = {
        dark: !args.includes('--light'),
        keepHtml: args.includes('--keep-html'),
        rich: !args.includes('--plain'),
        scale: scale as 1 | 2 | 3,
      }
      const result = isJpg
        ? await exportSheetJpeg(sheet, out, common)
        : await exportSheetPng(sheet, out, common)
      console.log(
        `${result.format.toUpperCase()} → ${result.imagePath} (${result.engine}, raster — not vector)`,
      )
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
