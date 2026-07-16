/**
 * Ollama Cloud enrichment: propose new library cards for thin topics.
 * Browser uses /ollama-proxy (key never in bundle). CLI uses OLLAMA_API_KEY.
 */
import { nanoid } from 'nanoid'
import type { LibraryItem, Subject } from '../types'
import {
  DEFAULT_OLLAMA_MODEL,
  ollamaChat,
  parseJsonFromModel,
} from './ollamaClient'
import type { EnrichProposalItem, EnrichResult } from './catalogTypes'
import { existingTitlesInTopic } from './catalogInventory'

const ALLOWED_TYPES = new Set([
  'equation',
  'table',
  'definition',
  'list',
  'callout',
  'code',
  'constant',
  'identity-set',
  'matrix',
])

export type EnrichTopicOpts = {
  subject: Subject
  topic: string
  items: LibraryItem[]
  /** How many new cards to request (default 4, clamped 1–12). */
  count?: number
  model?: string
  /**
   * Extra instructions from the user (focus, difficulty, card types, etc.).
   * Appended to the model user message.
   */
  customUserPrompt?: string
  /** Node/CLI base URL override (https://ollama.com). */
  baseUrl?: string
  apiKey?: string
  signal?: AbortSignal
}

/** Shared authoring rules for cheatsheet cards (KaTeX-safe). */
export function catalogAuthoringRules(): string {
  return `Rules (CheatSheet Studio style):
- Prefer vector/text: LaTeX, GFM tables, prose — NEVER invent image URLs or figures as raster.
- LaTeX must be KaTeX-compatible: single-line or \\\\ for breaks; NO \\\\begin{align}, \\\\begin{equation}, \\\\begin{eqnarray}.
- Prefer \\\\frac, \\\\sum, \\\\int, \\\\text{...}, \\\\mathrm{...}. Escape properly in JSON.
- Titles: short human labels (Title Case), not raw latex.
- Equations: put formula in "latex"; definitions use term+body; lists use listItems.
- No duplicate titles vs existing list.
- Educational, exam-useful, concise; match subject/topic exactly as given.
- Types: equation|table|definition|list|callout|code|constant|identity-set|matrix`
}

function systemPrompt(): string {
  return `You are a STEM / social-science cheatsheet content author for CheatSheet Studio.
Return ONLY valid JSON (no markdown fences) with this shape:
{
  "note": "short rationale",
  "items": [
    {
      "title": "string",
      "type": "equation|table|definition|list|callout|code|constant|identity-set|matrix",
      "subject": "string (slug lowercase e.g. psychology)",
      "topic": "string",
      "tags": ["string"],
      "description": "optional",
      "latex": "KaTeX when needed",
      "tableMarkdown": "GFM table when type=table",
      "term": "for definition",
      "body": "prose for definition/callout",
      "listItems": ["..."],
      "listOrdered": false,
      "calloutVariant": "note|tip|info|warn|danger",
      "code": "for code cards",
      "codeLanguage": "text",
      "symbol": "for constant",
      "value": "for constant",
      "unit": "for constant",
      "identities": ["latex line", "..."],
      "matrixRows": [["a","b"],["c","d"]]
    }
  ]
}
${catalogAuthoringRules()}`
}

function userPrompt(opts: EnrichTopicOpts, titles: string[]): string {
  const n = Math.min(12, Math.max(1, opts.count ?? 4))
  const custom = (opts.customUserPrompt ?? '').trim()
  return `Enrich the cheatsheet topic below with exactly ${n} NEW cards (or as close as possible without duplicates).

Subject: ${opts.subject}
Topic: ${opts.topic}
Existing titles (${titles.length}): ${titles.slice(0, 50).join(' | ') || '(none)'}

Propose diverse types when useful (equation + definition + list/callout).
${custom ? `\nUser guidance (follow carefully):\n${custom}\n` : ''}
JSON only.`
}

