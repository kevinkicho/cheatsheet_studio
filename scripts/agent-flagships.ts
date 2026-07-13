/**
 * Flagship cheatsheet pipeline — packs Studio blocks, dense auto-layout,
 * optional Ollama AI layout, multi-format export.
 *
 * Interactive (default):
 *   npm run agent:flagships
 *
 * Non-interactive — do everything (former default):
 *   npm run agent:flagships -- --yes
 *   npm run agent:flagships -- -y
 *   npm run agent:flagships -- --all
 *
 * Options:
 *   --yes / -y / --all     Skip prompts; all packs + all formats
 *   --packs a,b,c          Pack ids (default: all flagships)
 *   --formats json,html,pdf,png,jpg
 *   --density xs|sm|md|lg  Auto-layout density (default: sm)
 *   --columns 1|2|3|auto   Column count (default: auto)
 *   --gap N                Gap px (default: from density)
 *   --ai                   Use Ollama for layout knobs (needs OLLAMA_API_KEY)
 *   --no-ai                Disable AI even if key present
 *   --json-only            Shortcut: formats=json
 *   --help
 *
 * Playwright Chromium required for PDF/PNG/JPG:
 *   npx playwright install chromium
 */
import { createInterface } from 'node:readline'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeTopicPack } from '../packages/cheatsheet-sdk/src/topic-packs.ts'
import {
  writeSheetFile,
  summarizeSheet,
} from '../packages/cheatsheet-sdk/src/io.ts'
import { validateSheetDocument } from '../packages/cheatsheet-sdk/src/validate.ts'
import type { SheetDocument } from '../packages/cheatsheet-sdk/src/types.ts'
import {
  writeSheetHtml,
  exportSheetPdf,
  exportSheetPng,
  exportSheetJpeg,
  exportSheetSvg,
} from '../packages/cheatsheet-sdk/src/export-print.ts'
import {
  packSheetDocument,
  type PackDensity,
} from '../packages/cheatsheet-sdk/src/cheatsheet-pack.ts'

const FLAGSHIPS = [
  {
    id: 'finance-midterm',
    title: 'Finance Midterm',
    blurb: 'TVM · NPV · CAPM · mind map · cash-flow figure',
  },
  {
    id: 'calc-final',
    title: 'Calculus Final',
    blurb: 'Derivatives · integrals · process flows · parabola',
  },
  {
    id: 'stats-midterm',
    title: 'Statistics Midterm',
    blurb: 'Bayes · CI · hypothesis flowchart',
  },
  {
    id: 'micro-midterm',
    title: 'Microeconomics Midterm',
    blurb: 'S&D · elasticity · mind map · PPF',
  },
] as const

type PackId = (typeof FLAGSHIPS)[number]['id']
type Format = 'json' | 'html' | 'svg' | 'pdf' | 'png' | 'jpg'
type Density = PackDensity

/** Prefer vector formats first; PNG/JPG are optional raster previews. */
const ALL_FORMATS: Format[] = ['json', 'html', 'svg', 'pdf', 'png', 'jpg']

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'examples', 'agent-out')

type RunConfig = {
  packs: PackId[]
  formats: Format[]
  density: Density
  columns: number | 'auto'
  gap?: number
  ai: boolean
  yes: boolean
}

function loadDotEnv(): void {
  const p = path.join(root, '.env')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

function parseArgs(argv: string[]): Partial<RunConfig> & { help?: boolean } {
  const out: Partial<RunConfig> & { help?: boolean } = {}
  const has = (f: string) => argv.includes(f)
  if (has('--help') || has('-h')) out.help = true
  if (has('--yes') || has('-y') || has('--all')) out.yes = true
  if (has('--ai')) out.ai = true
  if (has('--no-ai')) out.ai = false
  if (has('--json-only')) out.formats = ['json']

  const take = (name: string) => {
    const i = argv.indexOf(name)
    if (i === -1) return undefined
    return argv[i + 1]
  }
  const packsRaw = take('--packs')
  if (packsRaw) {
    out.packs = packsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean) as PackId[]
  }
  const formatsRaw = take('--formats')
  if (formatsRaw) {
    out.formats = formatsRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((f): f is Format =>
        (ALL_FORMATS as string[]).includes(f),
      )
  }
  const dens = take('--density') as Density | undefined
  if (dens === 'xs' || dens === 'sm' || dens === 'md' || dens === 'lg') {
    out.density = dens
  }
  const cols = take('--columns')
  if (cols === 'auto') out.columns = 'auto'
  else if (cols && Number.isFinite(Number(cols))) {
    out.columns = Math.min(3, Math.max(1, Number(cols)))
  }
  const gap = take('--gap')
  if (gap && Number.isFinite(Number(gap))) out.gap = Number(gap)
  return out
}

