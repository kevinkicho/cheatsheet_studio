/**
 * Credentials for optional Firestore push/pull (CLI + MCP).
 * Never hardcode secrets — use env vars or explicit CLI flags.
 *
 * Env (preferred for MCP / CI):
 *   CHEATSHEET_SA_PATH   — path to Firebase Admin service account JSON
 *   CHEATSHEET_UID       — default owner uid for push
 *   CHEATSHEET_PROJECT_ID — optional GCP project id
 *   CHEATSHEET_SHEET_ID  — optional default sheet id for pull/update
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

export type CloudAuthConfig = {
  serviceAccountPath: string
  ownerUid?: string
  projectId?: string
  defaultSheetId?: string
}

export function resolveCloudAuth(overrides?: {
  sa?: string
  uid?: string
  projectId?: string
  sheetId?: string
}): CloudAuthConfig {
  const serviceAccountPath =
    overrides?.sa ||
    process.env.CHEATSHEET_SA_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    ''

  if (!serviceAccountPath.trim()) {
    throw new Error(
      'Missing service account path. Set CHEATSHEET_SA_PATH or pass --sa <file.json>',
    )
  }

  const resolved = path.resolve(serviceAccountPath)
  if (!existsSync(resolved)) {
    throw new Error(`Service account file not found: ${resolved}`)
  }

  return {
    serviceAccountPath: resolved,
    ownerUid:
      overrides?.uid ||
      process.env.CHEATSHEET_UID ||
      process.env.FIREBASE_OWNER_UID ||
      undefined,
    projectId:
      overrides?.projectId ||
      process.env.CHEATSHEET_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      undefined,
    defaultSheetId:
      overrides?.sheetId || process.env.CHEATSHEET_SHEET_ID || undefined,
  }
}

export function requireOwnerUid(auth: CloudAuthConfig): string {
  if (!auth.ownerUid?.trim()) {
    throw new Error(
      'Missing owner uid. Set CHEATSHEET_UID or pass --uid <firebaseUid>',
    )
  }
  return auth.ownerUid.trim()
}
