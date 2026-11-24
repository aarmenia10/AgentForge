import { toHex } from '@/theme/appearance'
import type { AtomPalette } from '@/theme/atomPalette'
import { interleave, type AtomItems, type HomeItem } from '@/lib/homeFeed'
import { Link } from '@/router/Router'

// Three ellipses 60 degrees apart, like the rings of the 3D atom.
const RINGS = [-30, 30, 90]
const RX = 168
const RY = 62

const KIND_LABEL = { agent: 'Agent', skill: 'Skill', council: 'Council' }

function place(ring: number, angle: number) {
  const turn = (RINGS[ring] * Math.PI) / 180
  const x = RX * Math.cos(angle)
  const y = RY * Math.sin(angle)
  return {
    x: x * Math.cos(turn) - y * Math.sin(turn),
    y: x * Math.sin(turn) + y * Math.cos(turn),
  }
}

interface AtomFallbackProps {
  palette: AtomPalette
  items: AtomItems | null
  /**
   * Make the electrons links. Off while the 3D atom is about to replace this
   * one, so the same items are never offered twice to a keyboard.
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
  const list = items ? interleave(items) : []
  const perRing = [0, 1, 2].map(
    (ring) => list.filter((_, i) => i % 3 === ring).length,
  )
  const slot = [0, 0, 0]
  const electrons = list.map((item, i) => {
    const ring = i % 3
    const angle = (slot[ring]++ / perRing[ring]) * Math.PI * 2 + ring * 0.9
    return { item, ...place(ring, angle) }
  })
  const accent = toHex(palette.accent)

  return (
    <svg
      viewBox="-200 -200 400 400"
      className="absolute inset-0 size-full"
      aria-hidden={interactive ? undefined : true}
      role={interactive ? 'group' : undefined}
      aria-label={
        interactive ? 'Agents and skills orbiting the Council' : undefined
      }
    >
      {RINGS.map((turn) => (
        <ellipse
          key={turn}
          rx={RX}
          ry={RY}
          transform={`rotate(${turn})`}
          fill="none"
          stroke={toHex(palette.ring)}
          strokeWidth={1.6}
        />
      ))}
      <circle r={84} fill={accent} opacity={0.1} />
      <circle r={60} fill={accent} opacity={0.2} />
      <circle r={44} fill={accent} />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={15}
        fontWeight={600}
        fill={toHex(palette.accentInk)}
      >
        Council
      </text>
      {electrons.map(({ item, x, y }) => (
        <Electron
          key={`${item.kind}:${item.id}`}
          item={item}
          x={x}
          y={y}
          fill={toHex(item.kind === 'agent' ? palette.agent : palette.skill)}
          interactive={interactive}
        />
      ))}
    </svg>
  )
}

function Electron({
  item,
  x,
  y,
  fill,
  interactive,
}: {
  item: HomeItem
  x: number
  y: number
  fill: string
  interactive: boolean
}) {
  const circle = <circle cx={x} cy={y} r={9} fill={fill} />
  if (!interactive) return circle
  return (
    <Link
      to={item.to}
      aria-label={`${KIND_LABEL[item.kind]}: ${item.name}`}
      className="outline-offset-4 hover:opacity-80"
    >
      <title>{item.name}</title>
      {/* A larger invisible target, so the small electron is easy to hit. */}
      <circle cx={x} cy={y} r={20} fill="transparent" />
      {circle}
    </Link>
  )
}
