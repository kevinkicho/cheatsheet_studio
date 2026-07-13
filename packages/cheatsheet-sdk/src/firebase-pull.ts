/**
 * Optional Firestore pull via firebase-admin.
 */
import type { SheetDocument } from './types'
import { SHEET_DOC_VERSION } from './types'
import { defaultCanvas } from './defaults'

export type PullOptions = {
  serviceAccountPath: string
  sheetId: string
  projectId?: string
}

/**
 * Download a sheet document from Firestore into portable SheetDocument form.
 */
export async function pullSheetFromFirestore(
  opts: PullOptions,
): Promise<SheetDocument> {
  const admin = await import('firebase-admin')
  const { readFileSync } = await import('node:fs')
  const path = await import('node:path')

  const abs = path.resolve(opts.serviceAccountPath)
  const sa = JSON.parse(readFileSync(abs, 'utf8')) as {
    project_id?: string
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(
        sa as import('firebase-admin').ServiceAccount,
      ),
      projectId: opts.projectId ?? sa.project_id,
    })
  }

  const snap = await admin.firestore().collection('sheets').doc(opts.sheetId).get()
  if (!snap.exists) {
    throw new Error(`Sheet not found: ${opts.sheetId}`)
  }
  const data = snap.data() ?? {}
  return {
    v: SHEET_DOC_VERSION,
    title: String(data.title ?? 'Untitled'),
    canvas: { ...defaultCanvas(), ...(data.canvas as object) },
    items: Array.isArray(data.items) ? data.items : [],
    folders: Array.isArray(data.folders) ? data.folders : [],
    meta: {
      source: `firestore:${opts.sheetId}`,
      notes: `pulled ${new Date().toISOString()}`,
    },
  }
}
