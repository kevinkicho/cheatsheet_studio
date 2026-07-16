/**
 * CLI: enrich thin topics via Ollama Cloud and optionally publish RTDB bulk.
 *
 * Usage:
 *   npx tsx scripts/enrich-topics-ollama.ts --list
 *   npx tsx scripts/enrich-topics-ollama.ts --subject mathematics --topic Calculus
 *   npx tsx scripts/enrich-topics-ollama.ts --thin --count 3 --publish
 *
 * Requires:
 *   OLLAMA_API_KEY in .env (never commit)
 *   OLLAMA_MODE=cloud (default)
 *   VITE_OLLAMA_MODEL=gemma4:31b  (Cloud API; omit -cloud suffix)
 *
 * API: https://docs.ollama.com/cloud
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { SEED_LIBRARY } from '../src/data/seedLibrary.ts'
import {
  enrichTopicWithOllama,
  mergeProposalsIntoLibrary,
} from '../src/lib/catalogEnrich.ts'
import { buildTopicInventory, thinTopics } from '../src/lib/catalogInventory.ts'
import type { LibraryItem, Subject } from '../src/types/index.ts'

function loadEnv() {
  const p = resolve(process.cwd(), '.env')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (!(k in process.env)) process.env[k] = v
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i < 0) return undefined
  return process.argv[i + 1]
}

function has(flag: string): boolean {
  return process.argv.includes(flag)
}

async function main() {
  loadEnv()
  const apiKey = (process.env.OLLAMA_API_KEY || '').trim()
  const model =
    (process.env.VITE_OLLAMA_MODEL || process.env.OLLAMA_MODEL || 'gemma4:31b').trim()
  const host = (
    process.env.OLLAMA_HOST ||
    (process.env.OLLAMA_MODE === 'local'
      ? 'http://127.0.0.1:11434'
      : 'https://ollama.com')
  ).replace(/\/$/, '')

  if (!apiKey && !host.includes('11434')) {
    console.error(
      'Missing OLLAMA_API_KEY in .env (https://ollama.com/settings/keys)',
    )
    process.exit(1)
  }

  let items: LibraryItem[] = [...SEED_LIBRARY]
  const inv = buildTopicInventory(items)

  if (has('--list')) {
    console.log(`Catalog: ${items.length} items (seed)\n`)
    for (const r of inv) {
      console.log(
        `${r.subject.padEnd(12)} ${r.topic.padEnd(28)} ${String(r.count).padStart(3)}  ${Object.entries(
          r.types,
        )
          .map(([k, v]) => `${k}:${v}`)
          .join(' ')}`,
      )
    }
    return
  }

  const thin = thinTopics(items, Number(arg('--min') ?? 4))
  if (has('--thin-list')) {
    console.log(`Thin topics (<${arg('--min') ?? 4} cards):\n`)
    for (const r of thin) {
      console.log(`  ${r.subject} / ${r.topic} (${r.count})`)
    }
    return
  }

  const targets: { subject: Subject; topic: string }[] = []
  if (has('--thin')) {
    const limit = Number(arg('--limit') ?? 5)
    for (const r of thin.slice(0, limit)) {
      targets.push({ subject: r.subject, topic: r.topic })
    }
  } else {
    const subject = (arg('--subject') || 'mathematics') as Subject
    const topic = arg('--topic') || 'Calculus'
    targets.push({ subject, topic })
  }

  if (targets.length === 0) {
    console.log('No targets. Use --subject/--topic or --thin')
    return
  }

  console.log(`Ollama ${host} model=${model}`)
  console.log(`Targets: ${targets.map((t) => `${t.subject}/${t.topic}`).join(', ')}`)

  for (const t of targets) {
    console.log(`\n→ Enriching ${t.subject} / ${t.topic}…`)
    try {
      const result = await enrichTopicWithOllama({
        subject: t.subject,
        topic: t.topic,
        items,
        count: Number(arg('--count') ?? 4),
        model,
        baseUrl: host,
        apiKey: apiKey || undefined,
      })
      console.log(
        `  model=${result.model} proposals=${result.proposals.length}`,
      )
      for (const p of result.proposals) {
        console.log(`    + [${p.type}] ${p.title}`)
      }
      items = mergeProposalsIntoLibrary(items, result.proposals).items
    } catch (e) {
      console.error('  failed:', e instanceof Error ? e.message : e)
    }
  }

  const outDir = resolve(process.cwd(), 'examples/agent-out')
  mkdirSync(outDir, { recursive: true })
  const outFile = resolve(outDir, 'enriched-catalog.json')
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model,
        itemCount: items.length,
        items,
      },
      null,
      2,
    ),
    'utf8',
  )
  console.log(`\nWrote ${items.length} items → ${outFile}`)

  if (has('--publish')) {
    console.log(
      '\n--publish: use the app UI “Publish current catalog → RTDB” while signed in,',
    )
    console.log(
      'or import enriched-catalog.json via a future admin path. (CLI publish needs Admin SDK + RTDB rules.)',
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
