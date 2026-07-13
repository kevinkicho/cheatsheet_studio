/**
 * Optional Firestore push via firebase-admin (peer / monorepo devDependency).
 * Never imported by the React app bundle.
 */
import type { FirestoreSheetPayload, SheetDocument } from './types'
import { SheetBuilder } from './builder'

export type PushOptions = {
  /** Absolute or relative path to Firebase Admin service account JSON. */
  serviceAccountPath: string
  ownerId: string
  /** Update existing sheet id instead of creating. */
  sheetId?: string
  projectId?: string
}

export type PushResult = {
  sheetId: string
  created: boolean
}

/**
 * Write a SheetDocument to Firestore `sheets` collection.
 * Requires `firebase-admin` installed (root already has it for seed scripts).
 */
export async function pushSheetToFirestore(
  sheet: SheetDocument,
  opts: PushOptions,
): Promise<PushResult> {
  // Dynamic import so SDK consumers without admin never load it
  const admin = await import('firebase-admin')
  const { readFileSync } = await import('node:fs')
  const path = await import('node:path')

  const abs = path.resolve(opts.serviceAccountPath)
  const sa = JSON.parse(readFileSync(abs, 'utf8')) as {
    project_id?: string
    client_email?: string
    private_key?: string
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa as admin.ServiceAccount),
      projectId: opts.projectId ?? sa.project_id,
    })
  }

  const db = admin.firestore()
  const builder = SheetBuilder.fromDocument(sheet)
  const payload: FirestoreSheetPayload = builder.toFirestorePayload(
    opts.ownerId,
    { createdAt: !opts.sheetId },
  )

  if (opts.sheetId) {
    const { createdAt: _c, ...update } = payload
    await db.collection('sheets').doc(opts.sheetId).set(update, { merge: true })
    return { sheetId: opts.sheetId, created: false }
  }

  const ref = await db.collection('sheets').add(payload)
  return { sheetId: ref.id, created: true }
}