function normalizeProposal(
  raw: Record<string, unknown>,
  subject: Subject,
  topic: string,
): EnrichProposalItem | null {
  const title = String(raw.title ?? '').trim()
  if (!title) return null
  let type = String(raw.type ?? 'equation') as LibraryItem['type']
  if (!ALLOWED_TYPES.has(type)) type = 'equation'
  const item: EnrichProposalItem = {
    title,
    type,
    subject: (raw.subject as Subject) || subject,
    topic: String(raw.topic ?? topic),
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : ['ai-enrich'],
    description:
      typeof raw.description === 'string' ? raw.description : undefined,
    latex: typeof raw.latex === 'string' ? raw.latex : undefined,
    tableMarkdown:
      typeof raw.tableMarkdown === 'string' ? raw.tableMarkdown : undefined,
    term: typeof raw.term === 'string' ? raw.term : undefined,
    body: typeof raw.body === 'string' ? raw.body : undefined,
    listItems: Array.isArray(raw.listItems)
      ? (raw.listItems as string[])
      : undefined,
    listOrdered: Boolean(raw.listOrdered),
    calloutVariant: raw.calloutVariant as LibraryItem['calloutVariant'],
    code: typeof raw.code === 'string' ? raw.code : undefined,
    codeLanguage:
      typeof raw.codeLanguage === 'string' ? raw.codeLanguage : undefined,
    symbol: typeof raw.symbol === 'string' ? raw.symbol : undefined,
    value: typeof raw.value === 'string' ? raw.value : undefined,
    unit: typeof raw.unit === 'string' ? raw.unit : undefined,
    identities: Array.isArray(raw.identities)
      ? (raw.identities as string[])
      : undefined,
    matrixRows: Array.isArray(raw.matrixRows)
      ? (raw.matrixRows as string[][])
      : undefined,
  }
  return item
}

export async function enrichTopicWithOllama(
  opts: EnrichTopicOpts,
): Promise<EnrichResult> {
  const titles = existingTitlesInTopic(opts.items, opts.subject, opts.topic)
  const model = opts.model ?? DEFAULT_OLLAMA_MODEL
  const { content, model: usedModel } = await ollamaChat({
    model,
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    signal: opts.signal,
    temperature: 0.35,
    json: true,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: userPrompt(opts, titles) },
    ],
  })

  const parsed = parseJsonFromModel<{
    note?: string
    items?: Record<string, unknown>[]
  }>(content)
  const list = Array.isArray(parsed.items) ? parsed.items : []
  const proposals = list
    .map((r) => normalizeProposal(r, opts.subject, opts.topic))
    .filter((x): x is EnrichProposalItem => x != null)
    .filter(
      (p) =>
        !titles.some((t) => t.toLowerCase() === p.title.toLowerCase()),
    )

  return {
    model: usedModel,
    proposals,
    target: {
      subject: opts.subject,
      topic: opts.topic,
      priorCount: titles.length,
    },
    rawNote: parsed.note,
  }
}

export type RegenerateProposalOpts = {
  proposal: EnrichProposalItem
  feedback: string
  /** Titles already in the topic (avoid collisions). */
  existingTitles?: string[]
  model?: string
  baseUrl?: string
  apiKey?: string
  signal?: AbortSignal
}

/** Re-author one proposal using user feedback (e.g. fix KaTeX style). */
export async function regenerateProposalWithFeedback(
  opts: RegenerateProposalOpts,
): Promise<{ proposal: EnrichProposalItem; model: string; note?: string }> {
  const model = opts.model ?? DEFAULT_OLLAMA_MODEL
  const feedback = opts.feedback.trim()
  if (!feedback) {
    throw new Error('Feedback is required to regenerate a card.')
  }
  const { content, model: usedModel } = await ollamaChat({
    model,
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    signal: opts.signal,
    temperature: 0.3,
    json: true,
    messages: [
      {
        role: 'system',
        content: `You revise ONE cheatsheet card. Return JSON:
{ "note": "what changed", "item": { ...same fields as a single library card... } }
${catalogAuthoringRules()}
Keep the same subject and topic unless feedback asks to change them.
Improve quality; apply user feedback precisely.`,
      },
      {
        role: 'user',
        content: `Original card JSON:
${JSON.stringify(opts.proposal, null, 2)}

Existing titles in topic (do not collide): ${(opts.existingTitles ?? []).slice(0, 40).join(' | ') || '(none)'}

User feedback:
${feedback}

Return revised item JSON only.`,
      },
    ],
  })
  const parsed = parseJsonFromModel<{
    note?: string
    item?: Record<string, unknown>
  }>(content)
  const raw = parsed.item ?? (parsed as unknown as Record<string, unknown>)
  const next = normalizeProposal(
    raw,
    opts.proposal.subject,
    opts.proposal.topic,
  )
  if (!next) throw new Error('Model did not return a valid revised card.')
  return { proposal: next, model: usedModel, note: parsed.note }
}

