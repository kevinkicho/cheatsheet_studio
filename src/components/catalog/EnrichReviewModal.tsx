/**
 * Full-screen modal to review enrich proposals or recently added catalog cards.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react'
import type { LibraryItem } from '@/types'
import type { EnrichProposalItem } from '@/lib/catalogTypes'
import { proposalToLibraryItem } from '@/lib/catalogEnrich'
import { LibraryItemCard } from '@/components/library/LibraryItemCard'
import {
  CatalogCardMetaChips,
  type PreviewableCard,
} from './CatalogCardPreview'

export type EnrichReviewModalProps = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  cards: PreviewableCard[]
  /** When reviewing proposals: which indices are selected for accept */
  selectedKeys?: Set<string>
  onToggleSelect?: (key: string) => void
  getKey?: (card: PreviewableCard, index: number) => string
  /** Footer actions (Accept & publish, etc.) */
  footer?: ReactNode
  /**
   * When set, shows feedback box + regenerate for the active card (proposals).
   */
  onRegenerate?: (args: {
    key: string
    card: PreviewableCard
    feedback: string
  }) => Promise<void>
  regeneratingKey?: string | null
}

export function EnrichReviewModal({
  open,
  onClose,
  title,
  subtitle,
  cards,
  selectedKeys,
  onToggleSelect,
  getKey = (_c, i) => String(i),
  footer,
  onRegenerate,
  regeneratingKey,
}: EnrichReviewModalProps) {
  const [index, setIndex] = useState(0)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (open) {
      setIndex(0)
      setFeedback('')
    }
  }, [open, cards])

  useEffect(() => {
    setFeedback('')
  }, [index])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight')
        setIndex((i) => Math.min(cards.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, cards.length, onClose])

  if (!open || typeof document === 'undefined') return null

  const card = cards[index]
  const key = card ? getKey(card, index) : ''
  const selected = selectedKeys?.has(key) ?? false

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="enrich-review-title"
      data-testid="enrich-review-modal"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative flex h-[min(720px,calc(100vh-1.5rem))] w-[min(960px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl sm:flex-row">
        {/* List */}
        <div className="flex w-full shrink-0 flex-col border-b border-zinc-800 sm:w-72 sm:border-b-0 sm:border-r">
          <div className="flex h-12 items-center justify-between gap-2 border-b border-zinc-800 px-3">
            <div className="min-w-0">
              <h2
                id="enrich-review-title"
                className="truncate text-sm font-semibold text-zinc-100"
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="truncate text-[10px] text-zinc-500">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {cards.map((c, i) => {
              const k = getKey(c, i)
              const on = selectedKeys?.has(k)
              return (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                      i === index
                        ? 'bg-indigo-500/15 text-indigo-50'
                        : 'text-zinc-300 hover:bg-zinc-900'
                    }`}
                  >
                    {selectedKeys && onToggleSelect ? (
                      <span
                        role="checkbox"
                        aria-checked={on}
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleSelect(k)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault()
                            e.stopPropagation()
                            onToggleSelect(k)
                          }
                        }}
                        className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                          on
                            ? 'border-violet-400 bg-violet-500/40 text-violet-100'
                            : 'border-zinc-600'
                        }`}
                      >
                        {on ? <Check className="h-2.5 w-2.5" /> : null}
                      </span>
                    ) : (
                      <span className="mt-0.5 w-4 shrink-0 text-[10px] tabular-nums text-zinc-600">
                        {i + 1}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {c.title}
                      </span>
                      <span className="text-[9px] text-zinc-500">
                        {c.type}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
            {cards.length === 0 ? (
              <li className="px-2 py-6 text-center text-[11px] text-zinc-600">
                No cards to review
              </li>
            ) : null}
          </ul>
        </div>

        {/* Detail */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {card ? (
            <>
              <div className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-800 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-100">
                    {card.title}
                  </p>
                  <div className="mt-1.5">
                    <CatalogCardMetaChips card={card} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={index <= 0}
                    onClick={() => setIndex((i) => i - 1)}
                    className="rounded-md border border-zinc-800 p-1.5 text-zinc-400 hover:bg-zinc-900 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-[3rem] text-center text-[10px] tabular-nums text-zinc-500">
                    {index + 1}/{cards.length}
                  </span>
                  <button
                    type="button"
                    disabled={index >= cards.length - 1}
                    onClick={() => setIndex((i) => i + 1)}
                    className="rounded-md border border-zinc-800 p-1.5 text-zinc-400 hover:bg-zinc-900 disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Library tile preview
                </p>
                {/* Match bottom-library / full-library card chrome exactly */}
                <div
                  className="mx-auto w-full max-w-[17rem]"
                  data-testid="enrich-library-tile-preview"
                >
                  <LibraryItemCard
                    item={
                      'id' in card && typeof (card as LibraryItem).id === 'string'
                        ? (card as LibraryItem)
                        : proposalToLibraryItem(card as EnrichProposalItem)
                    }
                    compact
                    previewOnly
                    hoverPreviewEnabled={false}
                  />
                </div>
                {card.description ? (
                  <p className="mt-3 text-[11px] leading-snug text-zinc-500">
                    {card.description}
                  </p>
                ) : null}
                {'id' in card && (card as LibraryItem).id ? (
                  <p className="mt-2 text-[10px] text-zinc-600">
                    id: {(card as LibraryItem).id}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 space-y-2 border-t border-zinc-800 px-4 py-2">
                {selectedKeys && onToggleSelect ? (
                  <button
                    type="button"
                    onClick={() => onToggleSelect(key)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] ${
                      selected
                        ? 'border-violet-500/40 bg-violet-500/15 text-violet-100'
                        : 'border-zinc-700 text-zinc-300 hover:bg-zinc-900'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {selected ? 'Selected for accept' : 'Select for accept'}
                  </button>
                ) : null}
                {onRegenerate && card ? (
                  <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2">
                    <p className="mb-1 text-[10px] font-medium text-zinc-400">
                      Feedback &amp; regenerate this card
                    </p>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={2}
                      placeholder="e.g. Follow KaTeX rules — no align env; use \frac; shorter title…"
                      className="field-input w-full resize-y text-[11px]"
                      data-testid="enrich-feedback-input"
                    />
                    <button
                      type="button"
                      disabled={
                        !feedback.trim() || regeneratingKey === key
                      }
                      onClick={() =>
                        void onRegenerate({
                          key,
                          card,
                          feedback: feedback.trim(),
                        })
                      }
                      data-testid="enrich-regenerate"
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-40"
                    >
                      {regeneratingKey === key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Regenerate with feedback
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
              Nothing selected
            </div>
          )}
          {footer ? (
            <div className="shrink-0 border-t border-zinc-800 px-4 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function isLibraryItem(
  c: PreviewableCard,
): c is LibraryItem {
  return 'id' in c && typeof (c as LibraryItem).id === 'string'
}

export type { EnrichProposalItem }
