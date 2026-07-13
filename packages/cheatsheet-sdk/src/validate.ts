import { SHEET_DOC_VERSION, type SheetDocument } from './types'

export type ValidateIssue = { path: string; message: string }

export type ValidateResult =
  | { ok: true; sheet: SheetDocument }
  | { ok: false; issues: ValidateIssue[] }

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Structural validation for agent-produced sheets.
 * Does not render KaTeX/Mermaid — only checks the document shape.
 */
export function validateSheetDocument(input: unknown): ValidateResult {
  const issues: ValidateIssue[] = []
  if (!isObj(input)) {
    return { ok: false, issues: [{ path: '', message: 'Root must be an object' }] }
  }

  if (input.v !== SHEET_DOC_VERSION && input.v !== undefined) {
    issues.push({
      path: 'v',
      message: `Expected v=${SHEET_DOC_VERSION}, got ${String(input.v)}`,
    })
  }

  if (typeof input.title !== 'string' || !input.title.trim()) {
    issues.push({ path: 'title', message: 'title is required (non-empty string)' })
  }

  if (!isObj(input.canvas)) {
    issues.push({ path: 'canvas', message: 'canvas object is required' })
  } else {
    const c = input.canvas
    for (const k of ['width', 'height'] as const) {
      if (typeof c[k] !== 'number' || !Number.isFinite(c[k] as number)) {
        issues.push({ path: `canvas.${k}`, message: 'must be a finite number' })
      }
    }
  }

  if (!Array.isArray(input.items)) {
    issues.push({ path: 'items', message: 'items must be an array' })
  } else {
    input.items.forEach((it, i) => {
      if (!isObj(it)) {
        issues.push({ path: `items[${i}]`, message: 'must be an object' })
        return
      }
      if (typeof it.id !== 'string' || !it.id) {
        issues.push({ path: `items[${i}].id`, message: 'required string' })
      }
      if (typeof it.type !== 'string') {
        issues.push({ path: `items[${i}].type`, message: 'required string' })
      }
      for (const k of ['x', 'y', 'width', 'height', 'zIndex'] as const) {
        if (typeof it[k] !== 'number' || !Number.isFinite(it[k] as number)) {
          issues.push({
            path: `items[${i}].${k}`,
            message: 'must be a finite number',
          })
        }
      }
      const t = it.type
      if (
        (t === 'equation' || t === 'custom-equation') &&
        typeof it.latex !== 'string'
      ) {
        issues.push({
          path: `items[${i}].latex`,
          message: 'equation items need latex string',
        })
      }
      if (t === 'table' && typeof it.tableMarkdown !== 'string') {
        issues.push({
          path: `items[${i}].tableMarkdown`,
          message: 'table items need tableMarkdown string',
        })
      }
      if (
        t === 'process-chart' &&
        typeof it.mermaidSource !== 'string' &&
        !it.processFlow
      ) {
        issues.push({
          path: `items[${i}]`,
          message: 'process-chart needs mermaidSource and/or processFlow',
        })
      }
    })
  }

  if (input.folders !== undefined && !Array.isArray(input.folders)) {
    issues.push({ path: 'folders', message: 'folders must be an array when set' })
  }

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    sheet: {
      v: SHEET_DOC_VERSION,
      title: String(input.title),
      canvas: input.canvas as SheetDocument['canvas'],
      items: input.items as SheetDocument['items'],
      folders: (Array.isArray(input.folders)
        ? input.folders
        : []) as SheetDocument['folders'],
      meta: isObj(input.meta)
        ? (input.meta as SheetDocument['meta'])
        : undefined,
    },
  }
}
