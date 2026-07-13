import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { SheetDocument } from './types'
import { validateSheetDocument } from './validate'

export function readSheetFile(filePath: string): SheetDocument {
  const raw = readFileSync(filePath, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`Invalid JSON in ${filePath}: ${(e as Error).message}`)
  }
  const result = validateSheetDocument(parsed)
  if (!result.ok) {
    const msg = result.issues.map((i) => `${i.path}: ${i.message}`).join('\n')
    throw new Error(`Sheet validation failed for ${filePath}:\n${msg}`)
  }
  return result.sheet
}

export function writeSheetFile(
  filePath: string,
  sheet: SheetDocument,
  opts?: { pretty?: boolean },
): void {
  const dir = path.dirname(filePath)
  mkdirSync(dir, { recursive: true })
  const pretty = opts?.pretty !== false
  writeFileSync(
    filePath,
    JSON.stringify(sheet, null, pretty ? 2 : undefined) + '\n',
    'utf8',
  )
}

export function summarizeSheet(sheet: SheetDocument): string {
  const counts = sheet.items.reduce(
    (acc, it) => {
      acc[it.type] = (acc[it.type] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
  const parts = Object.entries(counts)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ')
  return `"${sheet.title}" · v${sheet.v} · ${sheet.items.length} items (${parts || 'empty'}) · ${sheet.canvas.printSizeId} ${sheet.canvas.orientation}`
}
