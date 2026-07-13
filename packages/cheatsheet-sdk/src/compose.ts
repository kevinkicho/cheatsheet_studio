import { createSheet, SheetBuilder } from './builder'
import { searchCatalog } from './catalog'
import type { SheetOutline } from './outline'
import type { SheetDocument } from './types'

/**
 * Compose a portable sheet from a high-level outline (agent-friendly).
 * Supports `catalog` / `blocks` that resolve Studio seed + process items.
 */
export async function composeFromOutline(
  outline: SheetOutline,
): Promise<SheetDocument> {
  const builder = createSheet({
    title: outline.title,
    canvas: {
      printSizeId: outline.printSizeId ?? 'letter',
      orientation: outline.orientation ?? 'portrait',
    },
    meta: {
      createdBy: 'agent-outline',
      source: 'composeFromOutline',
      notes: outline.notes,
    },
  })

  for (const block of outline.blocks) {
    await applyBlock(builder, block)
  }

  if (outline.autoLayout !== false) {
    builder.autoLayout()
  }

  return builder.build()
}

/**
 * Append outline blocks onto an existing sheet (agent “add more content”).
 * Re-runs auto-layout on the full document when outline.autoLayout !== false.
 */
export async function appendOutlineToSheet(
  sheet: SheetDocument,
  outline: Pick<SheetOutline, 'blocks' | 'autoLayout' | 'notes'>,
): Promise<SheetDocument> {
  const builder = SheetBuilder.fromDocument(sheet)
  if (outline.notes) {
    builder.setMeta({
      notes: [sheet.meta?.notes, outline.notes].filter(Boolean).join(' · '),
    })
  }
  for (const block of outline.blocks) {
    await applyBlock(builder, block)
  }
  if (outline.autoLayout !== false) {
    builder.autoLayout()
  }
  return builder.build()
}

async function applyBlock(
  builder: SheetBuilder,
  block: SheetOutline['blocks'][number],
) {
  switch (block.type) {
    case 'catalog': {
      const ids =
        'ids' in block && Array.isArray(block.ids)
          ? block.ids
          : 'id' in block && block.id
            ? [block.id]
            : []
      for (const id of ids) {
        await builder.addFromCatalog(id)
      }
      return
    }
    case 'blocks': {
      if (block.id) {
        await builder.addFromCatalog(block.id)
      }
      if (block.ids?.length) {
        await builder.addBlocks(block.ids)
      }
      if (!block.id && !block.ids?.length) {
        const limit = Math.min(12, Math.max(1, block.limit ?? 3))
        const hits = await searchCatalog({
          query: block.query,
          type: block.blockType === 'all' ? 'all' : (block.blockType ?? 'all'),
          subject: block.subject,
          processKind: block.processKind,
          limit,
        })
        for (const hit of hits) {
          builder.appendCatalogItem(hit)
        }
      }
      return
    }
    case 'equation':
      builder.addEquation({
        title: block.title ?? 'Equation',
        latex: block.latex,
      })
      return
    case 'table':
      builder.addTable({
        title: block.title ?? 'Table',
        tableMarkdown: block.markdown,
      })
      return
    case 'process':
      builder.addProcess({
        title: block.title,
        mermaidSource: block.mermaid,
        mermaidKind: block.kind === 'mindmap' ? 'mindmap' : 'flowchart',
      })
      return
    case 'figure':
      builder.addFigure({
        title: block.title ?? 'Figure',
        imageUrl: block.imageUrl,
      })
      return
    case 'heading':
      // Banner only: latex carries the section label — do NOT also show card title
      // (that duplicated "1. Time value of money" as title + body).
      builder.addEquation({
        title: block.title,
        latex: block.note
          ? `\\textbf{\\text{${escapeLatexText(block.note)}}}`
          : `\\textbf{\\text{${escapeLatexText(block.title)}}}`,
        height: 28,
        width: 720,
        showTitle: false,
      })
      return
    default:
      return
  }
}

/** Escape free text for use inside \\text{...} headings. */
function escapeLatexText(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[{}]/g, '')
    .replace(/%/g, '\\%')
    .replace(/&/g, '\\&')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/_/g, '\\_')
    .replace(/\^/g, '')
}
