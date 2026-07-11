import { FilePlus2, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useSheetsStore } from '@/stores/sheetsStore'
import { useUiStore } from '@/stores/uiStore'

export function SheetsView() {
  const user = useAuthStore((s) => s.user)
  const sheets = useSheetsStore((s) => s.sheets)
  const loading = useSheetsStore((s) => s.loading)
  const createSheet = useSheetsStore((s) => s.createSheet)
  const openSheet = useSheetsStore((s) => s.openSheet)
  const deleteSheet = useSheetsStore((s) => s.deleteSheet)
  const setView = useUiStore((s) => s.setView)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <h1 className="text-sm font-semibold text-zinc-100">My sheets</h1>
        <button
          type="button"
          onClick={() => {
            if (user) void createSheet(user.uid).then(() => setView('workspace'))
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          New sheet
        </button>
        <button
          type="button"
          onClick={() => setView('workspace')}
          className="ml-auto text-xs text-indigo-300 hover:underline"
        >
          Back to workspace
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <p className="text-sm text-zinc-500">Loading sheets…</p>
        )}
        {!loading && sheets.length === 0 && (
          <p className="text-sm text-zinc-500">
            No sheets yet. Create one to get started.
          </p>
        )}
        <ul className="mx-auto max-w-2xl space-y-2">
          {sheets.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  void openSheet(s.id).then(() => setView('workspace'))
                }}
              >
                <p className="truncate text-sm font-medium text-zinc-100">
                  {s.title}
                </p>
                <p className="text-[11px] text-zinc-500">
                  Updated {new Date(s.updatedAt).toLocaleString()}
                </p>
              </button>
              <button
                type="button"
                title="Delete sheet"
                onClick={() => {
                  if (confirm(`Delete “${s.title}”?`)) {
                    void deleteSheet(s.id)
                  }
                }}
                className="rounded-md p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
