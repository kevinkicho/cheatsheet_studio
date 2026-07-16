/**
 * Publish bundled SEED_LIBRARY as RTDB bulk snapshot catalog/v1.
 *
 * Usage: npx tsx scripts/publish-catalog-rtdb.ts
 *
 * Requires Admin SDK JSON in project root (gitignored) and RTDB enabled.
 * Deploy rules first: firebase deploy --only database
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { SEED_LIBRARY } from '../src/data/seedLibrary.ts'
import { countsBySubject } from '../src/lib/catalogInventory.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const saPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  resolve(root, 'mathstudy071026-firebase-adminsdk-fbsvc-a00ea90cba.json')

if (!existsSync(saPath)) {
  console.error('Service account JSON not found at', saPath)
  process.exit(1)
}

const sa = JSON.parse(readFileSync(saPath, 'utf8')) as ServiceAccount & {
  project_id?: string
}
const projectId = sa.project_id || 'mathstudy071026'
const databaseURL =
  process.env.FIREBASE_DATABASE_URL ||
  process.env.VITE_FIREBASE_DATABASE_URL ||
  `https://${projectId}-default-rtdb.firebaseio.com`

initializeApp({
  credential: cert(sa),
  databaseURL,
  projectId,
})

const db = getDatabase()

async function main() {
  const items = SEED_LIBRARY
  const meta = {
    version: Date.now(),
    updatedAt: Date.now(),
    itemCount: items.length,
    source: 'seed',
    note: 'Published by scripts/publish-catalog-rtdb.ts',
    bySubject: countsBySubject(items),
  }
  const payload = {
    meta,
    itemsJson: JSON.stringify(items),
  }
  const bytes = Buffer.byteLength(payload.itemsJson, 'utf8')
  console.log(
    `Publishing ${items.length} items (~${Math.round(bytes / 1024)} KB) → ${databaseURL}/catalog/v1`,
  )
  await db.ref('catalog/v1').set(payload)
  console.log('OK · meta.version=', meta.version, 'itemCount=', meta.itemCount)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
