import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Trash2,
} from 'lucide-react'
import { useCanvasStore } from '@/stores/canvasStore'

export function LayersPanel() {
  const items = useCanvasStore((s) => s.items)
  const selectedId = useCanvasStore((s) => s.selectedId)
  const select = useCanvasStore((s) => s.select)
  const bringForward = useCanvasStore((s) => s.bringForward)
  const sendBackward = useCanvasStore((s) => s.sendBackward)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const sendToBack = useCanvasStore((s) => s.sendToBack)
  const removeItem = useCanvasStore((s) => s.removeItem)

  const sorted = [...items].sort((a, b) => b.zIndex - a.zIndex)

  if (sorted.length === 0) {
    return (
      <p className="p-3 text-xs text-zinc-500">
        No layers yet. Drag items from the library onto the canvas.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1 p-2">
      {sorted.map((item) => {
        const active = item.id === selectedId
        return (
          <li
            key={item.id}
            className={`rounded-md border px-2 py-1.5 ${
              active
                ? 'border-indigo-500/50 bg-indigo-500/10'
                : 'border-transparent hover:bg-zinc-900'
            }`}
          >
            <button
              type="button"
              className="w-full truncate text-left text-xs text-zinc-200"
              onClick={() => select(item.id)}
            >
              {item.title || item.type}
            </button>
            {active && (
              <div className="mt-1.5 flex flex-wrap gap-0.5">
                <IconBtn
                  title="Bring to front"
                  onClick={() => bringToFront(item.id)}
                >
                  <ChevronsUp className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn
                  title="Bring forward"
                  onClick={() => bringForward(item.id)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn
                  title="Send backward"
                  onClick={() => sendBackward(item.id)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn title="Send to back" onClick={() => sendToBack(item.id)}>
                  <ChevronsDown className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn
                  title="Delete"
                  onClick={() => removeItem(item.id)}
                  danger
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: ReactNode
  onClick: () => void
  title: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded p-1 ${
        danger
          ? 'text-red-300 hover:bg-red-500/10'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}
