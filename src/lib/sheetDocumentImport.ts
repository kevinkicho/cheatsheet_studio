/**
 * Import agent / CLI sheet JSON into the workspace.
 * Self-contained (does not import packages/) so the Vite app stays isolated.
 * Shape matches packages/cheatsheet-sdk SheetDocument v1 + app canvas items.
 */
import type {
  CanvasItem,
  OutlinerFolder,
  SheetCanvas,
} from '@/types'
import { DEFAULT_CANVAS } from '@/types'
import { normalizeCanvasItems } from '@/lib/cardDefaults'

export type ImportedSheetDocument = {
  title: string
  canvas: SheetCanvas
  items: CanvasItem[]
  folders: OutlinerFolder[]
}

export type ImportParseResult =
  | { ok: true; sheet: ImportedSheetDocument }
  | { ok: false; error: string }

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Parse + lightly validate a SheetDocument JSON blob from an agent/CLI.
 */
export function parseSheetDocumentJson(input: unknown): ImportParseResult {
  if (!isObj(input)) {
    return {
      ok: false,
      error:
        'File must be a JSON object (SheetDocument). Use the agent CLI: npm run cheatsheet -- pack …',
    }
  }
  if (typeof input.title !== 'string' || !input.title.trim()) {
    return {
      ok: false,
      error: 'Missing “title” (non-empty string). Agent sheets need a title field.',
    }
  }
  if (!isObj(input.canvas)) {
    return {
      ok: false,
      error:
        'Missing “canvas” object (print size, margins, grid). Re-export from the CLI or Studio.',
    }
  }
  if (!Array.isArray(input.items)) {
    return {
      ok: false,
      error: 'Missing “items” array. Even empty sheets need "items": [].',
    }
  }

  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i]
    if (!isObj(it)) {
      return {
        ok: false,
        error: `Card #${i + 1} is not an object — each items[] entry needs id, type, x, y, width, height.`,
      }
    }
    if (typeof it.id !== 'string' || !it.id) {
      return {
        ok: false,
        error: `Card #${i + 1}: missing “id” (string).`,
      }
    }
    if (typeof it.type !== 'string') {
      return {
        ok: false,
        error: `Card “${it.id}”: missing “type” (equation | table | figure | process-chart | …).`,
      }
    }
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      if (typeof it[k] !== 'number' || !Number.isFinite(it[k])) {
        return {
          ok: false,
          error: `Card “${String(it.id)}”: “${k}” must be a number (layout position/size).`,
        }
      }
    }
  }

  const canvas: SheetCanvas = {
    ...DEFAULT_CANVAS,
    ...(input.canvas as Partial<SheetCanvas>),
  }

  const rawItems = input.items as CanvasItem[]
  const items = normalizeCanvasItems(
    rawItems.map((it, i) => ({
      ...it,
      zIndex: typeof it.zIndex === 'number' ? it.zIndex : i + 1,
    })),
  )

  const folders = Array.isArray(input.folders)
    ? (input.folders as OutlinerFolder[])
    : []

  return {
    ok: true,
    sheet: {
      title: input.title.trim(),
      canvas,
      items,
      folders,
    },
  }
}

export async function readSheetFileFromBrowserFile(
  file: File,
): Promise<ImportParseResult> {
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: `Could not read “${file.name}”.` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      ok: false,
      error: `“${file.name}” is not valid JSON. Check for trailing commas or truncated downloads.`,
    }
  }
  return parseSheetDocumentJson(parsed)
}
