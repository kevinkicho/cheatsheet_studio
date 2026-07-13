/**
 * Export monorepo SEED_LIBRARY → data/seed-catalog.json for the published package.
 * Run: npx tsx packages/cheatsheet-sdk/scripts/export-seed-catalog.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEED_LIBRARY } from '../../../src/data/seedLibrary.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, '../data')
const outPath = path.join(outDir, 'seed-catalog.json')

const items = SEED_LIBRARY.map((i) => ({
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

mkdirSync(outDir, { recursive: true })
writeFileSync(
  outPath,
  JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: items.length,
      items,
    },
    null,
    2,
  ) + '\n',
  'utf8',
)
console.log(`Wrote ${outPath} (${items.length} items)`)
