import { Cloud } from 'lucide-react'
import type { NodeShape, Direction, Theme, CurveStyle } from '../lib/store'

export function ShapeIcon({ shape, stroke = '#6b7280', fill = 'white' }: { shape: NodeShape; stroke?: string; fill?: string }) {
  const sw = 1.5
  switch (shape) {
    case 'rectangle':
      return <svg viewBox="0 0 24 16" className="w-6 h-4"><rect x={1} y={2} width={22} height={12} rx={1} fill={fill} stroke={stroke} strokeWidth={sw} /></svg>
    case 'rounded':
      return <svg viewBox="0 0 24 16" className="w-6 h-4"><rect x={1} y={2} width={22} height={12} rx={5} fill={fill} stroke={stroke} strokeWidth={sw} /></svg>
    case 'stadium':
      return <svg viewBox="0 0 24 16" className="w-6 h-4"><rect x={1} y={2} width={22} height={12} rx={7} fill={fill} stroke={stroke} strokeWidth={sw} /></svg>
    case 'cloud':
      return (
        <Cloud
          className="h-4 w-5"
          stroke={stroke}
          fill={fill === 'white' || fill === 'transparent' ? 'none' : fill}
          strokeWidth={sw}
          aria-hidden
        />
      )
    case 'subroutine':
      return <svg viewBox="0 0 24 16" className="w-6 h-4"><rect x={2} y={3} width={20} height={10} rx={1} fill={fill} stroke={stroke} strokeWidth={sw} /><rect x={4} y={5} width={16} height={6} fill="none" stroke={stroke} strokeWidth={0.8} /></svg>
    case 'cylinder':
      return <svg viewBox="0 0 24 18" className="w-6 h-4"><rect x={2} y={5} width={20} height={10} fill={fill} stroke={stroke} strokeWidth={sw} /><ellipse cx={12} cy={5} rx={10} ry={3} fill={fill} stroke={stroke} strokeWidth={sw} /><ellipse cx={12} cy={15} rx={10} ry={3} fill={fill} stroke={stroke} strokeWidth={sw} /></svg>
    case 'circle':
      return <svg viewBox="0 0 16 16" className="w-4 h-4"><circle cx={8} cy={8} r={6} fill={fill} stroke={stroke} strokeWidth={sw} /></svg>
    case 'double-circle':
      return <svg viewBox="0 0 16 16" className="w-4 h-4"><circle cx={8} cy={8} r={6} fill={fill} stroke={stroke} strokeWidth={sw} /><circle cx={8} cy={8} r={4} fill="none" stroke={stroke} strokeWidth={0.8} /></svg>
    case 'diamond':
      return <svg viewBox="0 0 16 16" className="w-4 h-4"><polygon points="8,1 15,8 8,15 1,8" fill={fill} stroke={stroke} strokeWidth={sw} /></svg>
    case 'hexagon':
      return <svg viewBox="0 0 24 16" className="w-6 h-4"><polygon points="7,2 17,2 23,8 17,14 7,14 1,8" fill={fill} stroke={stroke} strokeWidth={sw} /></svg>
    case 'parallelogram':
      return <svg viewBox="0 0 24 16" className="w-6 h-4"><polygon points="5,2 23,2 19,14 1,14" fill={fill} stroke={stroke} strokeWidth={sw} /></svg>
    case 'parallelogram-alt':
      return <svg viewBox="0 0 24 16" className="w-6 h-4"><polygon points="1,2 19,2 23,14 5,14" fill={fill} stroke={stroke} strokeWidth={sw} /></svg>
    case 'trapezoid':
      return <svg viewBox="0 0 24 16" className="w-6 h-4"><polygon points="1,2 23,2 20,14 4,14" fill={fill} stroke={stroke} strokeWidth={sw} /></svg>
    case 'trapezoid-alt':
      return <svg viewBox="0 0 24 16" className="w-6 h-4"><polygon points="4,2 20,2 23,14 1,14" fill={fill} stroke={stroke} strokeWidth={sw} /></svg>
    case 'asymmetric':
      return <svg viewBox="0 0 24 16" className="w-6 h-4"><polygon points="1,2 19,2 23,8 19,14 1,14" fill={fill} stroke={stroke} strokeWidth={sw} /></svg>
    case 'bang':
      // Exploding / starburst bubble (Mermaid mindmap bang)
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5">
          <polygon
            points="12,1 14.5,8 22,8.5 16,13.5 18,21 12,17 6,21 8,13.5 2,8.5 9.5,8"
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </svg>
      )
    default:
      // Unknown shape — never silently render the wrong icon
      return (
        <svg viewBox="0 0 24 16" className="w-6 h-4">
          <rect
            x={1}
            y={2}
            width={22}
            height={12}
            rx={1}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
          />
        </svg>
      )
  }
}

/**
 * Flowchart Object Settings / shape picker only.
 * Order is fixed; each `shape` id must match ShapeIcon + FlowNode rendering 1:1.
 * Do NOT include mindmap-only shapes (`bang`, `cloud`).
 */
export const ALL_SHAPES: { shape: NodeShape; label: string }[] = [
  { shape: 'rectangle', label: 'Rectangle' },
  { shape: 'rounded', label: 'Rounded rectangle' },
  { shape: 'stadium', label: 'Stadium / pill' },
  { shape: 'diamond', label: 'Diamond' },
  { shape: 'circle', label: 'Circle' },
  { shape: 'double-circle', label: 'Double circle' },
  { shape: 'hexagon', label: 'Hexagon' },
  { shape: 'subroutine', label: 'Subroutine' },
  { shape: 'cylinder', label: 'Cylinder / DB' },
  { shape: 'parallelogram', label: 'Parallelogram' },
  { shape: 'parallelogram-alt', label: 'Parallelogram alt' },
  { shape: 'trapezoid', label: 'Trapezoid' },
  { shape: 'trapezoid-alt', label: 'Trapezoid alt' },
  { shape: 'asymmetric', label: 'Asymmetric / flag' },
]

/** @deprecated use ALL_SHAPES — alias for callers */
export const FLOWCHART_SHAPES = ALL_SHAPES

export const DIRECTIONS: { value: Direction; label: string; title: string }[] = [
  { value: 'TD', label: '↓', title: 'Top → Down' },
  { value: 'LR', label: '→', title: 'Left → Right' },
  { value: 'BT', label: '↑', title: 'Bottom → Top' },
  { value: 'RL', label: '←', title: 'Right → Left' },
]

export const THEMES: { value: Theme; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'dark',    label: 'Dark' },
  { value: 'forest',  label: 'Forest' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'base',    label: 'Base' },
]

export const CURVE_STYLES: { value: CurveStyle; label: string }[] = [
  { value: 'basis',      label: 'Basis' },
  { value: 'linear',     label: 'Linear' },
  { value: 'cardinal',   label: 'Cardinal' },
  { value: 'catmullRom', label: 'Catmull-Rom' },
  { value: 'step',       label: 'Step' },
  { value: 'stepAfter',  label: 'Step After' },
  { value: 'stepBefore', label: 'Step Before' },
  { value: 'natural',    label: 'Natural' },
  { value: 'monotoneX',  label: 'Monotone X' },
  { value: 'monotoneY',  label: 'Monotone Y' },
  { value: 'bumpX',      label: 'Bump X' },
  { value: 'bumpY',      label: 'Bump Y' },
]
