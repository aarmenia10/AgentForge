/**
 * Layout of the home page lemon press, in the scene's own units (the SVG
 * viewBox). Pure: no React and no DOM, so tests can check it.
 *
 * The two lemon tips feed the upper cups. Their spouts feed opposite corners
 * of an inverted prism, whose point feeds the lower cup.
 */

export type Pt = readonly [number, number]

export const VIEW = { w: 1000, h: 970 } as const

export const LEMON: Pt = [540, 210]
export const TIPS: readonly Pt[] = [
  [398, 210],
  [682, 210],
]
export const HINGE: Pt = [540, 83]
export const HANDLE: Pt = [739, 29]
export const FRAME = { left: 350, right: 730, top: 81, bottom: 264 }

export const PRISM = {
  left: [443, 548] as Pt,
  right: [637, 548] as Pt,
  apex: [540, 692] as Pt,
  depth: [19, -13] as Pt,
}

export const CUP = {
  height: 108,
  topHalf: 74,
  bottomHalf: 60,
  radius: 15,
} as const
export const PEDESTAL = { top: 886, face: 902, bottom: 920, half: 96 }
export const SPOUT_LENGTH = 22

export interface CupSpec {
  key: 'agents' | 'skills' | 'councils'
  label: string
  to: string
  cx: number
  top: number
  level: number
}

export const CUPS: readonly CupSpec[] = [
  {
    key: 'agents',
    label: 'Agents',
    to: '/agents',
    cx: TIPS[0][0],
    top: 322,
    level: 0.48,
  },
  {
    key: 'skills',
    label: 'Skills',
    to: '/skills',
    cx: TIPS[1][0],
    top: 322,
    level: 0.6,
  },
  {
    key: 'councils',
    label: 'Councils',
    to: '/councils',
    cx: PRISM.apex[0],
    top: 770,
    level: 0.7,
  },
]

export function surfaceY(cup: CupSpec): number {
  return cup.top + CUP.height - (CUP.height - 12) * cup.level
}

export function cupHalfWidthAt(cup: CupSpec, y: number): number {
  const t = (y - cup.top) / CUP.height
  return CUP.topHalf + (CUP.bottomHalf - CUP.topHalf) * t
}

export const TOP_SPOUTS: readonly Pt[] = CUPS.slice(0, 2).map((cup) => [
  cup.cx,
  cup.top + CUP.height + SPOUT_LENGTH,
])

export const STREAMS: readonly (readonly Pt[])[] = [
  ...TOP_SPOUTS.map((tip, i) => {
    const corner = i === 0 ? PRISM.left : PRISM.right
    return [tip, [tip[0], tip[1] + 36] as Pt, corner]
  }),
  [PRISM.apex, [CUPS[2].cx, surfaceY(CUPS[2])]],
]

export const STREAM_LINES = [-4, 0, 4] as const

// ----------------------------------------------------------------- paths

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const len = (v: Pt) => Math.hypot(v[0], v[1])
const unit = (v: Pt): Pt => {
  const l = len(v) || 1
  return [v[0] / l, v[1] / l]
}
const fmt = (n: number) => String(Math.round(n * 10) / 10)

/**
 * The polyline moved sideways by `d` (positive is to the left when walking
 * from the first point), with mitred corners so parallel lines stay parallel.
 */
export function offsetPolyline(points: readonly Pt[], d: number): Pt[] {
  if (d === 0 || points.length < 2) return points.map((p) => [p[0], p[1]])
  const normals = points.slice(1).map((p, i) => {
    const [dx, dy] = unit(sub(p, points[i]))
    return [dy, -dx] as Pt
  })
  return points.map((p, i) => {
    const before = normals[Math.max(0, i - 1)]
    const after = normals[Math.min(normals.length - 1, i)]
    const sum: Pt = [before[0] + after[0], before[1] + after[1]]
    const dot = before[0] * after[0] + before[1] * after[1]
    const scale = d / (1 + dot)
    return [p[0] + sum[0] * scale, p[1] + sum[1] * scale]
  })
}

/** An SVG path through the points with each corner rounded to radius `r`. */
export function roundedPath(points: readonly Pt[], r: number): string {
  if (points.length === 0) return ''
  let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]
    const inLen = len(sub(p, points[i - 1]))
    const outLen = len(sub(points[i + 1], p))
    const radius = Math.min(r, inLen / 2, outLen / 2)
    const a = unit(sub(points[i - 1], p))
    const b = unit(sub(points[i + 1], p))
    d += ` L${fmt(p[0] + a[0] * radius)} ${fmt(p[1] + a[1] * radius)}`
    d += ` Q${fmt(p[0])} ${fmt(p[1])} ${fmt(p[0] + b[0] * radius)} ${fmt(p[1] + b[1] * radius)}`
  }
  const last = points[points.length - 1]
  return `${d} L${fmt(last[0])} ${fmt(last[1])}`
}

