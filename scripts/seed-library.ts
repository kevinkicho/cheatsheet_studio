/**
 * Seed Firestore libraryItems from the static catalog.
 *
 * VECTOR GRAPHICS: SEED_LIBRARY is LaTeX equations, markdown tables, and SVG
 * figures only (see docs/vector-graphics.md). This script overwrites system
 * docs with that vector catalog so cloud library matches sharp canvas paint.
 * Re-run after catalog upgrades: `npm run seed`
 *
 * Requires the Firebase Admin service account JSON in the project root
 * (gitignored). Never import this file from the Vite client.
 *
 * Usage: npm run seed
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { SEED_LIBRARY } from '../src/data/seedLibrary.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const saPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  resolve(root, 'mathstudy071026-firebase-adminsdk-fbsvc-8f16d1c05e.json')

if (!existsSync(saPath)) {
  console.error('Service account JSON not found at', saPath)
  process.exit(1)
}

const serviceAccount = JSON.parse(
  readFileSync(saPath, 'utf8'),
) as ServiceAccount

initializeApp({
  credential: cert(serviceAccount),
  projectId: 'mathstudy071026',
})

const db = getFirestore()

function assertVectorCatalog() {
  let eq = 0
  let tbl = 0
  let fig = 0
  for (const item of SEED_LIBRARY) {
    if (item.type === 'equation') {
      eq++
      if (!item.latex?.trim()) {
        throw new Error(`equation ${item.id} missing latex (vector type required)`)
      }
      if (item.imageUrl) {
        throw new Error(`equation ${item.id} must not use imageUrl`)
      }
    } else if (item.type === 'table') {
      tbl++
      if (!item.tableMarkdown?.trim()) {
        throw new Error(`table ${item.id} missing tableMarkdown`)
      }
    } else if (item.type === 'figure') {
      fig++
      const url = item.imageUrl ?? ''
      if (
        !/^data:image\/svg\+xml/i.test(url) &&
        !/\.svg(\?|#|$)/i.test(url)
      ) {
        throw new Error(
          `figure ${item.id} must be SVG vector (got non-SVG imageUrl)`,
        )
      }
    } else {
      throw new Error(`unknown type on ${item.id}: ${(item as { type: string }).type}`)
    }
  }
  console.log(
    `Vector catalog OK: ${eq} equations (LaTeX), ${tbl} tables (markdown), ${fig} figures (SVG)`,
  )
}

async function main() {
  assertVectorCatalog()
  console.log(`Seeding ${SEED_LIBRARY.length} library items…`)
  const batchSize = 400
  let batch = db.batch()
  let count = 0
  let ops = 0

  for (const item of SEED_LIBRARY) {
    const ref = db.collection('libraryItems').doc(item.id)
    batch.set(ref, {
      type: item.type,
      title: item.title,
      subject: item.subject,
      topic: item.topic,
      tags: item.tags,
      latex: item.latex ?? null,
      tableMarkdown: item.tableMarkdown ?? null,
      imageUrl: item.imageUrl ?? null,
      imagePath: item.imagePath ?? null,
      description: item.description ?? null,
      source: item.source ?? null,
      isSystem: true,
      createdAt: Timestamp.now(),
    })
    ops++
    count++
    if (ops >= batchSize) {
      await batch.commit()
      batch = db.batch()
      ops = 0
      console.log(`  committed ${count}…`)
    }
  }

  if (ops > 0) {
    await batch.commit()
  }

  console.log(`Done. Wrote ${count} documents to libraryItems.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
