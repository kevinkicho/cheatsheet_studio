/**
 * Ollama HTTP client for AI cheatsheet layout.
 *
 * Browser always talks to same-origin `/ollama-proxy` (Vite injects auth +
 * forwards to ollama.com Cloud or local :11434). That avoids Chrome CORS and
 * keeps OLLAMA_API_KEY off the client bundle.
 *
 * @see https://docs.ollama.com/cloud
 */

export type OllamaBackend = 'proxy' | 'cloud' | 'local' | 'custom'

function envStr(key: string): string | undefined {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env
  const v = env?.[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/**
 * Resolve API base URL for the browser.
 * - Default in app: `/ollama-proxy` (recommended — no CORS)
 * - Override: VITE_OLLAMA_BASE_URL=https://ollama.com (needs CORS + exposes key if VITE_OLLAMA_API_KEY set — not recommended)
 */
export function resolveOllamaBaseUrl(): string {
  const explicit = envStr('VITE_OLLAMA_BASE_URL')
  if (explicit) return explicit.replace(/\/$/, '')
  // Always prefer same-origin proxy in browser builds
  return '/ollama-proxy'
}

export function resolveOllamaBackend(): OllamaBackend {
  const mode = (envStr('VITE_OLLAMA_MODE') || '').toLowerCase()
  if (mode === 'cloud' || mode === 'local' || mode === 'proxy') return mode
  const base = resolveOllamaBaseUrl()
  if (base.includes('ollama.com')) return 'cloud'
  if (base.includes('11434')) return 'local'
  if (base.startsWith('/')) return 'proxy'
  return 'custom'
}

/** Cloud API models often omit the `-cloud` suffix (see docs.ollama.com/cloud). */
export const DEFAULT_OLLAMA_MODEL =
  envStr('VITE_OLLAMA_MODEL') || 'gemma4:31b'

/** @deprecated use resolveOllamaBaseUrl() */
export const DEFAULT_OLLAMA_BASE = resolveOllamaBaseUrl()

/**
 * Optional browser-visible key — only if you intentionally call ollama.com
 * from the client (not recommended). Prefer OLLAMA_API_KEY on the Vite proxy.
 */
export function resolveBrowserApiKey(): string | undefined {
  return envStr('VITE_OLLAMA_API_KEY')
}

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
  /** Optional Authorization bearer (cloud). Proxy usually injects this. */
  apiKey?: string
}

function authHeaders(apiKey?: string): HeadersInit {
  const key = apiKey ?? resolveBrowserApiKey()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (key) headers.Authorization = `Bearer ${key}`
  return headers
}

export async function ollamaPing(
  baseUrl = resolveOllamaBaseUrl(),
  signal?: AbortSignal,
  apiKey?: string,
): Promise<{
  ok: boolean
  models: string[]
  error?: string
  baseUrl: string
  backend: OllamaBackend
}> {
  const backend = resolveOllamaBackend()
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      signal,
      headers: authHeaders(apiKey),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return {
        ok: false,
        models: [],
        error:
          res.status === 401 || res.status === 403
            ? `Auth failed (${res.status}). Set OLLAMA_API_KEY in .env and restart Vite.`
            : `HTTP ${res.status}${t ? `: ${t.slice(0, 120)}` : ''}`,
        baseUrl,
        backend,
      }
    }
    const data = (await res.json()) as {
      models?: Array<{ name?: string }>
    }
    const models = (data.models ?? [])
      .map((m) => m.name ?? '')
      .filter(Boolean)
    return { ok: true, models, baseUrl, backend }
  } catch (e) {
    return {
      ok: false,
      models: [],
      error: e instanceof Error ? e.message : String(e),
      baseUrl,
      backend,
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
  const base = (opts.baseUrl ?? resolveOllamaBaseUrl()).replace(/\/$/, '')
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
    headers: authHeaders(opts.apiKey),
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Ollama auth failed (${res.status}). Create a key at https://ollama.com/settings/keys and set OLLAMA_API_KEY in .env (restart npm run dev).`,
      )
    }
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
