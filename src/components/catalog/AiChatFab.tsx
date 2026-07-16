/**
 * Floating action button + chat panel for natural-language catalog actions.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { useLibraryStore } from '@/stores/libraryStore'
import { useCatalogUiStore } from '@/stores/catalogUiStore'
import { useUiStore } from '@/stores/uiStore'
import {
  interpretCatalogChat,
  type ChatMessage,
} from '@/lib/catalogChat'
import {
  enrichTopicWithOllama,
  generateSubjectPackWithOllama,
} from '@/lib/catalogEnrich'
import { publishCatalogToRtdb } from '@/lib/catalogRtdb'
import type { CatalogChatAction } from '@/lib/catalogTypes'
import { DEFAULT_OLLAMA_MODEL } from '@/lib/ollamaClient'

export function AiChatFab() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hi — I can enrich topics, create whole subjects (e.g. psychology packs), or publish the catalog. Describe what you want; I’ll confirm before running.',
    },
  ])
  const bottomRef = useRef<HTMLDivElement>(null)
  const items = useLibraryStore((s) => s.items)
  const requestOpenCatalog = useCatalogUiStore((s) => s.requestOpenCatalog)
  const injectDraft = useCatalogUiStore((s) => s.injectDraft)
  const setLeftOpen = useUiStore((s) => s.setLeftOpen)
  const setView = useUiStore((s) => s.setView)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const push = useCallback((m: Omit<ChatMessage, 'id'> & { id?: string }) => {
    setMessages((prev) => [...prev, { ...m, id: m.id ?? nanoid(8) }])
  }, [])

  const updateMsg = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    )
  }, [])

  const runAction = async (msgId: string, action: CatalogChatAction) => {
    setBusy(true)
    updateMsg(msgId, { status: 'confirmed' })
    try {
      if (action.type === 'chat') {
        updateMsg(msgId, { status: 'done' })
        return
      }
      if (action.type === 'open_catalog') {
        setView('workspace')
        setLeftOpen(true)
        requestOpenCatalog()
        push({
          role: 'assistant',
          content: 'Opened Catalog & enrich in the left sidebar.',
          status: 'done',
        })
        updateMsg(msgId, { status: 'done' })
        return
      }
      if (action.type === 'publish_rtdb') {
        const meta = await publishCatalogToRtdb(items, {
          note: 'Published via AI chat',
          source: 'rtdb',
        })
        push({
          role: 'assistant',
          content: `Published ${meta.itemCount} cards to RTDB (v${meta.version}).`,
          status: 'done',
        })
        updateMsg(msgId, { status: 'done' })
        return
      }
      if (action.type === 'enrich_topic') {
        push({
          role: 'assistant',
          content: `Generating ${action.count} cards for ${action.subject} / ${action.topic}…`,
        })
        const result = await enrichTopicWithOllama({
          subject: action.subject,
          topic: action.topic,
          items,
          count: action.count,
          customUserPrompt: action.customUserPrompt,
          model: DEFAULT_OLLAMA_MODEL,
        })
        setView('workspace')
        setLeftOpen(true)
        requestOpenCatalog()
        injectDraft({
          proposals: result.proposals,
          subject: action.subject,
          topic: action.topic,
          model: result.model,
          note: result.rawNote,
          openReview: true,
        })
        push({
          role: 'assistant',
          content: `Ready: ${result.proposals.length} proposals for ${action.topic}. Review & accept in Catalog & enrich (modal opened).`,
          status: 'done',
        })
        updateMsg(msgId, { status: 'done' })
        return
      }
      if (action.type === 'create_subject_pack') {
        push({
          role: 'assistant',
          content: `Building subject “${action.subject}” · ${action.topics.length} topics × ${action.cardsPerTopic} cards…`,
        })
        const result = await generateSubjectPackWithOllama({
          subject: action.subject,
          topics: action.topics,
          cardsPerTopic: action.cardsPerTopic,
          customUserPrompt: action.customUserPrompt,
          model: DEFAULT_OLLAMA_MODEL,
          onProgress: ({ topic, index, total }) => {
            // light progress via last assistant line
            setMessages((prev) => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              if (last?.role === 'assistant') {
                copy[copy.length - 1] = {
                  ...last,
                  content: `Building “${action.subject}”… ${topic} (${index + 1}/${total})`,
                }
              }
              return copy
            })
          },
        })
        const firstTopic = action.topics[0] ?? 'General'
        setView('workspace')
        setLeftOpen(true)
        requestOpenCatalog()
        injectDraft({
          proposals: result.proposals,
          subject: action.subject,
          topic: firstTopic,
          model: result.model,
          note: `Subject pack ${action.subject}: ${Object.entries(result.byTopic)
            .map(([t, n]) => `${t}(${n})`)
            .join(', ')}`,
          openReview: true,
        })
        push({
          role: 'assistant',
          content: `Generated ${result.proposals.length} cards for “${action.subject}”. Review selections in Catalog & enrich, then accept to publish RTDB.`,
          status: 'done',
        })
        updateMsg(msgId, { status: 'done' })
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      push({ role: 'assistant', content: `Failed: ${err}`, status: 'error' })
      updateMsg(msgId, { status: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || busy) return
    setInput('')
    push({ role: 'user', content: msg })
    setBusy(true)
    try {
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
      const action = await interpretCatalogChat({
        message: msg,
        items,
        history,
        model: DEFAULT_OLLAMA_MODEL,
      })

      if (action.type === 'chat') {
        push({ role: 'assistant', content: action.reply, status: 'done' })
        return
      }

      const id = nanoid(8)
      push({
        id,
        role: 'assistant',
        content: action.summary,
        pendingAction: action,
        status: 'pending',
      })
    } catch (e) {
      push({
        role: 'assistant',
        content: e instanceof Error ? e.message : String(e),
        status: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="ai-chat-fab"
        title="Chat with catalog AI"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-[80] flex h-12 w-12 items-center justify-center rounded-full border border-violet-500/40 bg-violet-600 text-white shadow-lg shadow-violet-900/40 transition hover:bg-violet-500"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {open ? (
        <div
          className="fixed bottom-20 right-5 z-[80] flex h-[min(480px,calc(100vh-7rem))] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl"
          data-testid="ai-chat-panel"
        >
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-100">Catalog AI</p>
              <p className="truncate text-[9px] text-zinc-500">
                {DEFAULT_OLLAMA_MODEL} · confirm before runs
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] leading-snug ${
                  m.role === 'user'
                    ? 'ml-6 bg-indigo-500/20 text-indigo-50'
                    : 'mr-4 bg-zinc-900 text-zinc-300'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.pendingAction && m.status === 'pending' ? (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-zinc-800 pt-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction(m.id, m.pendingAction!)}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[10px] font-medium text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" />
                      Confirm &amp; run
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        updateMsg(m.id, {
                          status: 'cancelled',
                          pendingAction: undefined,
                          content: `${m.content}\n\n(Cancelled)`,
                        })
                      }
                      className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-900"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
                {m.status === 'confirmed' ? (
                  <div className="ai-thinking mt-1.5" data-testid="ai-thinking">
                    <span className="ai-thinking-label">Thinking</span>
                    <span className="ai-thinking-dots" aria-hidden>
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
            {busy &&
            !messages.some((m) => m.status === 'confirmed') ? (
              <div
                className="mr-4 rounded-lg bg-zinc-900 px-2.5 py-2"
                data-testid="ai-thinking-bubble"
              >
                <div className="ai-thinking">
                  <span className="ai-thinking-label">Thinking</span>
                  <span className="ai-thinking-dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-zinc-800 p-2">
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                void send(input)
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={busy}
                placeholder="e.g. psychology pack with 12 cards per topic…"
                className="field-input min-w-0 flex-1 text-[11px]"
                data-testid="ai-chat-input"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-violet-500/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30 disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
