import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDocs = vi.fn()
const getDoc = vi.fn()
const addDoc = vi.fn()
const updateDoc = vi.fn()
const deleteDoc = vi.fn()
const collection = vi.fn(() => 'col')
const doc = vi.fn((...args: unknown[]) => ({ path: args.join('/') }))
const query = vi.fn((...args: unknown[]) => args)
const where = vi.fn((...args: unknown[]) => args)
const orderBy = vi.fn((...args: unknown[]) => args)

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: {},
  storage: {},
  googleProvider: {},
  logFirebaseSetup: () => {},
}))

vi.mock('firebase/firestore', () => ({
  collection: (...a: unknown[]) => (collection as (...x: unknown[]) => unknown)(...a),
  doc: (...a: unknown[]) => (doc as (...x: unknown[]) => unknown)(...a),
  query: (...a: unknown[]) => (query as (...x: unknown[]) => unknown)(...a),
  where: (...a: unknown[]) => (where as (...x: unknown[]) => unknown)(...a),
  orderBy: (...a: unknown[]) => (orderBy as (...x: unknown[]) => unknown)(...a),
  getDocs: (...a: unknown[]) => (getDocs as (...x: unknown[]) => unknown)(...a),
  getDoc: (...a: unknown[]) => (getDoc as (...x: unknown[]) => unknown)(...a),
  addDoc: (...a: unknown[]) => (addDoc as (...x: unknown[]) => unknown)(...a),
  updateDoc: (...a: unknown[]) =>
    (updateDoc as (...x: unknown[]) => unknown)(...a),
  deleteDoc: (...a: unknown[]) =>
    (deleteDoc as (...x: unknown[]) => unknown)(...a),
  Timestamp: class Timestamp {
    static fromMillis(ms: number) {
      return { toMillis: () => ms }
    }
    toMillis() {
      return 0
    }
  },
}))

vi.mock('@/lib/promoteLocalImages', () => ({
  promoteLocalImagesForCloud: async (_uid: string, items: unknown[]) => ({
    items,
    changed: false,
  }),
}))

import { useSheetsStore } from '@/stores/sheetsStore'
import { useCanvasStore } from '@/stores/canvasStore'
import { DEFAULT_CANVAS } from '@/types'

