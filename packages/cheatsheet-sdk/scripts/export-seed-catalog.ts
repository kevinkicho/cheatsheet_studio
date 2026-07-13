/**
 * Export monorepo SEED_LIBRARY + process blocks → data/seed-catalog.json
 * Run: npx tsx packages/cheatsheet-sdk/scripts/export-seed-catalog.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEED_LIBRARY } from '../../../src/data/seedLibrary.ts'
import { PROCESS_BLOCKS } from '../src/process-blocks.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, '../data')
const outPath = path.join(outDir, 'seed-catalog.json')

const seedItems = SEED_LIBRARY.map((i) => ({
  id: i.id,
  type: i.type,
  title: i.title,
  subject: i.subject,
  topic: i.topic,
  tags: i.tags,
  latex: i.latex,
  tableMarkdown: i.tableMarkdown,
  imageUrl: i.imageUrl,
  description: i.description,
}))

const processItems = PROCESS_BLOCKS.map((b) => ({
  id: b.id,
  type: 'process' as const,
  title: b.title,
  subject: b.subject,
  topic: b.topic,
  tags: b.tags,
  description: b.description,
  mermaidSource: b.mermaidSource,
  mermaidKind: b.mermaidKind,
  mermaidDirection: b.mermaidDirection,
}))

const byId = new Map<string, (typeof seedItems)[0] | (typeof processItems)[0]>()
for (const s of seedItems) byId.set(s.id, s)
for (const p of processItems) byId.set(p.id, p)
const items = [...byId.values()]

mkdirSync(outDir, { recursive: true })
writeFileSync(
  outPath,
  JSON.stringify(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      count: items.length,
      types: {
        equation: items.filter((i) => i.type === 'equation').length,
        table: items.filter((i) => i.type === 'table').length,
        figure: items.filter((i) => i.type === 'figure').length,
        process: items.filter((i) => i.type === 'process').length,
      },
      items,
    },
    null,
    2,
  ) + '\n',
  'utf8',
)
console.log(
  `Wrote ${outPath} (${items.length} items: eq/table/fig + ${processItems.length} process)`,
)
