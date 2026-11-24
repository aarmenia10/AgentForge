/**
 * Layout of the home page lemon press, in the scene's own units (the SVG
 * viewBox). Pure: no React and no DOM, so tests can check it.
 *
 * Top to bottom: a press holds the lemon, juice drips from its spout into a
 * glass prism, and three streams leave the prism for three cups on pedestals.
 * One lemon, built once, poured into Agents, Skills, and Councils.
 */

export type Pt = readonly [number, number]

export const VIEW = { w: 1000, h: 970 } as const

/** The lemon's centre. Its outline is `lemonPath()` around this point. */
export const LEMON: Pt = [540, 190]
/** Where the two press arms meet. They turn around it when squeezed. */
export const HINGE: Pt = [300, 190]
/** The tip of the lower jaw's spout, where drops form. */
export const SPOUT: Pt = [540, 346]

export const PRISM = {
  apex: [540, 458] as Pt,
  left: [448, 612] as Pt,
  right: [632, 612] as Pt,
  /** The back edge, offset up and to the right, gives the prism its depth. */
  depth: [28, -13] as Pt,
}
/** Drops vanish into the prism here. */
export const DROP_END_Y = PRISM.apex[1] - 2

export const CUP = {
  top: 742,
  bottom: 868,
  topHalf: 76,
  bottomHalf: 62,
  radius: 18,
} as const

export const PEDESTAL = { top: 876, face: 896, bottom: 918, half: 104 }

export interface CupSpec {
  key: 'agents' | 'skills' | 'councils'
  label: string
  to: string
  cx: number
  /** How full the cup is, 0 to 1. */
  level: number
}

export const CUPS: readonly CupSpec[] = [
  { key: 'agents', label: 'Agents', to: '/agents', cx: 300, level: 0.48 },
  { key: 'skills', label: 'Skills', to: '/skills', cx: 540, level: 0.6 },
  { key: 'councils', label: 'Councils', to: '/councils', cx: 780, level: 0.7 },
]

/** The height of the juice's surface in a cup filled to `level`. */
export function surfaceY(level: number): number {
  return CUP.bottom - (CUP.bottom - CUP.top - 12) * level
}

/** Half the cup's inside width at height `y` (the glass narrows downwards). */
export function cupHalfWidthAt(y: number): number {
  const t = (y - CUP.top) / (CUP.bottom - CUP.top)
  return CUP.topHalf + (CUP.bottomHalf - CUP.topHalf) * t
}

/** Points on the prism's two front faces where the outer streams leave. */
const EXIT_T = 0.62
const lerp = (a: Pt, b: Pt, t: number): Pt => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]
export const PRISM_EXITS: readonly Pt[] = [
  lerp(PRISM.apex, PRISM.left, EXIT_T),
  [PRISM.apex[0], PRISM.left[1]],
  lerp(PRISM.apex, PRISM.right, EXIT_T),
]

/** Centre lines of the three streams, prism to juice surface. */
export const STREAMS: readonly (readonly Pt[])[] = CUPS.map((cup, i) => {
  const exit = PRISM_EXITS[i]
  const end: Pt = [cup.cx, surfaceY(cup.level)]
  if (exit[0] === cup.cx) return [exit, end]
  // Leave the prism at 30 degrees below the horizontal, then fall straight.
  const run = Math.abs(cup.cx - exit[0])
  return [exit, [cup.cx, exit[1] + run * Math.tan(Math.PI / 6)], end]
})

/** Each stream is drawn as this many parallel lines, this far apart. */
export const STREAM_LINES = [-7, 0, 7] as const

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
export function cupPath(cx: number, inset = 0): string {
  const { top, bottom, topHalf, bottomHalf, radius } = CUP
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
    const cx = CUPS[i].cx
    if (
      Math.abs(x - cx) <= PEDESTAL.half + 6 &&
      y >= CUP.top - 30 &&
      y <= VIEW.h
    )
      return `cup-${i}` as Part
  }
  const [lx, ly] = LEMON
  const ex = (x - lx) / 110
  const ey = (y - ly) / 170
  if (ex * ex + ey * ey <= 1) return 'lemon'
  const cx = (PRISM.apex[0] + PRISM.left[0] + PRISM.right[0]) / 3
  const cy = (PRISM.apex[1] + PRISM.left[1] + PRISM.right[1]) / 3
  if (Math.hypot(x - cx - 12, y - cy) <= 92) return 'prism'
  for (let i = 0; i < STREAMS.length; i++)
    if (distanceToPolyline([x, y], STREAMS[i]) <= NEAR)
      return `stream-${i}` as Part
  return null
}