export type GenerateSubjectPackOpts = {
  subject: Subject
  topics: string[]
  /** Cards per topic (default 12, max 16). */
  cardsPerTopic?: number
  customUserPrompt?: string
  model?: string
  baseUrl?: string
  apiKey?: string
  signal?: AbortSignal
  /** Optional progress callback (topic index / total). */
  onProgress?: (info: {
    topic: string
    index: number
    total: number
  }) => void
}

/**
 * Generate a full subject pack: for each topic, request N cards.
 * Runs topics sequentially (more reliable than one huge JSON).
 */
export async function generateSubjectPackWithOllama(
  opts: GenerateSubjectPackOpts,
): Promise<{
  model: string
  proposals: EnrichProposalItem[]
  byTopic: Record<string, number>
}> {
  const topics = opts.topics.map((t) => t.trim()).filter(Boolean)
  if (!topics.length) throw new Error('At least one topic is required.')
  const per = Math.min(16, Math.max(1, opts.cardsPerTopic ?? 12))
  const subject = (opts.subject || 'general').toLowerCase() as Subject
  const all: EnrichProposalItem[] = []
  const byTopic: Record<string, number> = {}
  let lastModel = opts.model ?? DEFAULT_OLLAMA_MODEL

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i]!
    opts.onProgress?.({ topic, index: i, total: topics.length })
    const titles = all
      .filter((p) => p.topic === topic)
      .map((p) => p.title)
    const result = await enrichTopicWithOllama({
      subject,
      topic,
      items: titles.map(
        (title, j) =>
          ({
            id: `tmp_${j}`,
            type: 'equation' as const,
            title,
            subject,
            topic,
            tags: [],
            isSystem: false,
          }) satisfies LibraryItem,
      ),
      count: per,
      customUserPrompt:
        [
          opts.customUserPrompt?.trim(),
          `This is topic ${i + 1}/${topics.length} of a new subject pack "${subject}". Produce ${per} meaningful, non-overlapping cards for this topic only.`,
        ]
          .filter(Boolean)
          .join('\n'),
      model: opts.model,
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      signal: opts.signal,
    })
    lastModel = result.model
    // Force subject/topic on each proposal
    const forced = result.proposals.map((p) => ({
      ...p,
      subject,
      topic,
      tags: [...(p.tags ?? []), 'ai-subject-pack', subject],
    }))
    all.push(...forced)
    byTopic[topic] = forced.length
  }

  return { model: lastModel, proposals: all, byTopic }
}

/** Convert a proposal to a LibraryItem with a stable id. */
export function proposalToLibraryItem(
  p: EnrichProposalItem,
  id = `ai_${nanoid(10)}`,
): LibraryItem {
  return {
    id,
    type: p.type,
    title: p.title,
    subject: p.subject,
    topic: p.topic,
    tags: [...(p.tags ?? []), 'ai-enrich'],
    description: p.description,
    latex: p.latex,
    tableMarkdown: p.tableMarkdown,
    term: p.term,
    body: p.body,
    listItems: p.listItems,
    listOrdered: p.listOrdered,
    calloutVariant: p.calloutVariant,
    code: p.code,
    codeLanguage: p.codeLanguage,
    symbol: p.symbol,
    value: p.value,
    unit: p.unit,
    identities: p.identities,
    matrixRows: p.matrixRows,
    source: 'ollama-enrich',
    isSystem: false,
  }
}

/**
 * Assign stable ids and merge proposals into a library list.
 * Returns `{ items, added }` so UI can preview what was inserted.
 */
export function mergeProposalsIntoLibrary(
  existing: LibraryItem[],
  proposals: EnrichProposalItem[],
): { items: LibraryItem[]; added: LibraryItem[] } {
  const byId = new Map(existing.map((i) => [i.id, i]))
  const titles = new Set(existing.map((i) => i.title.toLowerCase()))
  const added: LibraryItem[] = []
  for (const p of proposals) {
    if (titles.has(p.title.toLowerCase())) continue
    const item = proposalToLibraryItem(p)
    byId.set(item.id, item)
    titles.add(p.title.toLowerCase())
    added.push(item)
  }
  return { items: [...byId.values()], added }
}
