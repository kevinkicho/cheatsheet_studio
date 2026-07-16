import type { LibraryItem } from '@/types'

export type LibraryFilterInput = {
  /** Subject id, or `'all'`. */
  subject?: string
  /** Topic name, or `'all'`. */
  topic?: string
  /** Item type, or `'all'`. */
  type?: string
  /** Free-text query (name, topic, tags, latex, description, subject). */
  search?: string
}

/**
 * Tokenize search: split on whitespace; every token must match somewhere.
 * Empty / whitespace-only → no text filter.
 */
export function searchTokens(search: string | undefined): string[] {
  return (search ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Remove TeX control sequences so "\frac" does not match query "g".
 */
export function stripLatexCommands(latex: string): string {
  return latex
    .replace(/\\[a-zA-Z]+\*?/g, ' ')
    .replace(/\\./g, ' ')
    .replace(/[{}\[\]^_&$~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Searchable = Pick<
  LibraryItem,
  | 'title'
  | 'topic'
  | 'subject'
  | 'tags'
  | 'latex'
  | 'description'
  | 'tableMarkdown'
  | 'term'
  | 'body'
  | 'code'
  | 'symbol'
  | 'value'
  | 'unit'
  | 'listItems'
  | 'identities'
>

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Token is a prefix of the whole string or of any word. */
export function hasWordPrefix(text: string, token: string): boolean {
  if (!token) return true
  const t = text.toLowerCase()
  if (t.startsWith(token)) return true
  const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(token)}`, 'u')
  return re.test(t)
}

/**
 * Title begins with token (ignore leading quotes/punctuation).
 * "u" → "U-substitution", not "Cobb–Douglas Utility".
 */
export function titleStartsWithToken(title: string, token: string): boolean {
  if (!token) return true
  const t = title
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
  return t.startsWith(token)
}

function titleText(item: Searchable): string {
  return (item.title ?? '').toLowerCase()
}

function topicText(item: Searchable): string {
  return (item.topic ?? '').toLowerCase()
}

function tagsText(item: Searchable): string {
  return (Array.isArray(item.tags) ? item.tags : [])
    .map(String)
    .join(' ')
    .toLowerCase()
}

function subjectText(item: Searchable): string {
  return (item.subject ?? '').toLowerCase()
}

function secondaryText(item: Searchable): string {
  return [
    stripLatexCommands(item.latex ?? ''),
    item.description ?? '',
    item.tableMarkdown ?? '',
    item.term ?? '',
    item.body ?? '',
    item.code ?? '',
    item.symbol ?? '',
    item.value ?? '',
    item.unit ?? '',
    (item.listItems ?? []).join(' '),
    (item.identities ?? []).map(stripLatexCommands).join(' '),
  ]
    .join('\n')
    .toLowerCase()
}

/**
 * Matching tiers (avoids "u" → utility/unemployment noise):
 * - 1 char: title must **start with** that letter (U-substitution ✓, Utility at end ✗)
 * - 2 chars: word-prefix on title only
 * - 3+ chars: title/topic/tags/subject substring, else description + stripped latex
 */
export function tokenMatchesItem(item: Searchable, token: string): boolean {
  const title = titleText(item)
  const topic = topicText(item)
  const tags = tagsText(item)
  const subject = subjectText(item)

  if (token.length === 1) {
    return titleStartsWithToken(item.title ?? '', token)
  }

  if (token.length === 2) {
    return hasWordPrefix(title, token)
  }

  if (
    title.includes(token) ||
    topic.includes(token) ||
    tags.includes(token) ||
    subject.includes(token)
  ) {
    return true
  }
  return secondaryText(item).includes(token)
}

export function itemMatchesSearch(
  item: Searchable,
  search: string | undefined,
): boolean {
  const tokens = searchTokens(search)
  if (tokens.length === 0) return true
  return tokens.every((t) => tokenMatchesItem(item, t))
}

/**
 * Higher = better match. Surfaces title prefixes (Gauss) over weak hits.
 */
export function searchRelevanceScore(
  item: Searchable,
  search: string | undefined,
): number {
  const tokens = searchTokens(search)
  if (tokens.length === 0) return 0

  const title = titleText(item)
  const topic = topicText(item)
  const tags = tagsText(item)
  const subject = subjectText(item)
  const secondary = secondaryText(item)

  let score = 0
  for (const t of tokens) {
    if (!tokenMatchesItem(item, t)) continue

    if (title === t) score += 1000
    else if (titleStartsWithToken(item.title ?? '', t)) score += 500
    else if (hasWordPrefix(title, t)) score += 350
    else if (title.includes(t) && t.length > 2) score += 200

    if (t.length > 2) {
      if (topic.startsWith(t) || hasWordPrefix(topic, t)) score += 80
      else if (topic.includes(t)) score += 40

      if (hasWordPrefix(tags, t)) score += 50
      else if (tags.includes(t)) score += 25

      if (hasWordPrefix(subject, t)) score += 15
      if (secondary.includes(t)) score += 5
    }
  }
  return score
}

export function filterLibraryItems<T extends LibraryItem>(
  items: T[],
  filter: LibraryFilterInput,
): T[] {
  const subj =
    !filter.subject || filter.subject === 'all'
      ? null
      : filter.subject.toLowerCase()
  const topic =
    !filter.topic || filter.topic === 'all'
      ? null
      : filter.topic.toLowerCase()
  const type =
    !filter.type || filter.type === 'all' ? null : filter.type

  const matched = items.filter((item) => {
    if (subj && (item.subject ?? '').toLowerCase() !== subj) return false
    if (topic && (item.topic ?? '').toLowerCase() !== topic) return false
    if (type && item.type !== type) return false
    return itemMatchesSearch(item, filter.search)
  })

  const q = (filter.search ?? '').trim()
  if (!q) return matched

  return matched.sort((a, b) => {
    const sb = searchRelevanceScore(b, filter.search)
    const sa = searchRelevanceScore(a, filter.search)
    if (sb !== sa) return sb - sa
    return (a.title ?? '').localeCompare(b.title ?? '', undefined, {
      sensitivity: 'base',
      numeric: true,
    })
  })
}
