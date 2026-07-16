/**
 * Compact + detailed preview for library / enrich proposals.
 */
import type { LibraryItem } from '@/types'
import type { EnrichProposalItem } from '@/lib/catalogTypes'
import { cardKindLabel } from '@/lib/cardKinds'
import { LatexView } from '@/components/math/LatexView'

export type PreviewableCard = EnrichProposalItem | LibraryItem

function snippet(p: PreviewableCard): string {
  if (p.latex) return p.latex.slice(0, 120)
  if (p.tableMarkdown) return p.tableMarkdown.split('\n')[0]!.slice(0, 80)
  if (p.term && p.body) return `${p.term}: ${p.body.slice(0, 80)}`
  if (p.body) return p.body.slice(0, 100)
  if (p.listItems?.length) return p.listItems.slice(0, 3).join(' · ')
  if (p.code) return p.code.split('\n')[0]!.slice(0, 80)
  if (p.symbol) return `${p.symbol} = ${p.value ?? ''}${p.unit ? ` ${p.unit}` : ''}`
  if (p.identities?.length) return p.identities[0]!.slice(0, 80)
  if (p.matrixRows?.length)
    return p.matrixRows.map((r) => r.join(' ')).join(' | ').slice(0, 80)
  return p.description ?? ''
}

export function CatalogCardPreviewBody({
  card,
  dense = false,
}: {
  card: PreviewableCard
  dense?: boolean
}) {
  const textCls = dense
    ? 'text-[10px] leading-snug text-zinc-400'
    : 'text-xs leading-relaxed text-zinc-300'

  if (card.latex) {
    return (
      <div className={dense ? 'max-h-16 overflow-hidden' : 'max-h-48 overflow-auto'}>
        <LatexView
          latex={card.latex}
          displayMode
          className="text-zinc-100 [&_.katex]:text-[0.95em]"
        />
      </div>
    )
  }
  if (card.tableMarkdown) {
    return (
      <pre
        className={`${textCls} whitespace-pre-wrap font-mono text-zinc-400`}
      >
        {dense ? card.tableMarkdown.slice(0, 200) : card.tableMarkdown}
      </pre>
    )
  }
  if (card.term || card.body) {
    return (
      <div className={textCls}>
        {card.term ? (
          <p className="font-medium text-zinc-200">{card.term}</p>
        ) : null}
        {card.body ? <p className="mt-0.5 whitespace-pre-wrap">{card.body}</p> : null}
      </div>
    )
  }
  if (card.listItems?.length) {
    return (
      <ul className={`${textCls} list-disc space-y-0.5 pl-4`}>
        {(dense ? card.listItems.slice(0, 4) : card.listItems).map((li, i) => (
          <li key={i}>{li}</li>
        ))}
      </ul>
    )
  }
  if (card.code) {
    return (
      <pre className="overflow-auto rounded bg-zinc-950/80 p-2 font-mono text-[10px] text-emerald-200/90">
        {dense ? card.code.slice(0, 240) : card.code}
      </pre>
    )
  }
  if (card.symbol) {
    return (
      <p className={textCls}>
        <span className="font-semibold text-zinc-100">{card.symbol}</span>
        {card.value != null ? (
          <span>
            {' '}
            = {card.value}
            {card.unit ? ` ${card.unit}` : ''}
          </span>
        ) : null}
      </p>
    )
  }
  if (card.identities?.length) {
    return (
      <div className="space-y-1">
        {(dense ? card.identities.slice(0, 2) : card.identities).map((id, i) => (
          <LatexView key={i} latex={id} displayMode className="text-zinc-100" />
        ))}
      </div>
    )
  }
  if (card.matrixRows?.length) {
    return (
      <pre className="font-mono text-[10px] text-zinc-400">
        {card.matrixRows.map((r) => r.join('\t')).join('\n')}
      </pre>
    )
  }
  return (
    <p className={textCls}>
      {snippet(card) || <span className="italic text-zinc-600">No body</span>}
    </p>
  )
}

export function CatalogCardMetaChips({ card }: { card: PreviewableCard }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-violet-200">
        {cardKindLabel(card.type)}
      </span>
      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] capitalize text-zinc-400">
        {card.subject}
      </span>
      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-500">
        {card.topic}
      </span>
    </div>
  )
}

export function CatalogCardListSnippet({ card }: { card: PreviewableCard }) {
  const s = snippet(card)
  return s ? (
    <p className="mt-0.5 line-clamp-2 font-mono text-[9px] text-zinc-600">{s}</p>
  ) : null
}