/** Length of a polyline, ignoring the small saving from rounded corners. */
export function polylineLength(points: readonly Pt[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++)
    total += len(sub(points[i], points[i - 1]))
  return total
}

/** The lemon's outline around (0, 0): a body with a nub at each end. */
export function lemonPath(): string {
  return [
    'M0 -112',
    'C8 -112 12 -105 17 -97',
    'C54 -88 76 -48 76 0',
    'C76 48 54 88 17 97',
    'C12 105 8 113 0 114',
    'C-8 113 -12 105 -17 97',
    'C-54 88 -76 48 -76 0',
    'C-76 -48 -54 -88 -17 -97',
    'C-12 -105 -8 -112 0 -112Z',
  ].join(' ')
}

/** The cup's glass outline (open at the top), for cup centre `cx`. */
export function cupPath({ cx, top }: CupSpec, inset = 0): string {
  const { topHalf, bottomHalf, radius } = CUP
  const bottom = top + CUP.height
  const t = topHalf - inset
  const b = bottomHalf - inset
  const y = bottom - inset
  const r = radius - inset
  return [
    `M${cx - t} ${top}`,
    `L${cx - b} ${y - r}`,
    `Q${cx - b + 1} ${y} ${cx - b + r} ${y}`,
    `L${cx + b - r} ${y}`,
    `Q${cx + b - 1} ${y} ${cx + b} ${y - r}`,
    `L${cx + t} ${top}`,
  ].join(' ')
}

// ------------------------------------------------------------ hit testing

export type Part =
  | 'lemon'
  | 'prism'
  | 'cup-0'
  | 'cup-1'
  | 'cup-2'
  | 'stream-0'
  | 'stream-1'
  | 'stream-2'

export const PARTS: readonly Part[] = [
  'lemon',
  'prism',
  'cup-0',
  'cup-1',
  'cup-2',
  'stream-0',
  'stream-1',
  'stream-2',
]

/** Distance from `p` to the nearest point of the polyline. */
export function distanceToPolyline(p: Pt, points: readonly Pt[]): number {
  let best = Infinity
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const ab = sub(points[i], a)
    const ap = sub(p, a)
    const l2 = ab[0] * ab[0] + ab[1] * ab[1] || 1
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / l2))
    best = Math.min(
      best,
      Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t)),
    )
  }
  return best
}

/** How near a pointer has to be to light a part up, in scene units. */
const NEAR = 26

/**
 * Which part of the scene is under or near the point, or null. Cups win over
 * streams (a stream ends inside its cup), and the press counts as the lemon.
 */
export function partAt(x: number, y: number): Part | null {
  for (let i = 0; i < CUPS.length; i++) {
    const cup = CUPS[i]
    const end =
      cup.key === 'councils' ? VIEW.h : cup.top + CUP.height + SPOUT_LENGTH
    if (
      Math.abs(x - cup.cx) <= CUP.topHalf + 8 &&
      y >= cup.top - 12 &&
      y <= end
    )
      return `cup-${i}` as Part
  }
  const frame: Pt[] = [
    [FRAME.left, FRAME.bottom],
    [FRAME.left, FRAME.top],
    [FRAME.right, FRAME.top],
    [FRAME.right, FRAME.bottom],
  ]
  if (
    distanceToPolyline([x, y], frame) < 18 ||
    distanceToPolyline([x, y], [HINGE, HANDLE]) < 21 ||
    (Math.abs(x - LEMON[0]) <= 146 && y >= HINGE[1] && y <= FRAME.bottom + 16)
  )
    return 'lemon'
  const fraction = (y - PRISM.left[1]) / (PRISM.apex[1] - PRISM.left[1])
  if (
    fraction >= -0.09 &&
    fraction <= 1.04 &&
    Math.abs(x - PRISM.apex[0]) <=
      (1 - fraction) * (PRISM.right[0] - PRISM.apex[0]) + 16
  )
    return 'prism'
  for (let i = 0; i < STREAMS.length; i++)
    if (distanceToPolyline([x, y], STREAMS[i]) <= NEAR)
      return `stream-${i}` as Part
  return null
}