function printHelp() {
  console.log(`
Flagship cheatsheet builder

  npm run agent:flagships                 Interactive menus
  npm run agent:flagships -- --yes        Non-interactive: all packs + all formats
  npm run agent:flagships -- -y --ai      Full run + Ollama layout assist

  --packs finance-midterm,calc-final
  --formats json,html,svg,pdf,png,jpg
  --density xs|sm|md|lg
  --columns 1|2|3|auto
  --gap 8
  --ai / --no-ai
  --json-only

Formats:
  json/html/svg/pdf  — keep type sharp when zoomed (vector-friendly)
  png/jpg            — fixed pixels; will look soft if you scale past their size
`.trim())
}

function createRl() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

function ask(rl: ReturnType<typeof createRl>, q: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(q, (ans) => resolve((ans ?? '').trim()))
  })
}

async function confirm(
  rl: ReturnType<typeof createRl>,
  q: string,
  defaultYes = false,
): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N'
  const a = (await ask(rl, `${q} [${hint}] `)).toLowerCase()
  if (!a) return defaultYes
  return a === 'y' || a === 'yes'
}

async function pickMulti<T extends string>(
  rl: ReturnType<typeof createRl>,
  title: string,
  options: { id: T; label: string }[],
  defaults: T[],
): Promise<T[]> {
  console.log(`\n${title}`)
  options.forEach((o, i) => {
    const on = defaults.includes(o.id) ? '●' : '○'
    console.log(`  ${i + 1}. ${on}  ${o.label}`)
  })
  console.log(
    '  Enter numbers (e.g. 1,3), "all", or Enter for defaults marked ●',
  )
  const ans = await ask(rl, '> ')
  if (!ans) return [...defaults]
  if (ans.toLowerCase() === 'all' || ans === '*') {
    return options.map((o) => o.id)
  }
  const idxs = ans
    .split(/[,\s]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= options.length)
  if (idxs.length === 0) return [...defaults]
  return [...new Set(idxs.map((i) => options[i - 1]!.id))]
}

async function pickOne<T extends string>(
  rl: ReturnType<typeof createRl>,
  title: string,
  options: { id: T; label: string }[],
  defaultId: T,
): Promise<T> {
  console.log(`\n${title}`)
  options.forEach((o, i) => {
    const mark = o.id === defaultId ? '●' : '○'
    console.log(`  ${i + 1}. ${mark}  ${o.label}`)
  })
  const ans = await ask(rl, `> (Enter = ${defaultId}) `)
  if (!ans) return defaultId
  const n = Number(ans)
  if (Number.isFinite(n) && n >= 1 && n <= options.length) {
    return options[n - 1]!.id
  }
  const byId = options.find((o) => o.id === ans)
  return byId?.id ?? defaultId
}

/**
 * Dense mosaic pack — content-sized blocks, multi-column, fit letter (or minimal).
 * Matches real exam sheets, not a vertical document stack.
 */
function applyAutoLayout(
  sheet: SheetDocument,
  density: Density,
  _columns: number | 'auto',
  gap?: number,
  target: 'letter' | 'minimal' = 'letter',
): SheetDocument {
  return packSheetDocument(sheet, {
    density,
    gap,
    target,
    fitOnePage: true,
  })
}

