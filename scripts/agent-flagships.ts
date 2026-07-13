/**
 * Build all flagship packs (block-rich) and export JSON + HTML + PDF + PNG + JPG.
 *
 *   npm run agent:flagships
 *
 * Requires Playwright Chromium for PDF/PNG/JPG:
 *   npx playwright install chromium
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeTopicPack } from '../packages/cheatsheet-sdk/src/topic-packs.ts'
import { writeSheetFile, summarizeSheet } from '../packages/cheatsheet-sdk/src/io.ts'
import { validateSheetDocument } from '../packages/cheatsheet-sdk/src/validate.ts'
import {
  writeSheetHtml,
  exportSheetPdf,
  exportSheetPng,
  exportSheetJpeg,
} from '../packages/cheatsheet-sdk/src/export-print.ts'

const FLAGSHIPS = [
  'finance-midterm',
  'calc-final',
  'stats-midterm',
  'micro-midterm',
] as const

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'examples', 'agent-out')

async function exportAllFormats(packId: string) {
  const sheet = await composeTopicPack(packId)
  const v = validateSheetDocument(sheet)
  if (!v.ok) {
    throw new Error(
      `Invalid ${packId}: ${v.issues.map((i) => i.message).join('; ')}`,
    )
  }

  const base = path.join(outDir, packId)
  const jsonPath = `${base}.sheet.json`
  writeSheetFile(jsonPath, sheet)
  console.log(`✓ ${packId}`)
  console.log(`  JSON  ${path.relative(root, jsonPath)}`)
  console.log(`  ${summarizeSheet(sheet)}`)

  // Type mix for capability demo
  const types = {
    equation: sheet.items.filter((i) => i.latex).length,
    table: sheet.items.filter((i) => i.tableMarkdown).length,
    process: sheet.items.filter((i) => i.mermaidSource).length,
    figure: sheet.items.filter((i) => i.imageUrl).length,
    fromCatalog: sheet.items.filter((i) => i.libraryItemId).length,
  }
  console.log(
    `  types eq=${types.equation} table=${types.table} process=${types.process} figure=${types.figure} · catalog-linked=${types.fromCatalog}`,
  )

  const htmlPath = writeSheetHtml(sheet, `${base}.html`, { dark: true, rich: true })
  console.log(`  HTML  ${path.relative(root, htmlPath)}`)

  try {
    const pdf = await exportSheetPdf(sheet, `${base}.pdf`, {
      dark: true,
      rich: true,
      keepHtml: false,
    })
    console.log(`  PDF   ${path.relative(root, pdf.pdfPath)}`)
  } catch (e) {
    console.warn(`  PDF   skipped: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
  }

  try {
    const png = await exportSheetPng(sheet, `${base}.png`, {
      dark: true,
      rich: true,
    })
    console.log(`  PNG   ${path.relative(root, png.imagePath)}`)
  } catch (e) {
    console.warn(`  PNG   skipped: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
  }

  try {
    const jpg = await exportSheetJpeg(sheet, `${base}.jpg`, {
      dark: true,
      rich: true,
      quality: 88,
    })
    console.log(`  JPG   ${path.relative(root, jpg.imagePath)}`)
  } catch (e) {
    console.warn(`  JPG   skipped: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  console.log('Flagship packs → JSON + HTML + PDF + PNG + JPG')
  console.log(`Output: ${path.relative(root, outDir)}/\n`)

  for (const id of FLAGSHIPS) {
    await exportAllFormats(id)
    console.log('')
  }

  console.log('Done. Import any *.sheet.json in Studio, or open PNG/JPG/PDF for sharing.')
  console.log('Studio Export PDF remains the WYSIWYG path after Import polish.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
