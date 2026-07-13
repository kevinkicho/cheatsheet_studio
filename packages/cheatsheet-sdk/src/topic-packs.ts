/**
 * Premade topic packs — outline JSON under packages/cheatsheet-sdk/topic-packs/
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeFromOutline } from './compose'
import type { SheetOutline } from './outline'
import type { SheetDocument } from './types'

export type TopicPackMeta = {
  id: string
  file: string
  title: string
  description: string
  subjects?: string[]
}

export type TopicPack = TopicPackMeta & {
  outline: SheetOutline
}

function packsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../topic-packs')
}

export function listTopicPacks(opts?: {
  subject?: string
}): TopicPackMeta[] {
  const dir = packsDir()
  const indexPath = path.join(dir, 'index.json')
  let packs: TopicPackMeta[] = []
  try {
    const raw = JSON.parse(readFileSync(indexPath, 'utf8')) as {
      packs?: TopicPackMeta[]
    }
    if (Array.isArray(raw.packs) && raw.packs.length > 0) packs = raw.packs
  } catch {
    /* fall through */
  }
  if (packs.length === 0) {
    packs = readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => {
        const full = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as {
          id?: string
          title?: string
          description?: string
          subjects?: string[]
        }
        return {
          id: full.id ?? f.replace(/\.json$/, ''),
          file: f,
          title: full.title ?? f,
          description: full.description ?? '',
          subjects: full.subjects,
        }
      })
  }
  const sub = opts?.subject?.trim().toLowerCase()
  if (!sub) return packs
  return packs.filter((p) =>
    (p.subjects ?? []).some(
      (s) =>
        s.toLowerCase() === sub ||
        s.toLowerCase().includes(sub) ||
        sub.includes(s.toLowerCase()),
    ),
  )
}

export function loadTopicPack(id: string): TopicPack {
  const meta = listTopicPacks().find(
    (p) => p.id === id || p.file === id || p.file === `${id}.json`,
  )
  if (!meta) {
    const known = listTopicPacks()
      .map((p) => p.id)
      .join(', ')
    throw new Error(`Unknown topic pack "${id}". Known: ${known}`)
  }
  const fullPath = path.join(packsDir(), meta.file)
  const raw = JSON.parse(readFileSync(fullPath, 'utf8')) as {
    id?: string
    title?: string
    description?: string
    subjects?: string[]
    outline: SheetOutline
  }
  if (!raw.outline?.title || !Array.isArray(raw.outline.blocks)) {
    throw new Error(`Pack ${meta.id} missing outline.title / outline.blocks`)
  }
  return {
    id: raw.id ?? meta.id,
    file: meta.file,
    title: raw.title ?? meta.title,
    description: raw.description ?? meta.description,
    subjects: raw.subjects ?? meta.subjects,
    outline: {
      ...raw.outline,
      notes:
        raw.outline.notes ??
        `Topic pack: ${raw.id ?? meta.id}${
          raw.description ? ` — ${raw.description}` : ''
        }`,
    },
  }
}

export async function composeTopicPack(id: string): Promise<SheetDocument> {
  const pack = loadTopicPack(id)
  return composeFromOutline(pack.outline)
}