async function aiRefineLayout(
  sheet: SheetDocument,
  density: Density,
): Promise<{ sheet: SheetDocument; note: string } | null> {
  const key = process.env.OLLAMA_API_KEY?.trim()
  if (!key || key.includes('your_ollama')) return null
  const mode = (process.env.OLLAMA_MODE || 'cloud').toLowerCase()
  const host =
    process.env.OLLAMA_HOST?.trim() ||
    (mode === 'local' ? 'http://127.0.0.1:11434' : 'https://ollama.com')
  const model =
    process.env.VITE_OLLAMA_MODEL?.trim() ||
    process.env.OLLAMA_MODEL?.trim() ||
    'gemma4:31b'

  const summary = sheet.items
    .filter((i) => !i.hidden)
    .map((it) => ({
      id: it.id,
      type: it.type,
      title: (it.title || '').slice(0, 40),
      w: it.width,
      h: it.height,
    }))

  const body = {
    model,
    stream: false,
    format: 'json',
    messages: [
      {
        role: 'system',
        content:
          'You pack exam cheatsheets. Reply JSON only: {"density":"xs|sm|md|lg","gap":number,"columns":1|2|3,"rationale":"short"}',
      },
      {
        role: 'user',
        content: JSON.stringify({
          currentDensity: density,
          cards: summary,
          goal: 'tight readable multi-column print letter page',
        }),
      },
    ],
    options: { temperature: 0.2 },
  }

  try {
    const res = await fetch(`${host.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn(`  AI    skipped (HTTP ${res.status})`)
      return null
    }
    const data = (await res.json()) as { message?: { content?: string } }
    let text = data.message?.content ?? ''
    text = text.replace(/```(?:json)?/gi, '').trim()
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const parsed = JSON.parse(m[0]) as {
      density?: Density
      gap?: number
      columns?: number
      rationale?: string
    }
    const dens =
      parsed.density === 'xs' ||
      parsed.density === 'sm' ||
      parsed.density === 'md' ||
      parsed.density === 'lg'
        ? parsed.density
        : density
    const next = applyAutoLayout(sheet, dens, 'auto', parsed.gap, 'letter')
    return {
      sheet: next,
      note: `AI ${model}: density=${dens}${
        parsed.rationale ? ` — ${parsed.rationale.slice(0, 80)}` : ''
      }`,
    }
  } catch (e) {
    console.warn(
      `  AI    skipped: ${e instanceof Error ? e.message.split('\n')[0] : e}`,
    )
    return null
  }
}

