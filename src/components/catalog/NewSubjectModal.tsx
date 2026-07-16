/**
 * Dialog: create a new subject pack via AI (topics × cards per topic).
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Sparkles, X } from 'lucide-react'
import { generateSubjectPackWithOllama } from '@/lib/catalogEnrich'
import { subjectSlug, parseTopicList } from '@/lib/catalogChat'
import { DEFAULT_OLLAMA_MODEL } from '@/lib/ollamaClient'
import type { EnrichProposalItem } from '@/lib/catalogTypes'
import type { Subject } from '@/types'

const PSYCH_PRESET = {
  subject: 'psychology',
  topics:
    'Clinical Psychology, Cognitive Psychology, Criminal Psychology, Social Psychology, Developmental Psychology, Neuropsychology',
  cardsPerTopic: 12,
  prompt:
    'Psychology cheatsheet: key theories, researchers, definitions, diagnostic concepts, and exam-useful lists. Prefer definition/list/callout/equation as appropriate. KaTeX-safe latex only.',
}

export type NewSubjectModalProps = {
  open: boolean
  onClose: () => void
  onGenerated: (args: {
    subject: Subject
    proposals: EnrichProposalItem[]
    model: string
    byTopic: Record<string, number>
  }) => void
}

export function NewSubjectModal({
  open,
  onClose,
  onGenerated,
}: NewSubjectModalProps) {
  const [subjectLabel, setSubjectLabel] = useState('psychology')
  const [topicsText, setTopicsText] = useState(PSYCH_PRESET.topics)
  const [cardsPerTopic, setCardsPerTopic] = useState(12)
  const [prompt, setPrompt] = useState(PSYCH_PRESET.prompt)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open || typeof document === 'undefined') return null

  const topics = parseTopicList(topicsText)
  const totalEst = topics.length * cardsPerTopic

  const run = async () => {
    const subject = subjectSlug(subjectLabel)
    if (!subject) {
      setError('Enter a subject name.')
      return
    }
    if (topics.length === 0) {
      setError('Enter at least one topic (comma-separated).')
      return
    }
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      const result = await generateSubjectPackWithOllama({
        subject,
        topics,
        cardsPerTopic,
        customUserPrompt: prompt,
        model: DEFAULT_OLLAMA_MODEL,
        onProgress: ({ topic, index, total }) => {
          setProgress(`Generating ${topic} (${index + 1}/${total})…`)
        },
      })
      onGenerated({
        subject,
        proposals: result.proposals,
        model: result.model,
        byTopic: result.byTopic,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      data-testid="new-subject-modal"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose()
        }}
      />
      <div className="relative w-[min(480px,calc(100vw-1.5rem))] rounded-xl border border-zinc-700 bg-zinc-950 p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              New subject with AI
            </h2>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              Creates topics × cards via {DEFAULT_OLLAMA_MODEL}. Review before
              publish.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-zinc-500">Subject name</span>
            <input
              className="field-input text-xs"
              value={subjectLabel}
              onChange={(e) => setSubjectLabel(e.target.value)}
              placeholder="psychology"
              disabled={busy}
            />
            <span className="text-[9px] text-zinc-600">
              Stored as slug: {subjectSlug(subjectLabel) || '…'}
            </span>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-zinc-500">
              Topics (comma-separated)
            </span>
            <textarea
              className="field-input min-h-[72px] resize-y text-xs leading-snug"
              value={topicsText}
              onChange={(e) => setTopicsText(e.target.value)}
              disabled={busy}
            />
            <span className="text-[9px] text-zinc-600">
              {topics.length} topics · ~{totalEst} cards total
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-[10px] text-zinc-500">
              <span>Cards per topic</span>
              <span className="tabular-nums text-zinc-300">{cardsPerTopic}</span>
            </span>
            <input
              type="range"
              min={1}
              max={16}
              value={cardsPerTopic}
              onChange={(e) => setCardsPerTopic(Number(e.target.value))}
              disabled={busy}
            />
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-zinc-500">Guidance prompt</span>
            <textarea
              className="field-input min-h-[64px] resize-y text-[11px] leading-snug"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
            />
          </label>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSubjectLabel(PSYCH_PRESET.subject)
              setTopicsText(PSYCH_PRESET.topics)
              setCardsPerTopic(PSYCH_PRESET.cardsPerTopic)
              setPrompt(PSYCH_PRESET.prompt)
            }}
            className="text-[10px] text-violet-300/90 hover:text-violet-200"
          >
            Load psychology preset (6 topics × 12)
          </button>

          {progress ? (
            <p className="flex items-center gap-2 text-[11px] text-sky-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {progress}
            </p>
          ) : null}
          {error ? (
            <p className="text-[10px] text-rose-300">{error}</p>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void run()}
            data-testid="new-subject-generate"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/20 px-3 py-2 text-[12px] font-medium text-violet-50 hover:bg-violet-500/30 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {busy ? 'Generating…' : `Generate ~${totalEst} cards`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