describe('sheetsStore (Firebase mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCanvasStore.getState().reset()
    useSheetsStore.setState({
      sheets: [],
      loading: false,
      activeSheetId: null,
      cloudAvailable: null,
      saveStatus: 'idle',
      lastSavedAt: null,
      lastCloudError: null,
    })
  })

  it('loadSheets maps cloud docs into sheet meta', async () => {
    getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 's1',
          data: () => ({
            title: 'Alpha',
            updatedAt: 1000,
          }),
        },
        {
          id: 's2',
          data: () => ({
            title: 'Beta',
            updatedAt: 2000,
          }),
        },
      ],
    })
    await useSheetsStore.getState().loadSheets('uid-1')
    const { sheets, loading, cloudAvailable } = useSheetsStore.getState()
    expect(loading).toBe(false)
    expect(cloudAvailable).toBe(true)
    expect(sheets).toEqual([
      { id: 's1', title: 'Alpha', updatedAt: 1000 },
      { id: 's2', title: 'Beta', updatedAt: 2000 },
    ])
  })

  it('loadSheets falls back gracefully on error', async () => {
    getDocs.mockRejectedValueOnce(new Error('offline'))
    // second attempt in catch also fails
    getDocs.mockRejectedValueOnce(new Error('offline'))
    await useSheetsStore.getState().loadSheets('uid-1')
    expect(useSheetsStore.getState().loading).toBe(false)
    expect(useSheetsStore.getState().cloudAvailable).toBe(false)
    expect(useSheetsStore.getState().lastCloudError).toBeTruthy()
  })

  it('createSheet uses cloud id when addDoc succeeds', async () => {
    addDoc.mockResolvedValueOnce({ id: 'cloud-new' })
    const id = await useSheetsStore.getState().createSheet('uid', 'New')
    expect(id).toBe('cloud-new')
    expect(useSheetsStore.getState().activeSheetId).toBe('cloud-new')
    expect(useSheetsStore.getState().saveStatus).toBe('saved')
    expect(useCanvasStore.getState().sheetId).toBe('cloud-new')
    expect(useCanvasStore.getState().title).toBe('New')
  })

  it('createSheet falls back to local_ sheet when cloud fails', async () => {
    addDoc.mockRejectedValueOnce({ code: 'permission-denied', message: 'no' })
    const id = await useSheetsStore.getState().createSheet('uid', 'Offline')
    expect(id.startsWith('local_')).toBe(true)
    expect(useSheetsStore.getState().saveStatus).toBe('local')
    expect(useSheetsStore.getState().cloudAvailable).toBe(false)
    expect(useCanvasStore.getState().sheetId).toBe(id)
  })

  it('openSheet loads local_ without network', async () => {
    await useSheetsStore.getState().openSheet('local_abc')
    expect(useSheetsStore.getState().activeSheetId).toBe('local_abc')
    expect(useSheetsStore.getState().saveStatus).toBe('local')
    expect(getDoc).not.toHaveBeenCalled()
  })

  it('openSheet loads cloud document into canvas store', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        title: 'From cloud',
        canvas: { ...DEFAULT_CANVAS, gridOpacity: 0.12 },
        items: [
          {
            id: 'c1',
            type: 'equation',
            x: 1,
            y: 2,
            width: 100,
            height: 40,
            zIndex: 1,
            latex: 'x',
          },
        ],
        folders: [],
      }),
    })
    await useSheetsStore.getState().openSheet('cloud-1')
    expect(useCanvasStore.getState().title).toBe('From cloud')
    expect(useCanvasStore.getState().items).toHaveLength(1)
    expect(useCanvasStore.getState().canvas.gridOpacity).toBe(0.12)
    expect(useSheetsStore.getState().activeSheetId).toBe('cloud-1')
  })

  it('deleteSheet removes cloud doc and list entry', async () => {
    useSheetsStore.setState({
      sheets: [
        { id: 's1', title: 'A', updatedAt: 1 },
        { id: 's2', title: 'B', updatedAt: 2 },
      ],
      activeSheetId: 's1',
    })
    useCanvasStore.getState().loadSheet({
      sheetId: 's1',
      title: 'A',
      canvas: { ...DEFAULT_CANVAS },
      items: [],
    })
    deleteDoc.mockResolvedValueOnce(undefined)
    // Remaining sheet open after delete
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        title: 'B',
        canvas: { ...DEFAULT_CANVAS },
        items: [],
        folders: [],
      }),
    })
    await useSheetsStore.getState().deleteSheet('s1')
    expect(deleteDoc).toHaveBeenCalled()
    expect(useSheetsStore.getState().sheets.map((s) => s.id)).toEqual(['s2'])
    // Workspace must not keep the deleted sheet id (ghost sheet)
    expect(useSheetsStore.getState().activeSheetId).toBe('s2')
    expect(useCanvasStore.getState().sheetId).toBe('s2')
  })

  it('deleteSheet of last sheet creates a fresh untitled sheet', async () => {
    useSheetsStore.setState({
      sheets: [{ id: 'only', title: 'Gone', updatedAt: 1 }],
      activeSheetId: 'only',
    })
    useCanvasStore.getState().loadSheet({
      sheetId: 'only',
      title: 'Gone',
      canvas: { ...DEFAULT_CANVAS },
      items: [],
    })
    deleteDoc.mockResolvedValueOnce(undefined)
    // createSheet path uses addDoc
    addDoc.mockResolvedValueOnce({ id: 'fresh-new' })
    await useSheetsStore.getState().deleteSheet('only', { uid: 'uid-test' })
    expect(useSheetsStore.getState().activeSheetId).toBe('fresh-new')
    expect(useCanvasStore.getState().sheetId).toBe('fresh-new')
    expect(useSheetsStore.getState().sheets.some((s) => s.id === 'only')).toBe(
      false,
    )
  })

  it('deleteSheet of non-active sheet does not switch workspace', async () => {
    useSheetsStore.setState({
      sheets: [
        { id: 'open', title: 'Open', updatedAt: 2 },
        { id: 'other', title: 'Other', updatedAt: 1 },
      ],
      activeSheetId: 'open',
    })
    useCanvasStore.getState().loadSheet({
      sheetId: 'open',
      title: 'Open',
      canvas: { ...DEFAULT_CANVAS },
      items: [],
    })
    deleteDoc.mockResolvedValueOnce(undefined)
    await useSheetsStore.getState().deleteSheet('other')
    expect(useSheetsStore.getState().sheets.map((s) => s.id)).toEqual(['open'])
    expect(useSheetsStore.getState().activeSheetId).toBe('open')
    expect(useCanvasStore.getState().sheetId).toBe('open')
  })

  it('renameSheet updates local list and cloud', async () => {
    useSheetsStore.setState({
      sheets: [{ id: 's1', title: 'Old', updatedAt: 1 }],
    })
    updateDoc.mockResolvedValueOnce(undefined)
    await useSheetsStore.getState().renameSheet('s1', 'Renamed')
    expect(useSheetsStore.getState().sheets[0]!.title).toBe('Renamed')
    expect(updateDoc).toHaveBeenCalled()
  })

  it('ensureDefaultSheet opens first cloud sheet after load', async () => {
    getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'existing',
          data: () => ({ title: 'E', updatedAt: 1 }),
        },
      ],
    })
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        title: 'E',
        canvas: { ...DEFAULT_CANVAS },
        items: [],
        folders: [],
      }),
    })
    await useSheetsStore.getState().ensureDefaultSheet('uid')
    expect(useSheetsStore.getState().activeSheetId).toBe('existing')
    expect(useCanvasStore.getState().sheetId).toBe('existing')
  })
})