async function buildAndExport(
  packId: PackId,
  formats: Format[],
  layout: {
    density: Density
    columns: number | 'auto'
    gap?: number
    ai: boolean
  },
) {
  console.log(`\n▶ ${packId}`)
  let sheet = await composeTopicPack(packId)
  const v0 = validateSheetDocument(sheet)
  if (!v0.ok) {
    throw new Error(
      `Invalid ${packId}: ${v0.issues.map((i) => i.message).join('; ')}`,
    )
  }

  // Content-sized mosaic pack into letter (or minimal) — real cheatsheet density
  sheet = applyAutoLayout(
    sheet,
    layout.density,
    layout.columns,
    layout.gap,
    'letter',
  )
  const bb = sheet.items.reduce(
    (a, it) => ({
      maxX: Math.max(a.maxX, it.x + it.width),
      maxY: Math.max(a.maxY, it.y + it.height),
    }),
    { maxX: 0, maxY: 0 },
  )
  console.log(
    `  layout mosaic density=${layout.density} gap=${layout.gap ?? 'auto'} · bbox ~${Math.round(bb.maxX)}×${Math.round(bb.maxY)}px`,
  )

  if (layout.ai) {
    const ai = await aiRefineLayout(sheet, layout.density)
    if (ai) {
      sheet = ai.sheet
      console.log(`  ${ai.note}`)
    }
  }

  const v = validateSheetDocument(sheet)
  if (!v.ok) {
    throw new Error(
      `Invalid after layout ${packId}: ${v.issues.map((i) => i.message).join('; ')}`,
    )
  }

  const types = {
    equation: sheet.items.filter((i) => i.latex).length,
    table: sheet.items.filter((i) => i.tableMarkdown).length,
    process: sheet.items.filter((i) => i.mermaidSource).length,
    figure: sheet.items.filter((i) => i.imageUrl).length,
    fromCatalog: sheet.items.filter((i) => i.libraryItemId).length,
  }
  console.log(`  ${summarizeSheet(sheet)}`)
  console.log(
    `  types eq=${types.equation} table=${types.table} process=${types.process} figure=${types.figure} · catalog=${types.fromCatalog}`,
  )

  const base = path.join(outDir, packId)
  const want = new Set(formats)

  if (want.has('json')) {
    const jsonPath = `${base}.sheet.json`
    writeSheetFile(jsonPath, sheet)
    console.log(`  JSON  ${path.relative(root, jsonPath)}`)
  }
  // scale 2 ≈ ~192 DPI letter (~1600+ px wide) — 1 was only ~900px and looked soft
  const exportOpts = {
    dark: true as const,
    rich: true as const,
    layout: 'canvas' as const,
    scale: 2 as const,
  }
  if (want.has('html')) {
    const htmlPath = writeSheetHtml(sheet, `${base}.html`, exportOpts)
    console.log(`  HTML  ${path.relative(root, htmlPath)}  (vector in browser)`)
  }
  if (want.has('svg')) {
    try {
      const svg = await exportSheetSvg(sheet, `${base}.svg`, {
        dark: true,
        rich: true,
        layout: 'canvas',
      })
      console.log(
        `  SVG   ${path.relative(root, svg.svgPath)}  (${svg.width}×${svg.height})`,
      )
      if (svg.htmlPath) {
        console.log(
          `  VECT  ${path.relative(root, svg.htmlPath)}  (open in Chrome — file:// safe)`,
        )
      }
    } catch (e) {
      console.warn(
        `  SVG   skipped: ${e instanceof Error ? e.message.split('\n')[0] : e}`,
      )
    }
  }
  if (want.has('pdf')) {
    try {
      const pdf = await exportSheetPdf(sheet, `${base}.pdf`, {
        ...exportOpts,
        keepHtml: false,
      })
      console.log(`  PDF   ${path.relative(root, pdf.pdfPath)}  (print vectors)`)
    } catch (e) {
      console.warn(
        `  PDF   skipped: ${e instanceof Error ? e.message.split('\n')[0] : e}`,
      )
    }
  }
  if (want.has('png')) {
    try {
      const png = await exportSheetPng(sheet, `${base}.png`, exportOpts)
      console.log(
        `  PNG   ${path.relative(root, png.imagePath)}  (raster — not infinite scale)`,
      )
    } catch (e) {
      console.warn(
        `  PNG   skipped: ${e instanceof Error ? e.message.split('\n')[0] : e}`,
      )
    }
  }
  if (want.has('jpg')) {
    try {
      const jpg = await exportSheetJpeg(sheet, `${base}.jpg`, {
        ...exportOpts,
        quality: 92,
      })
      console.log(
        `  JPG   ${path.relative(root, jpg.imagePath)}  (raster — not infinite scale)`,
      )
    } catch (e) {
      console.warn(
        `  JPG   skipped: ${e instanceof Error ? e.message.split('\n')[0] : e}`,
      )
    }
  }
}

