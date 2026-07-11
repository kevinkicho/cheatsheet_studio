import { create } from 'zustand'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  formatFirestoreError,
  stripUndefined,
} from '@/lib/firestoreSanitize'
import { promoteLocalImagesForCloud } from '@/lib/promoteLocalImages'
import {
  DEFAULT_CANVAS,
  type CanvasItem,
  type OutlinerFolder,
  type SheetCanvas,
} from '@/types'
import { useCanvasStore } from './canvasStore'
import { createId } from '@/lib/ids'

interface SheetMeta {
  id: string
  title: string
  updatedAt: number
  localOnly?: boolean
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'local'

interface SheetsState {
  sheets: SheetMeta[]
  loading: boolean
  activeSheetId: string | null
  cloudAvailable: boolean | null
  saveStatus: SaveStatus
  lastSavedAt: number | null
  /** Human-readable last cloud error (shown in top bar tooltip). */
  lastCloudError: string | null
  loadSheets: (uid: string) => Promise<void>
  createSheet: (uid: string, title?: string) => Promise<string>
  openSheet: (sheetId: string) => Promise<void>
  saveActiveSheet: (uid: string) => Promise<void>
  renameSheet: (sheetId: string, title: string) => Promise<void>
  deleteSheet: (sheetId: string) => Promise<void>
  ensureDefaultSheet: (uid: string) => Promise<void>
  /** Force another cloud bootstrap attempt (clears sticky local mode). */
  retryCloudSync: (uid: string) => Promise<void>
}

function openLocalSheet(title = 'Local sheet (offline)') {
  const id = `local_${createId()}`
  useCanvasStore.getState().loadSheet({
    sheetId: id,
    title,
    canvas: { ...DEFAULT_CANVAS },
    items: [],
  })
  return id
}

function buildSheetPayload(
  uid: string,
  title: string,
  canvas: SheetCanvas,
  items: CanvasItem[],
  now: number,
  includeCreatedAt: boolean,
  folders: OutlinerFolder[] = [],
) {
  const base = {
    ownerId: uid,
    title,
    updatedAt: now,
    canvas,
    items,
    folders,
    ...(includeCreatedAt ? { createdAt: now } : {}),
  }
  return stripUndefined(base)
}

export const useSheetsStore = create<SheetsState>((set, get) => ({
  sheets: [],
  loading: false,
  activeSheetId: null,
  cloudAvailable: null,
  saveStatus: 'idle',
  lastSavedAt: null,
  lastCloudError: null,

  loadSheets: async (uid) => {
    set({ loading: true })
    try {
      const q = query(
        collection(db, 'sheets'),
        where('ownerId', '==', uid),
        orderBy('updatedAt', 'desc'),
      )
      const snap = await getDocs(q)
      const sheets = snap.docs.map((d) => {
        const data = d.data()
        const updatedAt =
          data.updatedAt instanceof Timestamp
            ? data.updatedAt.toMillis()
            : (data.updatedAt as number) ?? Date.now()
        return {
          id: d.id,
          title: (data.title as string) ?? 'Untitled',
          updatedAt,
        }
      })
      set({
        sheets,
        loading: false,
        cloudAvailable: true,
        lastCloudError: null,
      })
    } catch (firstErr) {
      // Composite index may still be building — fall back to unordered query
      try {
        const q = query(collection(db, 'sheets'), where('ownerId', '==', uid))
        const snap = await getDocs(q)
        const sheets = snap.docs
          .map((d) => {
            const data = d.data()
            const updatedAt =
              data.updatedAt instanceof Timestamp
                ? data.updatedAt.toMillis()
                : (data.updatedAt as number) ?? Date.now()
            return {
              id: d.id,
              title: (data.title as string) ?? 'Untitled',
              updatedAt,
            }
          })
          .sort((a, b) => b.updatedAt - a.updatedAt)
        set({
          sheets,
          loading: false,
          cloudAvailable: true,
          lastCloudError: null,
        })
      } catch (e) {
        const msg = formatFirestoreError(e)
        console.warn('[sheets] Cloud load failed:', firstErr, e)
        set({
          loading: false,
          cloudAvailable: false,
          lastCloudError: msg,
        })
      }
    }
  },

  createSheet: async (uid, title = 'Untitled sheet') => {
    const now = Date.now()
    const payload = buildSheetPayload(
      uid,
      title,
      { ...DEFAULT_CANVAS },
      [],
      now,
      true,
    )

    // Always try the network — never permanently stuck in local-only mode
    try {
      const ref = await addDoc(collection(db, 'sheets'), payload)
      set((s) => ({
        sheets: [
          { id: ref.id, title, updatedAt: now },
          ...s.sheets.filter((sh) => !sh.localOnly),
        ],
        activeSheetId: ref.id,
        cloudAvailable: true,
        saveStatus: 'saved',
        lastSavedAt: now,
        lastCloudError: null,
      }))
      useCanvasStore.getState().loadSheet({
        sheetId: ref.id,
        title,
        canvas: { ...DEFAULT_CANVAS },
        items: [],
      })
      return ref.id
    } catch (e) {
      const msg = formatFirestoreError(e)
      console.warn('[sheets] create failed — local mode:', e)
      const id = openLocalSheet(title)
      set((s) => ({
        sheets: [
          { id, title, updatedAt: now, localOnly: true },
          ...s.sheets,
        ],
        activeSheetId: id,
        cloudAvailable: false,
        saveStatus: 'local',
        lastCloudError: msg,
      }))
      return id
    }
  },

  openSheet: async (sheetId) => {
    if (sheetId.startsWith('local_')) {
      if (useCanvasStore.getState().sheetId !== sheetId) {
        useCanvasStore.getState().loadSheet({
          sheetId,
          title: 'Local sheet',
          canvas: { ...DEFAULT_CANVAS },
          items: [],
        })
      }
      set({ activeSheetId: sheetId, saveStatus: 'local' })
      return
    }

    try {
      const snap = await getDoc(doc(db, 'sheets', sheetId))
      if (!snap.exists()) {
        set({ lastCloudError: `Sheet ${sheetId} not found` })
        return
      }
      const data = snap.data()
      const canvas = (data.canvas as SheetCanvas) ?? { ...DEFAULT_CANVAS }
      const items = (data.items as CanvasItem[]) ?? []
      const folders = (data.folders as OutlinerFolder[]) ?? []
      useCanvasStore.getState().loadSheet({
        sheetId,
        title: (data.title as string) ?? 'Untitled sheet',
        canvas,
        items,
        folders,
      })
      set({
        activeSheetId: sheetId,
        cloudAvailable: true,
        saveStatus: 'saved',
        lastCloudError: null,
      })
    } catch (e) {
      console.warn('[sheets] open failed:', e)
      set({ lastCloudError: formatFirestoreError(e) })
    }
  },

  saveActiveSheet: async (uid) => {
    const canvasState = useCanvasStore.getState()
    const sheetId = canvasState.sheetId ?? get().activeSheetId
    const now = Date.now()

    set({ saveStatus: 'saving', lastCloudError: null })

    // Lift IndexedDB images → Storage URLs; drop dead blob: links
    let itemsForSave = canvasState.items
    try {
      const promoted = await promoteLocalImagesForCloud(uid, canvasState.items)
      itemsForSave = promoted.items
      if (promoted.changed) {
        useCanvasStore.setState({ items: itemsForSave, dirty: true })
      }
    } catch (e) {
      console.warn('[sheets] local image promote skipped:', e)
    }

    // Local sheet → create a real Firestore document (first successful cloud save)
    if (!sheetId || sheetId.startsWith('local_')) {
      try {
        const payload = buildSheetPayload(
          uid,
          canvasState.title,
          canvasState.canvas,
          itemsForSave,
          now,
          true,
          canvasState.folders,
        )
        const ref = await addDoc(collection(db, 'sheets'), payload)
        const oldLocal = sheetId
        useCanvasStore.setState({ sheetId: ref.id, dirty: false })
        set((s) => ({
          activeSheetId: ref.id,
          cloudAvailable: true,
          saveStatus: 'saved',
          lastSavedAt: now,
          lastCloudError: null,
          sheets: [
            { id: ref.id, title: canvasState.title, updatedAt: now },
            ...s.sheets.filter((sh) => sh.id !== oldLocal && !sh.localOnly),
          ],
        }))
        return
      } catch (e) {
        const msg = formatFirestoreError(e)
        console.warn('[sheets] promote local→cloud failed:', e)
        set({
          cloudAvailable: false,
          saveStatus: 'error',
          lastCloudError: msg,
        })
        return
      }
    }

    try {
      const payload = buildSheetPayload(
        uid,
        canvasState.title,
        canvasState.canvas,
        itemsForSave,
        now,
        false,
        canvasState.folders,
      )
      await updateDoc(doc(db, 'sheets', sheetId), payload)
      useCanvasStore.getState().markClean()
      set((s) => ({
        cloudAvailable: true,
        saveStatus: 'saved',
        lastSavedAt: now,
        lastCloudError: null,
        sheets: s.sheets
          .map((sh) =>
            sh.id === sheetId
              ? { ...sh, title: canvasState.title, updatedAt: now }
              : sh,
          )
          .sort((a, b) => b.updatedAt - a.updatedAt),
      }))
    } catch (e) {
      const msg = formatFirestoreError(e)
      console.warn('[sheets] save failed:', e)
      set({
        cloudAvailable: false,
        saveStatus: 'error',
        lastCloudError: msg,
      })
    }
  },

  renameSheet: async (sheetId, title) => {
    if (!sheetId.startsWith('local_')) {
      try {
        await updateDoc(doc(db, 'sheets', sheetId), {
          title,
          updatedAt: Date.now(),
        })
      } catch {
        /* local title still updates */
      }
    }
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === sheetId ? { ...sh, title, updatedAt: Date.now() } : sh,
      ),
    }))
    if (useCanvasStore.getState().sheetId === sheetId) {
      useCanvasStore.getState().setTitle(title)
      useCanvasStore.getState().markClean()
    }
  },

  deleteSheet: async (sheetId) => {
    if (!sheetId.startsWith('local_')) {
      try {
        await deleteDoc(doc(db, 'sheets', sheetId))
      } catch {
        /* ignore */
      }
    }
    set((s) => ({
      sheets: s.sheets.filter((sh) => sh.id !== sheetId),
      activeSheetId:
        s.activeSheetId === sheetId ? null : s.activeSheetId,
    }))
  },

  /**
   * Prefer cloud sheet. Only fall back to local_* if Firestore truly fails.
   * Avoids getting stuck on "Local only" after a successful rules deploy.
   */
  ensureDefaultSheet: async (uid) => {
    const currentId = useCanvasStore.getState().sheetId

    // Already on a real cloud sheet — just refresh list
    if (currentId && !currentId.startsWith('local_')) {
      await get().loadSheets(uid)
      return
    }

    set({ saveStatus: 'saving', lastCloudError: null })

    try {
      await get().loadSheets(uid)
    } catch {
      /* loadSheets sets lastCloudError */
    }

    const { sheets, cloudAvailable } = get()
    const cloudSheets = sheets.filter((s) => !s.localOnly)

    if (cloudSheets.length > 0) {
      await get().openSheet(cloudSheets[0].id)
      return
    }

    // No cloud sheets yet — create one (even if a local_* placeholder exists)
    if (cloudAvailable !== false) {
      await get().createSheet(uid, 'My first sheet')
      // createSheet either opened a cloud sheet or fell back to local
      return
    }

    // Load failed: try a direct write as a second chance (rules/network blip)
    try {
      const now = Date.now()
      const canvasState = useCanvasStore.getState()
      const payload = buildSheetPayload(
        uid,
        canvasState.title || 'My first sheet',
        canvasState.canvas ?? { ...DEFAULT_CANVAS },
        canvasState.items ?? [],
        now,
        true,
        canvasState.folders ?? [],
      )
      const ref = await addDoc(collection(db, 'sheets'), payload)
      useCanvasStore.setState({ sheetId: ref.id, dirty: false })
      set({
        sheets: [
          {
            id: ref.id,
            title: canvasState.title || 'My first sheet',
            updatedAt: now,
          },
        ],
        activeSheetId: ref.id,
        cloudAvailable: true,
        saveStatus: 'saved',
        lastSavedAt: now,
        lastCloudError: null,
      })
    } catch (e) {
      const msg = formatFirestoreError(e)
      console.warn('[sheets] ensureDefaultSheet write failed:', e)
      if (!currentId) {
        const localId = openLocalSheet('My first sheet')
        set({
          sheets: [
            {
              id: localId,
              title: 'My first sheet',
              updatedAt: Date.now(),
              localOnly: true,
            },
          ],
          activeSheetId: localId,
          cloudAvailable: false,
          saveStatus: 'local',
          lastCloudError: msg,
        })
      } else {
        set({
          cloudAvailable: false,
          saveStatus: 'local',
          lastCloudError: msg,
        })
      }
    }
  },

  retryCloudSync: async (uid) => {
    set({
      cloudAvailable: null,
      lastCloudError: null,
      saveStatus: 'saving',
    })
    // Promote whatever is on the canvas (or create fresh)
    await get().saveActiveSheet(uid)
    if (get().cloudAvailable) {
      await get().loadSheets(uid)
    } else {
      // Full re-bootstrap
      const id = useCanvasStore.getState().sheetId
      if (id?.startsWith('local_')) {
        useCanvasStore.setState({ sheetId: null })
      }
      await get().ensureDefaultSheet(uid)
    }
  },
}))
