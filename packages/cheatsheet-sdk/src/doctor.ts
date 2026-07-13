/**
 * Health check for the headless SDK environment (agents / CI).
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSeedCatalog } from './catalog'
import { listTopicPacks } from './topic-packs'
import { SHEET_DOC_VERSION } from './types'

export type DoctorCheck = {
  name: string
  ok: boolean
  detail: string
}

export type DoctorReport = {
  ok: boolean
  version: number
  checks: DoctorCheck[]
}

function pkgRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

export async function runDoctor(): Promise<DoctorReport> {
  const checks: DoctorCheck[] = []
  const root = pkgRoot()

  // Node
  const nodeMajor = Number(process.versions.node.split('.')[0])
  checks.push({
    name: 'node',
    ok: nodeMajor >= 20,
    detail: `Node ${process.versions.node}${nodeMajor >= 20 ? '' : ' (need ≥20)'}`,
  })

  // Topic packs
  try {
    const packs = listTopicPacks()
    checks.push({
      name: 'topic-packs',
      ok: packs.length > 0,
      detail: `${packs.length} pack(s): ${packs.map((p) => p.id).join(', ')}`,
    })
  } catch (e) {
    checks.push({
      name: 'topic-packs',
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // Catalog
  try {
    const cat = await loadSeedCatalog()
    checks.push({
      name: 'seed-catalog',
      ok: cat.length > 0,
      detail: `${cat.length} item(s) loaded`,
    })
  } catch (e) {
    checks.push({
      name: 'seed-catalog',
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // Snapshot file (for published package)
  const snap = path.join(root, 'data', 'seed-catalog.json')
  checks.push({
    name: 'catalog-snapshot',
    ok: existsSync(snap),
    detail: existsSync(snap)
      ? `present (${path.relative(process.cwd(), snap)})`
      : 'missing — run npm run sdk:export-catalog',
  })

  // Cloud auth (optional — warn only)
  const sa =
    process.env.CHEATSHEET_SA_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    ''
  const uid = process.env.CHEATSHEET_UID || ''
  if (sa) {
    const abs = path.resolve(sa)
    checks.push({
      name: 'cloud-sa',
      ok: existsSync(abs),
      detail: existsSync(abs)
        ? `CHEATSHEET_SA_PATH ok${uid ? `; CHEATSHEET_UID set` : ' (CHEATSHEET_UID not set)'}`
        : `SA path not found: ${abs}`,
    })
  } else {
    checks.push({
      name: 'cloud-sa',
      ok: true,
      detail: 'not configured (local file authoring only — OK)',
    })
  }

  // package.json version
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8'),
    ) as { version?: string; name?: string }
    checks.push({
      name: 'package',
      ok: true,
      detail: `${pkg.name ?? 'sdk'}@${pkg.version ?? '?'} · sheet v${SHEET_DOC_VERSION}`,
    })
  } catch {
    checks.push({ name: 'package', ok: false, detail: 'package.json unreadable' })
  }

  return {
    ok: checks.every((c) => c.ok),
    version: SHEET_DOC_VERSION,
    checks,
  }
}