async function interactiveConfig(
  rl: ReturnType<typeof createRl>,
  seed?: Partial<RunConfig>,
): Promise<RunConfig> {
  console.log('\n══ Flagship cheatsheet builder ══')
  console.log('Studio blocks · dense auto-layout · optional Ollama · multi-export')
  console.log(`Output folder: ${path.relative(root, outDir)}/`)

  const packs = await pickMulti(
    rl,
    'Which products (packs) to produce?',
    FLAGSHIPS.map((f) => ({
      id: f.id as PackId,
      label: `${f.title}  —  ${f.blurb}`,
    })),
    seed?.packs ?? FLAGSHIPS.map((f) => f.id),
  )

  const formats = await pickMulti(
    rl,
    'Which outputs? (SVG/HTML/PDF scale cleanly; PNG/JPG are pixels)',
    ALL_FORMATS.map((f) => ({
      id: f,
      label:
        f === 'json'
          ? 'JSON (.sheet.json) — Import in Studio'
          : f === 'html'
            ? 'HTML — vector in browser (zoom forever)'
            : f === 'svg'
              ? 'SVG — vector file (prefer over PNG for scale)'
              : f === 'pdf'
                ? 'PDF — print-friendly vectors'
                : f === 'png'
                  ? 'PNG — raster only (will pixelate when zoomed)'
                  : 'JPG — raster only',
    })),
    seed?.formats ?? (['json', 'html', 'svg', 'pdf'] as Format[]),
  )

  const density = await pickOne(
    rl,
    'Auto-layout density (app Auto layout presets)?',
    [
      { id: 'xs' as Density, label: 'Extra small — densest midterm' },
      { id: 'sm' as Density, label: 'Small — tight cheat sheet (recommended)' },
      { id: 'md' as Density, label: 'Medium — balanced' },
      { id: 'lg' as Density, label: 'Large — roomy' },
    ],
    seed?.density ?? 'sm',
  )

  const columns = await pickOne(
    rl,
    'Columns?',
    [
      { id: 'auto' as const, label: 'Auto' },
      { id: '1' as const, label: '1 column' },
      { id: '2' as const, label: '2 columns' },
      { id: '3' as const, label: '3 columns' },
    ],
    seed?.columns === 1
      ? '1'
      : seed?.columns === 2
        ? '2'
        : seed?.columns === 3
          ? '3'
          : 'auto',
  )

  const hasKey = Boolean(
    process.env.OLLAMA_API_KEY &&
      !process.env.OLLAMA_API_KEY.includes('your_ollama'),
  )
  let ai = seed?.ai ?? false
  if (hasKey) {
    ai = await confirm(
      rl,
      'Use Ollama AI to refine layout density/columns? (OLLAMA_API_KEY found)',
      seed?.ai ?? false,
    )
  } else {
    console.log('\n(Ollama AI skipped — no OLLAMA_API_KEY in .env)')
  }

  const colsNum: number | 'auto' =
    columns === 'auto' ? 'auto' : Number(columns)

  console.log('\n── Plan ──')
  console.log(`  Packs:    ${packs.join(', ') || '(none)'}`)
  console.log(`  Formats:  ${formats.join(', ') || '(none)'}`)
  console.log(`  Density:  ${density} · columns=${colsNum} · AI=${ai}`)
  const go = await confirm(rl, 'Produce these now?', true)
  if (!go) {
    console.log('Cancelled.')
    process.exit(0)
  }

  return {
    packs,
    formats,
    density,
    columns: colsNum,
    ai,
    yes: false,
  }
}

async function runBatch(cfg: RunConfig) {
  if (cfg.packs.length === 0) {
    console.log('No packs selected.')
    return
  }
  if (cfg.formats.length === 0) {
    console.log('No formats selected.')
    return
  }
  mkdirSync(outDir, { recursive: true })
  for (const id of cfg.packs) {
    await buildAndExport(id, cfg.formats, {
      density: cfg.density,
      columns: cfg.columns,
      gap: cfg.gap,
      ai: cfg.ai,
    })
  }
  console.log('\n── Batch complete ──')
  console.log(`  Files under ${path.relative(root, outDir)}/`)
  console.log(
    '  Next: Studio → Import JSON → Auto layout polish → Export PDF (WYSIWYG)',
  )
}

async function main() {
  loadDotEnv()
  const argv = process.argv.slice(2)
  const flags = parseArgs(argv)
  if (flags.help) {
    printHelp()
    return
  }

  const nonInteractive = Boolean(flags.yes) || !process.stdin.isTTY

  if (nonInteractive) {
    const cfg: RunConfig = {
      packs: flags.packs?.length
        ? flags.packs
        : FLAGSHIPS.map((f) => f.id),
      formats: flags.formats?.length ? flags.formats : [...ALL_FORMATS],
      density: flags.density ?? 'sm',
      columns: flags.columns ?? 'auto',
      gap: flags.gap,
      ai: flags.ai === true,
      yes: true,
    }
    console.log('Flagships (non-interactive)')
    console.log(
      `  packs=${cfg.packs.join(',')} formats=${cfg.formats.join(',')} density=${cfg.density} ai=${cfg.ai}`,
    )
    await runBatch(cfg)
    return
  }

  const rl = createRl()
  try {
    let seed: Partial<RunConfig> | undefined = {
      packs: flags.packs,
      formats: flags.formats,
      density: flags.density,
      columns: flags.columns,
      gap: flags.gap,
      ai: flags.ai,
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const cfg = await interactiveConfig(rl, seed)
      await runBatch(cfg)
      const again = await confirm(
        rl,
        'Continue? (another batch / change packs or formats)',
        false,
      )
      if (!again) {
        console.log('All done.')
        break
      }
      seed = cfg
    }
  } finally {
    rl.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
