import { useId } from 'react'
import { mix, toHex, type Rgb } from '@/theme/appearance'
import type { AtomPalette } from '@/theme/atomPalette'
import { interleave, type AtomItems, type HomeItem } from '@/lib/homeFeed'
import { Link } from '@/router/Router'

// Four tilted orbits, like the 3D atom. Each is drawn in two halves: the far
// half dim and behind the nucleus, the near half bright and in front of it.
const RINGS = [
  { turn: -28, rx: 172, ry: 56, warm: false },
  { turn: 34, rx: 160, ry: 62, warm: true },
  { turn: 92, rx: 178, ry: 50, warm: false },
  { turn: -4, rx: 150, ry: 116, warm: false },
]

const KIND_LABEL = { agent: 'Agent', skill: 'Skill', council: 'Council' }
const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

function place(ring: number, angle: number) {
  const { turn, rx, ry } = RINGS[ring]
  const t = (turn * Math.PI) / 180
  const x = rx * Math.cos(angle)
  const y = ry * Math.sin(angle)
  return {
    x: x * Math.cos(t) - y * Math.sin(t),
    y: x * Math.sin(t) + y * Math.cos(t),
    front: Math.sin(angle) > 0,
  }
}

// Nucleons: a Fibonacci sphere seen from the front, far ones first.
const NUCLEONS = Array.from({ length: 30 }, (_, i) => {
  const y = 1 - ((i + 0.5) / 30) * 2
  const r = Math.sqrt(1 - y * y)
  const a = i * 2.39996 + 0.6
  return { x: Math.cos(a) * r * 52, y: y * 52, z: Math.sin(a) * r, tone: i % 3 }
}).sort((a, b) => a.z - b.z)

// Dust: a fixed scatter of specks, a few of them large and soft.
const DUST = Array.from({ length: 34 }, (_, i) => {
  const s = Math.sin(i * 91.7) * 43758.5
  const t = Math.sin(i * 37.3) * 24634.6
  const u = s - Math.floor(s)
  const v = t - Math.floor(t)
  return { x: u * 400 - 200, y: v * 400 - 200, r: i % 9 === 0 ? 4 : 0.8 + v }
})

interface AtomFallbackProps {
  palette: AtomPalette
  items: AtomItems | null
  /**
   * Make the electrons and the nucleus links. Off while the 3D atom is about
   * to replace this one, so the same items are never offered twice to a
   * keyboard.
   */
  interactive: boolean
}

/**
 * The static atom: shown while the 3D one loads, and instead of it for visitors
 * who ask for reduced motion or whose browser has no WebGL.
 */
export function AtomFallback({
  palette,
  items,
  interactive,
}: AtomFallbackProps) {
  const id = useId().replace(/:/g, '')
  const list = items ? interleave(items) : []
  const perRing = RINGS.map(
    (_, ring) => list.filter((_, i) => i % RINGS.length === ring).length,
  )
  const slot = RINGS.map(() => 0)
  const electrons = list.map((item, i) => {
    const ring = i % RINGS.length
    const angle = (slot[ring]++ / perRing[ring]) * Math.PI * 2 + ring * 0.7 + 1
    return { item, ...place(ring, angle) }
  })
  const accent = toHex(palette.accent)
  const hot = toHex(mix(palette.accent, WHITE, 0.6))

  const rings = (front: boolean) =>
    RINGS.map(({ turn, rx, ry, warm }) => {
      const d = front
        ? `M${rx} 0A${rx} ${ry} 0 0 1 ${-rx} 0`
        : `M${-rx} 0A${rx} ${ry} 0 0 1 ${rx} 0`
      const color = toHex(warm ? palette.ringWarm : palette.ringCool)
      return (
        <g key={turn} transform={`rotate(${turn})`} fill="none" stroke={color}>
          <path
            d={d}
            strokeWidth={6}
            opacity={front ? 0.22 : 0.06}
            filter={`url(#${id}b)`}
          />
          <path d={d} strokeWidth={1.3} opacity={front ? 0.9 : 0.25} />
        </g>
      )
    })

  const dots = (front: boolean) =>
    electrons
      .filter((e) => e.front === front)
      .map(({ item, x, y }) => (
        <Electron
          key={`${item.kind}:${item.id}`}
          item={item}
          x={x}
          y={y}
          fill={toHex(item.kind === 'agent' ? palette.agent : palette.skill)}
          dim={!front}
          glow={`url(#${id}b)`}
          interactive={interactive}
        />
      ))

  const nucleus = (
    <g>
      <circle r={38} fill={hot} filter={`url(#${id}b)`} />
      {NUCLEONS.map(({ x, y, z, tone }, i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={14.5}
          fill={`url(#${id}n${tone})`}
          opacity={0.55 + 0.45 * ((z + 1) / 2)}
        />
      ))}
      <circle r={16} fill={hot} opacity={0.35} filter={`url(#${id}b)`} />
    </g>
  )

  return (
    <svg
      viewBox="-200 -200 400 400"
      className="absolute inset-0 size-full overflow-visible"
      aria-hidden={interactive ? undefined : true}
      role={interactive ? 'group' : undefined}
      aria-label={
        interactive ? 'Agents and skills orbiting the Council' : undefined
      }
    >
      <defs>
        <filter id={`${id}b`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <radialGradient id={`${id}g`}>
          <stop offset="0" stopColor={accent} stopOpacity="0.7" />
          <stop offset="0.4" stopColor={accent} stopOpacity="0.2" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        {palette.nucleons.map((tone, i) => (
          <radialGradient key={i} id={`${id}n${i}`} cx="0.35" cy="0.3">
            <stop offset="0" stopColor={toHex(mix(tone, WHITE, 0.75))} />
            <stop offset="0.4" stopColor={toHex(tone)} />
            <stop offset="1" stopColor={toHex(mix(tone, BLACK, 0.6))} />
          </radialGradient>
        ))}
      </defs>

      {DUST.map(({ x, y, r }, i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={r}
          fill={i % 5 ? '#fff4de' : accent}
          opacity={r > 3 ? 0.12 : 0.4}
          filter={r > 3 ? `url(#${id}b)` : undefined}
        />
      ))}
      <circle r={140} fill={`url(#${id}g)`} />
      {rings(false)}
      {dots(false)}
      {interactive ? (
        <Link
          to="/councils"
          aria-label="Council"
          className="outline-offset-4 hover:opacity-90"
        >
          <title>Council</title>
          {nucleus}
        </Link>
      ) : (
        nucleus
      )}
      {rings(true)}
      {dots(true)}
    </svg>
  )
}

function Electron({
  item,
  x,
  y,
  fill,
  dim,
  glow,
  interactive,
}: {
  item: HomeItem
  x: number
  y: number
  fill: string
  dim: boolean
  glow: string
  interactive: boolean
}) {
  const dot = (
    <g opacity={dim ? 0.5 : 1}>
      <circle cx={x} cy={y} r={11} fill={fill} opacity={0.6} filter={glow} />
      <circle cx={x} cy={y} r={5} fill={fill} />
      <circle cx={x} cy={y} r={2.2} fill="#fff" opacity={0.85} />
    </g>
  )
  if (!interactive) return dot
  return (
    <Link
      to={item.to}
      aria-label={`${KIND_LABEL[item.kind]}: ${item.name}`}
      className="outline-offset-4 hover:opacity-80"
    >
      <title>{item.name}</title>
      {/* A larger invisible target, so the small electron is easy to hit. */}
      <circle cx={x} cy={y} r={20} fill="transparent" />
      {dot}
    </Link>
  )
}
