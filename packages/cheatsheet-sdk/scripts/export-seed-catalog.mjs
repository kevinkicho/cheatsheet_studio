/**
 * Export monorepo SEED_LIBRARY → data/seed-catalog.json for published npm package.
 * Run from monorepo root: node packages/cheatsheet-sdk/scripts/export-seed-catalog.mjs
 * (or via npm run sdk:export-catalog after tsx loads the TS module)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const seedPath = path.join(root, 'src/data/seedLibrary.ts')
const outDir = path.join(here, '../data')
const outPath = path.join(outDir, 'seed-catalog.json')

const mod = await import(pathToFileURL(seedPath).href)
const list = (mod.SEED_LIBRARY ?? []).map((i) => ({
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
      count: list.length,
      items: list,
    },
    null,
    2,
  ) + '\n',
  'utf8',
)
console.log(`Wrote ${outPath} (${list.length} items)`)
