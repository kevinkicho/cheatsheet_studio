import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
  type Timestamp as Ts,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { stripUndefined } from '@/lib/firestoreSanitize'
import type { MermaidDiagramKind, MermaidFlowDirection } from '@/types'

export type StoredFlowchart = {
  id: string
  title: string
  mermaidSource: string
  mermaidKind: MermaidDiagramKind
  mermaidDirection: MermaidFlowDirection
  updatedAt: number
  createdAt: number
}

type FlowchartDoc = {
  ownerId: string
  title: string
  mermaidSource: string
  mermaidKind?: MermaidDiagramKind
  mermaidDirection?: MermaidFlowDirection
  updatedAt?: Ts | number
  createdAt?: Ts | number
}

function tsToMs(v: Ts | number | undefined): number {
  if (v instanceof Timestamp) return v.toMillis()
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return Date.now()
}

function mapDoc(id: string, data: FlowchartDoc): StoredFlowchart {
  return {
    id,
    title: (data.title || 'Untitled flowchart').trim() || 'Untitled flowchart',
    mermaidSource: data.mermaidSource ?? '',
    mermaidKind: data.mermaidKind ?? 'flowchart',
    mermaidDirection: data.mermaidDirection ?? 'TD',
    updatedAt: tsToMs(data.updatedAt),
    createdAt: tsToMs(data.createdAt),
  }
}

/** List the signed-in user's saved flowcharts (newest first). */
export async function listUserFlowcharts(
  uid: string,
): Promise<StoredFlowchart[]> {
  try {
    const q = query(
      collection(db, 'flowcharts'),
      where('ownerId', '==', uid),
      orderBy('updatedAt', 'desc'),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => mapDoc(d.id, d.data() as FlowchartDoc))
  } catch {
    // Index may be missing — unordered fallback
    const q = query(collection(db, 'flowcharts'), where('ownerId', '==', uid))
    const snap = await getDocs(q)
    return snap.docs
      .map((d) => mapDoc(d.id, d.data() as FlowchartDoc))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

export async function createUserFlowchart(
  uid: string,
  input: {
    title: string
    mermaidSource: string
    mermaidKind?: MermaidDiagramKind
    mermaidDirection?: MermaidFlowDirection
  },
): Promise<StoredFlowchart> {
  const payload = stripUndefined({
    ownerId: uid,
    title: input.title.trim() || 'Untitled flowchart',
    mermaidSource: input.mermaidSource,
    mermaidKind: input.mermaidKind ?? 'flowchart',
    mermaidDirection: input.mermaidDirection ?? 'TD',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  const ref = await addDoc(collection(db, 'flowcharts'), payload)
  const now = Date.now()
  return {
    id: ref.id,
    title: payload.title as string,
    mermaidSource: input.mermaidSource,
    mermaidKind: (payload.mermaidKind as MermaidDiagramKind) ?? 'flowchart',
    mermaidDirection:
      (payload.mermaidDirection as MermaidFlowDirection) ?? 'TD',
    createdAt: now,
    updatedAt: now,
  }
}

export async function updateUserFlowchart(
  id: string,
  input: {
    title?: string
    mermaidSource?: string
    mermaidKind?: MermaidDiagramKind
    mermaidDirection?: MermaidFlowDirection
  },
): Promise<void> {
  const patch = stripUndefined({
    ...input,
    title: input.title?.trim(),
    updatedAt: serverTimestamp(),
  })
  await updateDoc(doc(db, 'flowcharts', id), patch)
}

export async function deleteUserFlowchart(id: string): Promise<void> {
  await deleteDoc(doc(db, 'flowcharts', id))
}
