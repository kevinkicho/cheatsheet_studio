/**
 * Natural-language → catalog actions (for FAB chat + confirmations).
 */
import type { LibraryItem, Subject } from '../types'
import {
  DEFAULT_OLLAMA_MODEL,
  ollamaChat,
  parseJsonFromModel,
} from './ollamaClient'
import type { CatalogChatAction } from './catalogTypes'
import { buildTopicInventory } from './catalogInventory'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** Pending action awaiting user confirm */
  pendingAction?: CatalogChatAction
  /** Status after confirm */
  status?: 'pending' | 'confirmed' | 'cancelled' | 'done' | 'error'
}

function inventorySnippet(items: LibraryItem[]): string {
  const inv = buildTopicInventory(items)
  const bySub = new Map<string, number>()
  for (const r of inv) {
    bySub.set(r.subject, (bySub.get(r.subject) ?? 0) + r.count)
  }
  const lines = [...bySub.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([s, n]) => `${s}: ${n} cards`)
  const thin = inv
    .filter((r) => r.count < 4)
    .slice(0, 12)
    .map((r) => `${r.subject}/${r.topic}(${r.count})`)
  return `Subjects: ${lines.join('; ') || '(empty)'}\nThin topics: ${thin.join(', ') || '(none)'}`
}

/**
 * Parse a user chat message into a catalog action (or plain reply).
 */
export async function interpretCatalogChat(opts: {
  message: string
  items: LibraryItem[]
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  model?: string
  baseUrl?: string
  apiKey?: string
  signal?: AbortSignal
}): Promise<CatalogChatAction> {
  const model = opts.model ?? DEFAULT_OLLAMA_MODEL
  const { content } = await ollamaChat({
    model,
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    signal: opts.signal,
    temperature: 0.2,
    json: true,
    messages: [
      {
        role: 'system',
        content: `You are the catalog assistant for CheatSheet Studio.
Map user requests to ONE JSON action:

{
  "type": "enrich_topic" | "create_subject_pack" | "publish_rtdb" | "open_catalog" | "chat",
  "summary": "short confirmation text for the user",
  "subject": "slug lowercase e.g. psychology",
  "topic": "for enrich_topic",
  "topics": ["for create_subject_pack"],
  "count": 4,
  "cardsPerTopic": 12,
  "customUserPrompt": "optional extra guidance",
  "reply": "for type=chat only — helpful answer"
}

Examples:
- "enrich calculus with 6 cards" → enrich_topic subject=mathematics topic=Calculus count=6
- "produce psychology with clinical, cognitive, ... each with 12 blocks" → create_subject_pack
- "publish catalog" → publish_rtdb
- "show catalog" → open_catalog
- general question → chat with reply

Use lowercase subject slugs (psychology, mathematics, …).
Default count=4, cardsPerTopic=12 if unspecified.
summary must be a clear one-line confirmation of what will run.`,
      },
      ...(opts.history ?? []).slice(-6),
      {
        role: 'user',
        content: `Current catalog inventory:\n${inventorySnippet(opts.items)}\n\nUser request:\n${opts.message}`,
      },
    ],
  })

  const raw = parseJsonFromModel<Record<string, unknown>>(content)
  const type = String(raw.type ?? 'chat') as CatalogChatAction['type']
  const summary = String(raw.summary ?? 'OK')

  if (type === 'enrich_topic') {
    return {
      type: 'enrich_topic',
      subject: String(raw.subject || 'mathematics').toLowerCase() as Subject,
      topic: String(raw.topic || 'General'),
      count: Math.min(12, Math.max(1, Number(raw.count) || 4)),
      customUserPrompt:
        typeof raw.customUserPrompt === 'string'
          ? raw.customUserPrompt
          : undefined,
      summary,
    }
  }
  if (type === 'create_subject_pack') {
    const topics = Array.isArray(raw.topics)
      ? (raw.topics as unknown[]).map((t) => String(t).trim()).filter(Boolean)
      : []
    return {
      type: 'create_subject_pack',
      subject: String(raw.subject || 'general').toLowerCase() as Subject,
      topics:
        topics.length > 0
          ? topics
          : ['General'],
      cardsPerTopic: Math.min(
        16,
        Math.max(1, Number(raw.cardsPerTopic) || Number(raw.count) || 12),
      ),
      customUserPrompt:
        typeof raw.customUserPrompt === 'string'
          ? raw.customUserPrompt
          : undefined,
      summary,
    }
  }
  if (type === 'publish_rtdb') {
    return { type: 'publish_rtdb', summary }
  }
  if (type === 'open_catalog') {
    return { type: 'open_catalog', summary }
  }
  return {
    type: 'chat',
    summary,
    reply: String(raw.reply ?? raw.summary ?? 'How can I help with the catalog?'),
  }
}

/** Normalize free-form subject label to slug. */
export function subjectSlug(input: string): Subject {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') as Subject
}

/** Parse "Clinical Psychology, Cognitive Psychology, ..." */
export function parseTopicList(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}
