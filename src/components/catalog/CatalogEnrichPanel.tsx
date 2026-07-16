/**
 * Interactive catalog inventory + Ollama topic enrichment with review modal.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  Database,
  Eye,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useLibraryStore } from '@/stores/libraryStore'
import { useCatalogUiStore } from '@/stores/catalogUiStore'
import {
  enrichTopicWithOllama,
  mergeProposalsIntoLibrary,
  regenerateProposalWithFeedback,
} from '@/lib/catalogEnrich'
import { publishCatalogToRtdb } from '@/lib/catalogRtdb'
import { DEFAULT_OLLAMA_MODEL } from '@/lib/ollamaClient'
import type { LibraryItem, Subject } from '@/types'
import {
  buildTopicInventory,
  thinTopics,
} from '@/lib/catalogInventory'
import type { EnrichProposalItem } from '@/lib/catalogTypes'
import { cardKindLabel } from '@/lib/cardKinds'
import {
  CatalogCardListSnippet,
  CatalogCardMetaChips,
  CatalogCardPreviewBody,
} from './CatalogCardPreview'
import { EnrichReviewModal } from './EnrichReviewModal'
import { NewSubjectModal } from './NewSubjectModal'

type DraftRow = {
  key: string
  proposal: EnrichProposalItem
  selected: boolean
}

const PROMPT_PRESETS = [
  {
    id: 'exam',
    label: 'Exam focus',
    text: 'Prioritize high-yield exam formulas, classic traps, and one worked-style definition or list of steps.',
  },
  {
    id: 'visual',
    label: 'Tables & lists',
    text: 'Prefer tables, ordered lists, and callouts over more equations. Keep LaTeX minimal.',
  },
  {
    id: 'intro',
    label: 'Beginner',
    text: 'Write for first-year students: clear definitions, simple notation, avoid advanced edge cases.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    text: 'Graduate/olympiad depth: edge cases, precise conditions, multi-part identities when appropriate.',
  },
] as const

function proposalKey(p: EnrichProposalItem, i: number) {
  return `${p.title}::${p.type}::${i}`
}

function existingTitlesInTopicLocal(
  items: LibraryItem[],
  subject: Subject,
  topic: string,
): string[] {
  return items
    .filter(
      (i) =>
        i.subject === subject &&
        (i.topic || 'General').toLowerCase() === topic.toLowerCase(),
    )
    .map((i) => i.title)
}

export function CatalogEnrichPanel() {
  const items = useLibraryStore((s) => s.items)
  const source = useLibraryStore((s) => s.source)
  const catalogMeta = useLibraryStore((s) => s.catalogMeta)
  const lastError = useLibraryStore((s) => s.lastError)
  const setItems = useLibraryStore((s) => s.setItems)
  const load = useLibraryStore((s) => s.load)
  const catalogOpenTick = useCatalogUiStore((s) => s.catalogOpenTick)
  const injectedDraft = useCatalogUiStore((s) => s.injectedDraft)
  const consumeInjectedDraft = useCatalogUiStore((s) => s.consumeInjectedDraft)

  const inventory = useMemo(() => buildTopicInventory(items), [items])
  const thin = useMemo(() => thinTopics(items, 4), [items])

  const subjects = useMemo(() => {
    const s = new Set(items.map((i) => i.subject))
    return [...s].sort() as Subject[]
  }, [items])

  const [subject, setSubject] = useState<Subject>('mathematics')
  const [topic, setTopic] = useState('Calculus')
  const [count, setCount] = useState(4)
  const [customPrompt, setCustomPrompt] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [topicFilter, setTopicFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [newSubjectOpen, setNewSubjectOpen] = useState(false)
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null)
  const [status, setStatus] = useState<{
    kind: 'ok' | 'warn' | 'err'
    text: string
  } | null>(null)

  // Review draft (not yet published)
  const [draft, setDraft] = useState<DraftRow[] | null>(null)
  const [draftModel, setDraftModel] = useState<string | null>(null)
  const [draftNote, setDraftNote] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  // Last accepted batch
  const [lastAdded, setLastAdded] = useState<LibraryItem[]>([])
  // Modal for last-added or topic browse (separate from draft review)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseCards, setBrowseCards] = useState<LibraryItem[]>([])
  const [browseTitle, setBrowseTitle] = useState('Catalog preview')

  const topicsForSubject = useMemo(() => {
    const rows = inventory
      .filter((r) => r.subject === subject)
      .sort((a, b) => a.count - b.count || a.topic.localeCompare(b.topic))
    const q = topicFilter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.topic.toLowerCase().includes(q))
  }, [inventory, subject, topicFilter])

  const activeTopic =
    topicsForSubject.some((r) => r.topic === topic)
      ? topic
      : topicsForSubject[0]?.topic ?? 'General'

  useEffect(() => {
    if (topic !== activeTopic) setTopic(activeTopic)
  }, [activeTopic, topic])

  // FAB / external: inject draft proposals into this panel
  useEffect(() => {
    if (!injectedDraft) return
    const d = consumeInjectedDraft()
    if (!d) return
    setSubject(d.subject)
    setTopic(d.topic)
    setDraft(
      d.proposals.map((p, i) => ({
        key: proposalKey(p, i),
        proposal: p,
        selected: true,
      })),
    )
    setDraftModel(d.model ?? null)
    setDraftNote(d.note ?? null)
    setStatus({
      kind: 'ok',
      text: `Loaded ${d.proposals.length} AI proposals for review.`,
    })
    if (d.openReview) setReviewOpen(true)
  }, [injectedDraft, consumeInjectedDraft])

  // Notify parent (PropertiesPanel) via custom event when catalog should open
  useEffect(() => {
    if (catalogOpenTick <= 0) return
    window.dispatchEvent(new CustomEvent('cheatsheet:open-catalog-panel'))
  }, [catalogOpenTick])

  const topicRow = inventory.find(
    (r) => r.subject === subject && r.topic === activeTopic,
  )
  const topicCount = topicRow?.count ?? 0
  const topicCards = useMemo(
    () =>
      items.filter(
        (i) => i.subject === subject && (i.topic || 'General') === activeTopic,
      ),
    [items, subject, activeTopic],
  )

  const maxInSubject = useMemo(() => {
    const counts = topicsForSubject.map((r) => r.count)
    return Math.max(1, ...counts, 1)
  }, [topicsForSubject])

  const selectedDraft = useMemo(
    () => (draft ?? []).filter((d) => d.selected),
    [draft],
  )

  const selectedKeys = useMemo(() => {
    const s = new Set<string>()
    for (const d of draft ?? []) {
      if (d.selected) s.add(d.key)
    }
    return s
  }, [draft])

  const generate = async () => {
    setBusy(true)
    setStatus(null)
    setDraft(null)
    try {
      const result = await enrichTopicWithOllama({
        subject,
        topic: activeTopic,
        items,
        count,
        customUserPrompt: customPrompt,
        model: DEFAULT_OLLAMA_MODEL,
      })
      if (result.proposals.length === 0) {
        setStatus({
          kind: 'warn',
          text: `Model (${result.model}) returned no new cards for ${subject} / ${activeTopic}. Try another prompt or count.`,
        })
        return
      }
      setDraft(
        result.proposals.map((p, i) => ({
          key: proposalKey(p, i),
          proposal: p,
          selected: true,
        })),
      )
      setDraftModel(result.model)
      setDraftNote(result.rawNote ?? null)
      setStatus({
        kind: 'ok',
        text: `Generated ${result.proposals.length} proposals — review, then accept to add & publish.`,
      })
      setReviewOpen(true)
    } catch (e) {
      setStatus({
        kind: 'err',
        text: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBusy(false)
    }
  }

  const acceptSelected = async () => {
    if (!draft?.length) return
    const proposals = draft.filter((d) => d.selected).map((d) => d.proposal)
    if (proposals.length === 0) {
      setStatus({ kind: 'warn', text: 'Select at least one proposal to accept.' })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const { items: merged, added } = mergeProposalsIntoLibrary(
        items,
        proposals,
      )
      await setItems(merged, {
        publishRtdb: true,
        note: draftNote ?? `Enriched ${activeTopic}`,
        model: draftModel ?? DEFAULT_OLLAMA_MODEL,
      })
      setLastAdded(added)
      setDraft(null)
      setReviewOpen(false)
      setStatus({
        kind: 'ok',
        text: `Added ${added.length} cards → ${merged.length} total. Published to RTDB.`,
      })
      setBrowseTitle(`Added just now · ${activeTopic}`)
      setBrowseCards(added)
      setBrowseOpen(true)
    } catch (e) {
      setStatus({
        kind: 'err',
        text: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBusy(false)
    }
  }

  const publishSeed = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const meta = await publishCatalogToRtdb(items, {
        note: 'Manual publish from UI',
        source: source === 'seed' ? 'seed' : 'rtdb',
      })
      setStatus({
        kind: 'ok',
        text: `Published ${meta.itemCount} items to RTDB (v${meta.version}).`,
      })
      await load()
    } catch (e) {
      setStatus({
        kind: 'err',
        text: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBusy(false)
    }
  }

  const toggleKey = (key: string) => {
    setDraft((prev) =>
      prev
        ? prev.map((d) =>
            d.key === key ? { ...d, selected: !d.selected } : d,
          )
        : prev,
    )
  }

  const regenerateOne = async (args: {
    key: string
    card: EnrichProposalItem | LibraryItem
    feedback: string
  }) => {
    const prop = args.card as EnrichProposalItem
    setRegeneratingKey(args.key)
    try {
      const titles = existingTitlesInTopicLocal(items, subject, activeTopic)
      const { proposal, note } = await regenerateProposalWithFeedback({
        proposal: prop,
        feedback: args.feedback,
        existingTitles: titles,
        model: DEFAULT_OLLAMA_MODEL,
      })
      setDraft((prev) =>
        prev
          ? prev.map((d) =>
              d.key === args.key
                ? { ...d, proposal, selected: true }
                : d,
            )
          : prev,
      )
      setStatus({
        kind: 'ok',
        text: note
          ? `Regenerated: ${note}`
          : `Regenerated “${proposal.title}” with your feedback.`,
      })
    } catch (e) {
      setStatus({
        kind: 'err',
        text: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setRegeneratingKey(null)
    }
  }

  return (
    <div className="space-y-3 p-3" data-testid="catalog-enrich-panel">
      {/* Header stats */}
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-zinc-200">
            Catalog &amp; enrich
          </p>
          <p className="text-[10px] leading-snug text-zinc-500">
            <span className="text-zinc-400">{items.length}</span> cards · source{' '}
            <span className="text-zinc-400">{source}</span>
            {catalogMeta?.updatedAt
              ? ` · RTDB ${new Date(catalogMeta.updatedAt).toLocaleString()}`
              : ''}
          </p>
          <p className="mt-0.5 text-[9px] text-zinc-600">
            Model{' '}
            <code className="text-zinc-500">{DEFAULT_OLLAMA_MODEL}</code> via
            proxy
          </p>
        </div>
      </div>

      {/* Subject chips */}
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Subject
        </p>
        <div className="flex flex-wrap gap-1">
          {subjects.map((s) => {
            const n = items.filter((i) => i.subject === s).length
            const active = subject === s
            return (
              <button
                key={s}
                type="button"
                data-testid={`enrich-subject-chip-${s}`}
                onClick={() => setSubject(s)}
                className={`rounded-full border px-2 py-0.5 text-[10px] capitalize transition ${
                  active
                    ? 'border-violet-500/50 bg-violet-500/20 text-violet-100'
                    : 'border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                {s}
                <span className="ml-1 tabular-nums text-zinc-500">{n}</span>
              </button>
            )
          })}
          <button
            type="button"
            data-testid="enrich-subject-new"
            onClick={() => setNewSubjectOpen(true)}
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-violet-500/50 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-200 hover:bg-violet-500/20"
          >
            <Plus className="h-3 w-3" />
            New
          </button>
        </div>
        <p className="mt-1 text-[9px] leading-snug text-zinc-600">
          <strong className="font-medium text-zinc-500">+ New</strong> creates a
          whole subject (e.g. psychology × 6 topics × 12 cards) via AI — then
          review before publish.
        </p>
      </div>

      {/* Topic browser */}
      <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Topics · {subject}
          </p>
          <input
            type="search"
            placeholder="Filter…"
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="field-input w-24 py-0.5 text-[10px]"
          />
        </div>
        {thin.some((t) => t.subject === subject) ? (
          <p className="mb-1.5 text-[9px] text-amber-200/80">
            Amber bar = thin topic (&lt;4 cards) — good enrich targets
          </p>
        ) : null}
        <ul className="max-h-40 space-y-0.5 overflow-y-auto">
          {topicsForSubject.map((r) => {
            const active = r.topic === activeTopic
            const thinT = r.count < 4
            const pct = Math.round((r.count / maxInSubject) * 100)
            return (
              <li key={r.topic}>
                <button
                  type="button"
                  onClick={() => setTopic(r.topic)}
                  className={`relative w-full overflow-hidden rounded-md border px-2 py-1.5 text-left transition ${
                    active
                      ? 'border-indigo-500/40 bg-indigo-500/10'
                      : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900/60'
                  }`}
                >
                  <span
                    className={`pointer-events-none absolute inset-y-0 left-0 ${
                      thinT ? 'bg-amber-500/15' : 'bg-zinc-700/30'
                    }`}
                    style={{ width: `${Math.max(8, pct)}%` }}
                  />
                  <span className="relative flex items-center justify-between gap-2 text-[11px]">
                    <span
                      className={
                        active ? 'font-medium text-indigo-50' : 'text-zinc-300'
                      }
                    >
                      {r.topic}
                    </span>
                    <span className="tabular-nums text-[10px] text-zinc-500">
                      {r.count}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          {topicsForSubject.length === 0 ? (
            <li className="py-2 text-center text-[10px] text-zinc-600">
              No topics match
            </li>
          ) : null}
        </ul>

        {/* Current topic peek */}
        <div className="mt-2 rounded border border-zinc-800/80 bg-zinc-900/40 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium text-zinc-300">
              {activeTopic}
              <span className="ml-1 font-normal text-zinc-500">
                · {topicCount} cards
              </span>
            </p>
            <button
              type="button"
              onClick={() => {
                setBrowseTitle(`${subject} / ${activeTopic}`)
                setBrowseCards(topicCards)
                setBrowseOpen(true)
              }}
              disabled={topicCards.length === 0}
              className="inline-flex items-center gap-1 text-[9px] text-indigo-300/90 hover:text-indigo-200 disabled:opacity-40"
            >
              <Eye className="h-3 w-3" />
              Preview topic
            </button>
          </div>
          {topicRow ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(topicRow.types).map(([t, n]) => (
                <span
                  key={t}
                  className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] text-zinc-500"
                >
                  {cardKindLabel(t)} {n}
                </span>
              ))}
            </div>
          ) : null}
          <ul className="mt-1.5 max-h-16 space-y-0.5 overflow-y-auto text-[9px] text-zinc-600">
            {topicCards.slice(0, 8).map((c) => (
              <li key={c.id} className="truncate">
                {c.title}
              </li>
            ))}
            {topicCards.length > 8 ? (
              <li className="text-zinc-700">+{topicCards.length - 8} more…</li>
            ) : null}
          </ul>
        </div>
      </div>

      {/* Enrich controls */}
      <div className="space-y-2 rounded-md border border-violet-500/25 bg-violet-500/5 p-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-violet-200/80">
          AI enrich
        </p>

        <label className="flex flex-col gap-1">
          <span className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>New cards to generate</span>
            <span className="tabular-nums font-medium text-zinc-300">
              {count}
            </span>
          </span>
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full"
            data-testid="enrich-count"
          />
          <span className="text-[9px] text-zinc-600">1–12 per run</span>
        </label>

        <div className="flex flex-wrap gap-1">
          {PROMPT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setCustomPrompt((prev) =>
                  prev.trim() ? `${prev.trim()}\n${p.text}` : p.text,
                )
                setShowPrompt(true)
              }}
              className="rounded-full border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-[9px] text-zinc-400 hover:border-violet-500/40 hover:text-violet-100"
            >
              + {p.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowPrompt((o) => !o)}
          className="flex w-full items-center gap-1 text-left text-[10px] text-zinc-400 hover:text-zinc-200"
        >
          <ChevronDown
            className={`h-3 w-3 transition ${showPrompt ? 'rotate-180' : ''}`}
          />
          Custom prompt
          {customPrompt.trim() ? (
            <span className="ml-1 text-violet-300/80">· set</span>
          ) : null}
        </button>
        {showPrompt ? (
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={4}
            placeholder="e.g. Focus on chain rule edge cases; include one table of common derivatives; avoid series…"
            className="field-input w-full resize-y text-[11px] leading-snug"
            data-testid="enrich-custom-prompt"
          />
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          data-testid="enrich-run"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/20 px-2 py-2 text-[11px] font-medium text-violet-50 hover:bg-violet-500/30 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {busy
            ? 'Generating…'
            : `Generate ${count} proposal${count === 1 ? '' : 's'}`}
        </button>
      </div>

      {/* Draft review strip */}
      {draft && draft.length > 0 ? (
        <div
          className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2"
          data-testid="enrich-draft"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium text-emerald-100/90">
              Review draft · {selectedDraft.length}/{draft.length} selected
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setReviewOpen(true)}
                className="inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] text-zinc-300 hover:bg-zinc-900"
              >
                <LayoutGrid className="h-3 w-3" />
                Modal
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="inline-flex items-center gap-1 rounded border border-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-500 hover:text-zinc-300"
              >
                <Trash2 className="h-3 w-3" />
                Discard
              </button>
            </div>
          </div>
          {draftNote ? (
            <p className="text-[9px] italic leading-snug text-zinc-500">
              {draftNote}
            </p>
          ) : null}
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {draft.map((d) => (
              <li
                key={d.key}
                className={`rounded-md border p-1.5 ${
                  d.selected
                    ? 'border-violet-500/30 bg-zinc-900/80'
                    : 'border-zinc-800/60 bg-zinc-950/40 opacity-60'
                }`}
              >
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={d.selected}
                    onChange={() => toggleKey(d.key)}
                    className="mt-0.5 rounded border-zinc-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium text-zinc-100">
                      {d.proposal.title}
                    </span>
                    <div className="mt-0.5">
                      <CatalogCardMetaChips card={d.proposal} />
                    </div>
                    <CatalogCardListSnippet card={d.proposal} />
                    <div className="mt-1 max-h-14 overflow-hidden opacity-90">
                      <CatalogCardPreviewBody card={d.proposal} dense />
                    </div>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy || selectedDraft.length === 0}
            onClick={() => void acceptSelected()}
            data-testid="enrich-accept"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-1.5 text-[11px] font-medium text-emerald-50 hover:bg-emerald-500/25 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" />
            Accept {selectedDraft.length} &amp; publish to RTDB
          </button>
        </div>
      ) : null}

      {/* Last batch */}
      {lastAdded.length > 0 ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-zinc-400">
              Last accepted ·{' '}
              <span className="text-zinc-200">{lastAdded.length}</span> cards
            </p>
            <button
              type="button"
              onClick={() => {
                setBrowseTitle('Last accepted enrich')
                setBrowseCards(lastAdded)
                setBrowseOpen(true)
              }}
              data-testid="enrich-view-last"
              className="inline-flex items-center gap-1 text-[10px] text-indigo-300 hover:text-indigo-200"
            >
              <Eye className="h-3 w-3" />
              View in modal
            </button>
          </div>
          <ul className="mt-1 space-y-0.5">
            {lastAdded.slice(0, 5).map((c) => (
              <li
                key={c.id}
                className="truncate text-[10px] text-zinc-500"
              >
                <span className="text-zinc-400">{c.title}</span>
                <span className="text-zinc-700"> · {c.type}</span>
              </li>
            ))}
            {lastAdded.length > 5 ? (
              <li className="text-[9px] text-zinc-700">
                +{lastAdded.length - 5} more
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {/* Catalog ops */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void publishSeed()}
          data-testid="catalog-publish-rtdb"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 hover:border-zinc-600 disabled:opacity-50"
        >
          <Database className="h-3.5 w-3.5" />
          Publish full catalog → RTDB
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          <RefreshCw className="h-3 w-3" />
          Reload catalog
        </button>
      </div>

      {status ? (
        <p
          className={`rounded-md border px-2 py-1.5 text-[10px] leading-snug ${
            status.kind === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
              : status.kind === 'warn'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-100'
          }`}
          data-testid="enrich-status"
        >
          {status.text}
        </p>
      ) : null}
      {lastError ? (
        <p className="text-[10px] text-rose-300/90">{lastError}</p>
      ) : null}

      {/* Proposal review modal */}
      <EnrichReviewModal
        open={reviewOpen && Boolean(draft?.length)}
        onClose={() => setReviewOpen(false)}
        title="Review AI proposals"
        subtitle={
          draftModel
            ? `${subject} · ${draft?.length ?? 0} cards · ${draftModel}`
            : `${subject} · ${draft?.length ?? 0} cards`
        }
        cards={(draft ?? []).map((d) => d.proposal)}
        selectedKeys={selectedKeys}
        onToggleSelect={toggleKey}
        getKey={(c, i) => {
          // Prefer stable draft keys
          const row = draft?.[i]
          return row?.key ?? proposalKey(c as EnrichProposalItem, i)
        }}
        regeneratingKey={regeneratingKey}
        onRegenerate={(args) =>
          regenerateOne({
            key: args.key,
            card: args.card as EnrichProposalItem,
            feedback: args.feedback,
          })
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-zinc-500">
              {selectedDraft.length} selected · feedback → regenerate · ← →
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-900"
              >
                Keep editing
              </button>
              <button
                type="button"
                disabled={busy || selectedDraft.length === 0}
                onClick={() => void acceptSelected()}
                className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1.5 text-[11px] font-medium text-emerald-50 hover:bg-emerald-500/30 disabled:opacity-40"
              >
                Accept &amp; publish
              </button>
            </div>
          </div>
        }
      />

      {/* Last added / topic browse modal */}
      <EnrichReviewModal
        open={browseOpen && browseCards.length > 0}
        onClose={() => setBrowseOpen(false)}
        title={browseTitle}
        subtitle={`${browseCards.length} cards`}
        cards={browseCards}
        getKey={(c, i) =>
          'id' in c && typeof c.id === 'string' ? c.id : String(i)
        }
      />

      <NewSubjectModal
        open={newSubjectOpen}
        onClose={() => setNewSubjectOpen(false)}
        onGenerated={({ subject: sub, proposals, model, byTopic }) => {
          setSubject(sub)
          const first =
            Object.keys(byTopic)[0] ?? proposals[0]?.topic ?? 'General'
          setTopic(first)
          setDraft(
            proposals.map((p, i) => ({
              key: proposalKey(p, i),
              proposal: p,
              selected: true,
            })),
          )
          setDraftModel(model)
          setDraftNote(
            `New subject “${sub}”: ${Object.entries(byTopic)
              .map(([t, n]) => `${t}(${n})`)
              .join(', ')}`,
          )
          setStatus({
            kind: 'ok',
            text: `Generated ${proposals.length} cards for “${sub}”. Review, then accept to publish.`,
          })
          setReviewOpen(true)
        }}
      />
    </div>
  )
}
