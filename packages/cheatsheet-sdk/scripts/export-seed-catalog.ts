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
  term: i.term,
  body: i.body,
  listItems: i.listItems,
  listOrdered: i.listOrdered,
  calloutVariant: i.calloutVariant,
  code: i.code,
  codeLanguage: i.codeLanguage,
  symbol: i.symbol,
  value: i.value,
  unit: i.unit,
  identities: i.identities,
  matrixRows: i.matrixRows,
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

const typeCounts: Record<string, number> = {}
for (const i of items) {
  typeCounts[i.type] = (typeCounts[i.type] ?? 0) + 1
}

mkdirSync(outDir, { recursive: true })
writeFileSync(
  outPath,
  JSON.stringify(
    {
      version: 3,
      exportedAt: new Date().toISOString(),
      count: items.length,
      types: typeCounts,
      items,
    },
    null,
    2,
  ) + '\n',
  'utf8',
)
console.log(
  `Wrote ${outPath} (${items.length} items; types: ${JSON.stringify(typeCounts)})`,
)
