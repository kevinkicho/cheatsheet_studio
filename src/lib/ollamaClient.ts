/**
 * Minimal Ollama HTTP client (local default :11434).
 * Used for AI cheatsheet layout assist — no cloud keys required.
 */

/**
 * Prefer Vite proxy in dev if VITE_OLLAMA_USE_PROXY=true, else direct :11434.
 * Proxy path: /ollama-proxy → http://127.0.0.1:11434
 */
export const DEFAULT_OLLAMA_BASE = (() => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env
  if (env?.VITE_OLLAMA_BASE_URL) return env.VITE_OLLAMA_BASE_URL
  if (env?.VITE_OLLAMA_USE_PROXY === 'true') return '/ollama-proxy'
  return 'http://127.0.0.1:11434'
})()

export const DEFAULT_OLLAMA_MODEL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { VITE_OLLAMA_MODEL?: string } }).env
      ?.VITE_OLLAMA_MODEL) ||
  'gemma4:31b-cloud'

export type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type OllamaChatOptions = {
  baseUrl?: string
  model?: string
  messages: OllamaChatMessage[]
  /** Prefer low temperature for structured JSON. */
  temperature?: number
  signal?: AbortSignal
  /**
   * When true, ask Ollama to return JSON object (format: 'json').
   * Default true for layout tooling.
   */
  json?: boolean
}

export async function ollamaPing(
  baseUrl = DEFAULT_OLLAMA_BASE,
  signal?: AbortSignal,
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      signal,
    })
    if (!res.ok) {
      return { ok: false, models: [], error: `HTTP ${res.status}` }
    }
    const data = (await res.json()) as {
      models?: Array<{ name?: string }>
    }
    const models = (data.models ?? [])
      .map((m) => m.name ?? '')
      .filter(Boolean)
    return { ok: true, models }
  } catch (e) {
    return {
      ok: false,
      models: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * Non-streaming chat completion.
 * Strips Gemma “thinking” channel noise when present so callers get final JSON/text.
 */
export async function ollamaChat(
  opts: OllamaChatOptions,
): Promise<{ content: string; model: string; raw: unknown }> {
  const base = (opts.baseUrl ?? DEFAULT_OLLAMA_BASE).replace(/\/$/, '')
  const model = opts.model ?? DEFAULT_OLLAMA_MODEL
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    stream: false,
    options: {
      temperature: opts.temperature ?? 0.2,
      top_p: 0.95,
    },
  }
  if (opts.json !== false) {
    body.format = 'json'
  }

  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Ollama chat failed (${res.status}): ${t.slice(0, 240)}`)
  }
  const data = (await res.json()) as {
    message?: { content?: string }
    model?: string
  }
  const rawContent = data.message?.content ?? ''
  return {
    content: stripThinkingNoise(rawContent),
    model: data.model ?? model,
    raw: data,
  }
}

/** Drop Gemma thinking channels / fences so JSON parse is reliable. */
export function stripThinkingNoise(text: string): string {
  let s = text.trim()
  // channel thought blocks (gemma4)
  s = s.replace(/<\|channel\|>[\s\S]*?<channel\|>/gi, '')
  s = s.replace(/<\|channel\>thought[\s\S]*?<channel\|>/gi, '')
  s = s.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '')
  return s.trim()
}

export function parseJsonFromModel<T = unknown>(text: string): T {
  const cleaned = stripThinkingNoise(text)
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0]) as T
    throw new Error('Model did not return valid JSON')
  }
}
