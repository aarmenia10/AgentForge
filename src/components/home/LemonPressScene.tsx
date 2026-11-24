import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { Link, useRoute } from '@/router/Router'
import { tokensFor } from '@/theme/appearance'
import { useTheme } from '@/theme/ThemeProvider'
import {
  CUP,
  CUPS,
  HINGE,
  LEMON,
  PEDESTAL,
  PRISM,
  PRISM_EXITS,
  STREAM_LINES,
  STREAMS,
  VIEW,
  cupHalfWidthAt,
  cupPath,
  lemonPath,
  offsetPolyline,
  partAt,
  roundedPath,
  surfaceY,
  type Part,
  type Pt,
} from './sceneGeometry'
import {
  startSceneMotion,
  type SceneMotion,
  type SceneNodes,
} from './sceneMotion'
import { scenePalette, type ScenePalette } from './scenePalette'

/** How long a cup sloshes before its page opens. */
const SLOSH_BEFORE_GO_MS = 380
const DROP_COUNT = 10
const STREAM_RADIUS = 46

/** The triangle shrunk towards its centre by `by` units. */
function insetTriangle(points: readonly Pt[], by: number): Pt[] {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length
  return points.map((p) => {
    const d = Math.hypot(p[0] - cx, p[1] - cy)
    const k = (d - by * 2) / d
    return [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]
  })
}

const pct = (n: number, of: number) => `${(n / of) * 100}%`
const pts = (list: readonly Pt[]) => list.map((p) => p.join(',')).join(' ')

function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const change = () => setReduced(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  return reduced
}

/** How far the page has scrolled through the first screen, 0 to 1. */
function scrollProgress(): number {
  return Math.max(0, Math.min(1, window.scrollY / (window.innerHeight * 0.9)))
}

/**
 * The home page background: a press squeezes one lemon, the juice drips into
 * a glass prism and leaves it as three streams that fill three cups, Agents,
 * Skills, and Councils. Build once, use everywhere.
 *
 * Drawn in SVG on two layers: a still one (glows, grid, lines, pedestals) and
 * a live one (press, lemon, prism, streams, juice, drops), each composited on
 * its own so a moving drop never repaints the glows. The cups are real links,
 * laid over the drawing, so keyboards and screen readers get them too.
 */
export default function LemonPressScene() {
  const { appearance } = useTheme()
  const { go } = useRoute()
  const reduced = useReducedMotion()
  const palette = useMemo(
    () => scenePalette(tokensFor(appearance).tokens),
    [appearance],
  )
  const root = useRef<HTMLDivElement>(null)
  const motion = useRef<SceneMotion | null>(null)
  const hot = useRef<Part | null>(null)
  const pending = useRef(0)

  useEffect(() => {
    const element = root.current
    if (!element) return
    const all = <T extends Element>(name: string) => [
      ...element.querySelectorAll<T>(`[data-lp="${name}"]`),
    ]
    const one = <T extends Element>(name: string) => all<T>(name)[0]
    const nodes: SceneNodes = {
      upperJaw: one('upper-jaw'),
      lowerJaw: one('lower-jaw'),
      lemon: one('lemon'),
      drops: all('drop'),
      flows: all('flow'),
      shimmer: one('shimmer'),
      prismCore: one('prism-core'),
      juice: CUPS.map((_, i) => ({
        body: one(`juice-${i}`),
        surface: one(`surface-${i}`),
        ring: one(`ring-${i}`),
      })),
    }
    const scene = startSceneMotion(nodes, { reduced })
    motion.current = scene

    // Run only while the tab is visible and the scene is on screen.
    let visible = !document.hidden
    let onScreen = true
    const update = () => scene.setRunning(visible && onScreen)
    const onVisibility = () => {
      visible = !document.hidden
      update()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting
            update()
          })
    observer?.observe(element)

    // Dim the scene a little as the page scrolls over it.
    let frame = 0
    const applyScroll = () => {
      frame = 0
      const progress = scrollProgress()
      scene.setScroll(progress)
      element.style.opacity = String(1 - progress * (palette.dark ? 0.22 : 0.3))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(applyScroll)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    applyScroll()
    update()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      observer?.disconnect()
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      window.clearTimeout(pending.current)
      scene.destroy()
      motion.current = null
    }
  }, [reduced, palette.dark])

  function setHot(part: Part | null) {
    if (hot.current === part) return
    hot.current = part
    const element = root.current
    if (!element) return
    element.dataset.hot = part ?? ''
    element.style.cursor = part === 'lemon' ? 'pointer' : ''
    if (part?.startsWith('cup-')) motion.current?.touchCup(Number(part[4]))
  }

  function toScene(event: { clientX: number; clientY: number }): Pt | null {
    const element = root.current
    if (!element) return null
    const box = element.getBoundingClientRect()
    if (!box.width || !box.height) return null
    return [
      ((event.clientX - box.left) / box.width) * VIEW.w,
      ((event.clientY - box.top) / box.height) * VIEW.h,
    ]
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const at = toScene(event)
    if (!at) return
    motion.current?.pointer(at[0], at[1])
    setHot(partAt(at[0], at[1]))
  }

  function onPointerLeave() {
    motion.current?.pointer(null, null)
    setHot(null)
  }

  function onClick(event: MouseEvent<HTMLDivElement>) {
    const at = toScene(event)
    if (at && partAt(at[0], at[1]) === 'lemon') {
      motion.current?.squeeze()
      // With reduced motion the lemon only brightens for a moment.
      const element = root.current
      if (element && reduced) {
        element.dataset.flash = 'on'
        window.setTimeout(() => delete element.dataset.flash, 450)
      }
    }
  }

  function onCup(event: MouseEvent<HTMLAnchorElement>, index: number) {
    const plain =
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    // Reduced motion, or a new-tab click: the link just goes.
    if (!plain || reduced) return
    event.preventDefault()
    motion.current?.slosh(index)
    window.clearTimeout(pending.current)
    const to = CUPS[index].to
    pending.current = window.setTimeout(() => go(to), SLOSH_BEFORE_GO_MS)
  }

  return (
    <div
      ref={root}
      className="lp-scene absolute inset-0"
      style={
        {
          '--lp-accent': palette.accent,
          '--lp-accent-light': palette.accentLight,
          '--lp-label': palette.label,
          '--lp-stage': palette.stage,
        } as CSSProperties
      }
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
      onPointerUp={(event) => {
        if (event.pointerType !== 'mouse') onPointerLeave()
      }}
      onClick={onClick}
    >
      {!palette.dark && <Stage color={palette.stage} />}
      <StillLayer p={palette} />
      <LiveLayer p={palette} />

      <div aria-hidden="true" className="lp-notes">
        <Note x={668} y={192} n="01" text="Build once" />
        <Note x={448} y={505} n="02" text="Combine" align="end" />
        <Note x={566} y={694} n="03" text="Use everywhere" />
      </div>

      <nav aria-label="Pour into">
        {CUPS.map((cup, i) => (
          <Link
            key={cup.key}
            to={cup.to}
            className="lp-cup-link"
            style={{
              left: pct(cup.cx - PEDESTAL.half, VIEW.w),
              top: pct(CUP.top - 34, VIEW.h),
              width: pct(PEDESTAL.half * 2, VIEW.w),
              height: pct(PEDESTAL.bottom - CUP.top + 34, VIEW.h),
            }}
            onClick={(event) => onCup(event, i)}
            onFocus={() => {
              setHot(`cup-${i}` as Part)
              // A cup reached by Tab while content covers it: show the scene.
              if (window.scrollY > window.innerHeight * 0.3)
                window.scrollTo({
                  top: 0,
                  behavior: reduced ? 'auto' : 'smooth',
                })
            }}
            onBlur={() => setHot(null)}
          >
            <span className="lp-cup-label">{cup.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}

function Note({
  x,
  y,
  n,
  text,
  align = 'start',
}: {
  x: number
  y: number
  n: string
  text: string
  align?: 'start' | 'end'
}) {
  return (
    <span
      className="lp-note"
      data-align={align}
      style={{ left: pct(x, VIEW.w), top: pct(y, VIEW.h) }}
    >
      <span className="lp-note-n">{n}</span>
      {text}
    </span>
  )
}

/** Light mode's patch of space (`.lp-stage`): glow needs darkness to read. */
function Stage({ color }: { color: string }) {
  return (
    <div
      aria-hidden="true"
      className="lp-stage"
      style={{ backgroundColor: color }}
    />
  )
}

// ------------------------------------------------------------------ layers

const svgProps = {
  viewBox: `0 0 ${VIEW.w} ${VIEW.h}`,
  'aria-hidden': true,
  focusable: false,
  className: 'lp-layer',
} as const

function Glow({
  id,
  color,
  peak,
}: {
  id: string
  color: string
  peak: number
}) {
  return (
    <radialGradient id={id}>
      <stop offset="0" stopColor={color} stopOpacity={peak} />
      <stop offset="0.45" stopColor={color} stopOpacity={peak * 0.32} />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </radialGradient>
  )
}

/** Glows, the grid, circuit lines, pedestals, and the cups' back walls. */
function StillLayer({ p }: { p: ScenePalette }) {
  const node = (x: number, y: number, lit = false) => (
    <g key={`${x},${y}`}>
      <circle
        cx={x}
        cy={y}
        r="4"
        fill={p.stage}
        stroke={p.lineStrong}
        strokeOpacity="0.6"
      />
      {lit && <circle cx={x} cy={y} r="1.6" fill={p.accent} />}
    </g>
  )
  const traces = [
    'M278 190H196L166 220V318',
    'M813 64H872L902 94V214',
    'M196 907H150L118 875V676',
    'M884 907H926L952 881V620',
    'M404 907H436',
    'M644 907H676',
    'M664 599H704L732 571V478',
    'M540 54V26H648',
    'M300 212V262L272 290H214',
  ]
  return (
    <svg {...svgProps}>
      <defs>
        <Glow id="lp-g-lemon" color={p.accent} peak={0.42} />
        <Glow id="lp-g-prism" color={p.accent} peak={0.3} />
        <Glow id="lp-g-cup" color={p.accent} peak={0.36} />
        <radialGradient id="lp-grid-fade">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="lp-grid-mask">
          <rect
            x="90"
            y="300"
            width="900"
            height="600"
            fill="url(#lp-grid-fade)"
          />
        </mask>
        <pattern
          id="lp-grid"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
          x="20"
          y="10"
        >
          <path d="M40 0H0V40" fill="none" stroke={p.line} strokeWidth="0.8" />
        </pattern>
        <linearGradient id="lp-ped-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.metalLight} />
          <stop offset="0.35" stopColor={p.metal} />
          <stop offset="1" stopColor={p.stage} />
        </linearGradient>
        <linearGradient id="lp-ped-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.metalLight} stopOpacity="0.9" />
          <stop offset="1" stopColor={p.metal} />
        </linearGradient>
      </defs>

      <circle cx={LEMON[0]} cy={LEMON[1]} r="240" fill="url(#lp-g-lemon)" />
      <ellipse cx="552" cy="556" rx="180" ry="150" fill="url(#lp-g-prism)" />
      {CUPS.map((cup) => (
        <ellipse
          key={cup.key}
          cx={cup.cx}
          cy="836"
          rx="150"
          ry="118"
          fill="url(#lp-g-cup)"
          opacity={0.55 + cup.level * 0.6}
        />
      ))}

      <rect
        x="90"
        y="300"
        width="900"
        height="600"
        fill="url(#lp-grid)"
        mask="url(#lp-grid-mask)"
        opacity="0.5"
      />

      <g fill="none" stroke={p.line} strokeWidth="1.1" strokeLinejoin="round">
        {traces.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {node(166, 318, true)}
      {node(902, 214)}
      {node(118, 676, true)}
      {node(952, 620)}
      {node(648, 26, true)}
      {node(214, 290)}
      {/* Crosshairs on the grid. */}
      <g stroke={p.lineStrong} strokeOpacity="0.45" strokeWidth="1">
        {[
          [200, 420],
          [880, 420],
          [160, 780],
          [920, 760],
        ].map(([x, y]) => (
          <path
            key={`${x}${y}`}
            d={`M${x - 6} ${y}H${x + 6}M${x} ${y - 6}V${y + 6}`}
          />
        ))}
      </g>
      {/* Small instrument chips with abstract marks, no text. */}
      <Chip x={120} y={330} p={p} />
      <Chip x={858} y={226} p={p} />
      <g transform="translate(732 466)">
        <circle r="11" fill={p.stage} stroke={p.line} strokeWidth="1.2" />
        <path
          d="M0 -11A11 11 0 1 1 -10.5 3.4"
          fill="none"
          stroke={p.accent}
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.85"
        />
      </g>

      {CUPS.map((cup) => (
        <Pedestal key={cup.key} cx={cup.cx} p={p} />
      ))}

      {/* The cups' back walls and the far half of each rim. */}
      {CUPS.map((cup) => (
        <g key={cup.key}>
          <path d={`${cupPath(cup.cx)}Z`} fill="#fff" fillOpacity="0.035" />
          <path
            d={`M${cup.cx - CUP.topHalf} ${CUP.top}A${CUP.topHalf} 11 0 0 1 ${cup.cx + CUP.topHalf} ${CUP.top}`}
            fill="none"
            stroke={p.lineStrong}
            strokeOpacity="0.5"
            strokeWidth="1.4"
          />
        </g>
      ))}
    </svg>
  )
}

function Chip({ x, y, p }: { x: number; y: number; p: ScenePalette }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width="72"
        height="20"
        rx="10"
        fill={p.stage}
        stroke={p.line}
        strokeWidth="1.1"
      />
      <circle cx="11" cy="10" r="3" fill={p.accent} />
      <rect x="20" y="8" width="24" height="4" rx="2" fill={p.line} />
      <rect
        x="48"
        y="8"
        width="14"
        height="4"
        rx="2"
        fill={p.line}
        opacity="0.6"
      />
    </g>
  )
}

function Pedestal({ cx, p }: { cx: number; p: ScenePalette }) {
  const { top, face, bottom, half } = PEDESTAL
  return (
    <g>
      <rect
        x={cx - half}
        y={face - 6}
        width={half * 2}
        height={bottom - face + 6}
        rx="7"
        fill="url(#lp-ped-front)"
      />
      <rect
        x={cx - half}
        y={top}
        width={half * 2}
        height={face - top}
        rx="9"
        fill="url(#lp-ped-top)"
        stroke={p.lineStrong}
        strokeOpacity="0.35"
      />
      {/* A charging-pad ring, lit by the juice above. */}
      <ellipse
        cx={cx}
        cy={(top + face) / 2}
        rx="74"
        ry="6.5"
        fill={p.accent}
        fillOpacity="0.14"
        stroke={p.accent}
        strokeOpacity="0.6"
        strokeWidth="1.3"
      />
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx={cx + half - 36 + i * 10}
          cy={(face + bottom) / 2}
          r="2"
          fill={i === 0 ? p.accent : p.line}
        />
      ))}
    </g>
  )
}

/** Press, lemon, prism, streams, juice, cups' front glass, and drops. */
function LiveLayer({ p }: { p: ScenePalette }) {
  const [px, py] = PRISM.apex
  const back = (pt: Pt): Pt => [pt[0] + PRISM.depth[0], pt[1] + PRISM.depth[1]]
  const front = [PRISM.apex, PRISM.left, PRISM.right]
  const side = [PRISM.apex, back(PRISM.apex), back(PRISM.right), PRISM.right]
  const entry: Pt = [px, py + 12]

  return (
    <svg {...svgProps}>
      <defs>
        <radialGradient id="lp-lemon" cx="0.36" cy="0.3" r="0.82">
          <stop offset="0" stopColor={p.accentLight} />
          <stop offset="0.42" stopColor={p.accent} />
          <stop offset="1" stopColor={p.accentDeep} />
        </radialGradient>
        <pattern
          id="lp-pores"
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1.5" cy="1.5" r="0.9" fill={p.accentDeep} />
          <circle cx="5" cy="4.8" r="0.7" fill={p.accentDeep} />
        </pattern>
        <radialGradient id="lp-juice-glow">
          <stop offset="0" stopColor={p.accentLight} stopOpacity="0.4" />
          <stop offset="1" stopColor={p.accentLight} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lp-bounce">
          <stop offset="0" stopColor={p.accentLight} stopOpacity="0.28" />
          <stop offset="1" stopColor={p.accentLight} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lp-spec">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <Glow id="lp-g-hot" color={p.accentLight} peak={0.4} />
        <Glow id="lp-g-core" color={p.accent} peak={0.95} />
        <linearGradient id="lp-juice" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.accent} stopOpacity="0.96" />
          <stop offset="1" stopColor={p.accentDeep} stopOpacity="0.96" />
        </linearGradient>
        <radialGradient id="lp-surface" cx="0.42" cy="0.4" r="0.7">
          <stop offset="0" stopColor={p.accentLight} />
          <stop offset="1" stopColor={p.accent} />
        </radialGradient>
        <linearGradient id="lp-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.11" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="0.85" stopColor="#fff" stopOpacity="0.03" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.09" />
        </linearGradient>
        <linearGradient id="lp-prism-front" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="lp-prism-side" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.01" />
        </linearGradient>
        <linearGradient
          id="lp-shimmer"
          data-lp="shimmer"
          gradientUnits="userSpaceOnUse"
          x1="470"
          y1="0"
          x2="530"
          y2="0"
        >
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="lp-drop" cx="0.35" cy="0.6" r="0.75">
          <stop offset="0" stopColor={p.accentLight} />
          <stop offset="1" stopColor={p.accent} />
        </radialGradient>
        <linearGradient id="lp-arm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.metalLight} />
          <stop offset="0.5" stopColor={p.metal} />
          <stop offset="1" stopColor={p.stage} />
        </linearGradient>
        {CUPS.map((cup, i) => (
          <clipPath key={cup.key} id={`lp-cup-${i}`}>
            <path d={`${cupPath(cup.cx, 3)}Z`} />
          </clipPath>
        ))}
      </defs>

      {/* Streams, behind the prism's faces and the cups' front glass. */}
      {STREAMS.map((line, i) => {
        const centre = roundedPath(line, STREAM_RADIUS)
        const lines = STREAM_LINES.map((d) =>
          roundedPath(offsetPolyline(line, d), STREAM_RADIUS),
        )
        return (
          <g key={i} fill="none" strokeLinecap="round">
            <path
              d={centre}
              stroke={p.accent}
              strokeWidth="26"
              strokeOpacity="0.07"
            />
            <path
              d={centre}
              stroke={p.accent}
              strokeWidth="9"
              strokeOpacity="0.2"
            />
            <path
              className={`lp-hot lp-hot-stream-${i}`}
              d={centre}
              stroke={p.accentLight}
              strokeWidth="16"
              strokeOpacity="0.28"
            />
            {lines.map((d, j) => (
              <path
                key={j}
                d={d}
                stroke={j === 1 ? p.accentLight : p.accent}
                strokeWidth={j === 1 ? 1.8 : 1.4}
                strokeOpacity={j === 1 ? 0.95 : 0.8}
              />
            ))}
            {lines.map((d, j) => (
              <path
                key={`f${j}`}
                data-lp="flow"
                d={d}
                stroke={p.accentLight}
                strokeWidth="2.6"
                strokeDasharray="18 132"
              />
            ))}
          </g>
        )
      })}

      {/* The prism: a glass triangle with depth, lit from inside. */}
      <g>
        <polygon
          points={pts(side)}
          fill="url(#lp-prism-side)"
          stroke={p.lineStrong}
          strokeOpacity="0.35"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <ellipse
          data-lp="prism-core"
          cx="544"
          cy="568"
          rx="72"
          ry="62"
          fill="url(#lp-g-core)"
          opacity="0.7"
        />
        <g
          stroke={p.accentLight}
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.75"
        >
          {PRISM_EXITS.map((exit, i) => (
            <line
              key={i}
              x1={entry[0]}
              y1={entry[1]}
              x2={exit[0]}
              y2={exit[1]}
            />
          ))}
        </g>
        <polygon
          points={pts(front)}
          fill="url(#lp-prism-front)"
          stroke={p.lineStrong}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <polygon points={pts(front)} fill="url(#lp-shimmer)" />
        {/* The glass's thickness: an inner edge just inside the outer one. */}
        <polygon
          points={pts(insetTriangle(front, 11))}
          fill="none"
          stroke="#fff"
          strokeOpacity="0.14"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <line
          x1={px}
          y1={py}
          x2={PRISM.left[0]}
          y2={PRISM.left[1]}
          stroke="#fff"
          strokeOpacity="0.55"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <polyline
          className="lp-hot lp-hot-prism"
          points={pts([
            PRISM.left,
            PRISM.apex,
            back(PRISM.apex),
            back(PRISM.right),
            PRISM.right,
            PRISM.left,
          ])}
          fill="none"
          stroke={p.accentLight}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle
          className="lp-hot lp-hot-prism"
          cx="548"
          cy="560"
          r="130"
          fill="url(#lp-g-hot)"
        />
        {PRISM_EXITS.map((exit, i) => (
          <circle
            key={i}
            cx={exit[0]}
            cy={exit[1]}
            r="3"
            fill={p.accentLight}
          />
        ))}
        <circle
          cx={px}
          cy={py}
          r="5"
          fill="none"
          stroke={p.accentLight}
          strokeOpacity="0.7"
        />
      </g>

      {/* Juice and the cups' front glass. */}
      {CUPS.map((cup, i) => {
        const sy = surfaceY(cup.level)
        const hw = cupHalfWidthAt(sy)
        const { top, bottom, topHalf } = CUP
        return (
          <g key={cup.key}>
            <ellipse
              className={`lp-hot lp-hot-cup-${i}`}
              cx={cup.cx}
              cy={sy}
              rx="150"
              ry="120"
              fill="url(#lp-g-hot)"
            />
            <g clipPath={`url(#lp-cup-${i})`}>
              <path
                data-lp={`juice-${i}`}
                d={`M${cup.cx - hw - 6} ${sy}H${cup.cx + hw + 6}V880H${cup.cx - hw - 6}Z`}
                fill="url(#lp-juice)"
              />
              <ellipse
                cx={cup.cx}
                cy={(sy + bottom) / 2 + 4}
                rx={hw * 0.8}
                ry={(bottom - sy) * 0.55}
                fill="url(#lp-juice-glow)"
              />
            </g>
            <ellipse
              data-lp={`surface-${i}`}
              cx={cup.cx}
              cy={sy}
              rx={hw - 3}
              ry="7"
              fill="url(#lp-surface)"
            />
            <ellipse
              data-lp={`ring-${i}`}
              cx={cup.cx}
              cy={sy}
              rx="20"
              ry="3"
              fill="none"
              stroke="#fff"
              strokeOpacity="0.85"
              strokeWidth="1.1"
              opacity="0"
            />
            <path
              d={cupPath(cup.cx)}
              fill="url(#lp-glass)"
              stroke={p.lineStrong}
              strokeOpacity="0.85"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d={`M${cup.cx - topHalf} ${top}A${topHalf} 11 0 0 0 ${cup.cx + topHalf} ${top}`}
              fill="none"
              stroke={p.lineStrong}
              strokeWidth="1.6"
            />
            <path
              d={`M${cup.cx - topHalf + 11} ${top + 16}L${cup.cx - topHalf + 21} ${bottom - 18}`}
              stroke="#fff"
              strokeOpacity="0.22"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d={`M${cup.cx + topHalf - 14} ${top + 20}L${cup.cx + topHalf - 17} ${top + 58}`}
              stroke="#fff"
              strokeOpacity="0.12"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Measure marks on the glass. */}
            <g stroke={p.lineStrong} strokeOpacity="0.5" strokeWidth="1">
              {[0.3, 0.55, 0.8].map((t) => {
                const y = bottom - (bottom - top) * t
                const x = cup.cx + cupHalfWidthAt(y) - 4
                return (
                  <path key={t} d={`M${x - (t === 0.55 ? 12 : 7)} ${y}H${x}`} />
                )
              })}
            </g>
            <ellipse
              cx={cup.cx}
              cy={bottom - 6}
              rx="48"
              ry="3.5"
              fill="none"
              stroke="#fff"
              strokeOpacity="0.14"
            />
            <path
              className={`lp-hot lp-hot-cup-${i}`}
              d={cupPath(cup.cx)}
              fill="none"
              stroke={p.accentLight}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <path
              className={`lp-hot lp-hot-cup-${i}`}
              d={`M${cup.cx - topHalf} ${top}A${topHalf} 11 0 0 0 ${cup.cx + topHalf} ${top}`}
              fill="none"
              stroke={p.accentLight}
              strokeWidth="2.2"
            />
          </g>
        )
      })}

      {/* The lemon, then the press over it. */}
      <circle
        className="lp-hot lp-hot-lemon lp-flash"
        cx={LEMON[0]}
        cy={LEMON[1]}
        r="190"
        fill="url(#lp-g-hot)"
      />
      <g data-lp="lemon" transform={`translate(${LEMON[0]} ${LEMON[1]})`}>
        <path d={lemonPath()} fill="url(#lp-lemon)" />
        <path d={lemonPath()} fill="url(#lp-pores)" opacity="0.26" />
        <ellipse cx="34" cy="56" rx="26" ry="40" fill="url(#lp-bounce)" />
        <ellipse
          cx="-27"
          cy="-46"
          rx="15"
          ry="32"
          transform="rotate(-20 -27 -46)"
          fill="url(#lp-spec)"
        />
        <path
          d={lemonPath()}
          fill="none"
          stroke={p.accentLight}
          strokeOpacity="0.5"
          strokeWidth="1.2"
        />
      </g>

      <Jaw p={p} which="lower" />
      <Jaw p={p} which="upper" />

      <g>
        <circle
          cx={HINGE[0]}
          cy={HINGE[1]}
          r="23"
          fill={p.metal}
          stroke={p.lineStrong}
          strokeOpacity="0.8"
          strokeWidth="1.5"
        />
        <circle
          cx={HINGE[0]}
          cy={HINGE[1]}
          r="10"
          fill={p.stage}
          stroke={p.accent}
          strokeWidth="1.6"
        />
        <circle cx={HINGE[0]} cy={HINGE[1]} r="3" fill={p.accentLight} />
      </g>

      {/* Drops: hidden until the motion loop places them. */}
      {Array.from({ length: DROP_COUNT }, (_, i) => (
        <g key={i} data-lp="drop" opacity="0">
          <path
            d="M0 -10C3 -5 6.5 -1 6.5 3A6.5 6.5 0 0 1 -6.5 3C-6.5 -1 -3 -5 0 -10Z"
            fill="url(#lp-drop)"
          />
          <circle cx="-2" cy="2" r="1.5" fill="#fff" opacity="0.8" />
        </g>
      ))}
    </svg>
  )
}

/** One half of the press: its arm, its glass jaw, and its handle end. */
function Jaw({ p, which }: { p: ScenePalette; which: 'upper' | 'lower' }) {
  const upper = which === 'upper'
  const [lx, ly] = LEMON
  const [hx, hy] = HINGE
  const armY = upper ? ly - 126 : ly + 126
  const end = upper ? 800 : 780
  const bend = upper ? -1 : 1
  const arm = `M${hx} ${hy}C${hx} ${hy + bend * 70} ${hx + 40} ${armY} ${hx + 120} ${armY}L${end} ${armY}`
  const jaw = upper
    ? 'M-90 -34C-90 -100 -48 -128 0 -128C48 -128 90 -100 90 -34L78 -34C78 -90 42 -114 0 -114C-42 -114 -78 -90 -78 -34Z'
    : 'M-90 34C-90 100 -48 126 -16 128L-9 152H9L16 128C48 126 90 100 90 34L78 34C78 92 42 114 0 116C-42 114 -78 92 -78 34Z'
  const shine = upper
    ? 'M-70 -58C-66 -92 -40 -112 -12 -117'
    : 'M-72 58C-66 90 -42 110 -16 117'
  return (
    <g data-lp={upper ? 'upper-jaw' : 'lower-jaw'}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d={arm}
          stroke={p.lineStrong}
          strokeOpacity="0.38"
          strokeWidth="17"
        />
        <path d={arm} stroke={p.metal} strokeWidth="14.5" />
        <path
          d={arm}
          stroke={p.metalLight}
          strokeWidth="2"
          strokeOpacity="0.9"
          transform="translate(0 -3.5)"
        />
        {/* A pressure gauge in the arm, in the accent. */}
        <path
          d={`M${end - 170} ${armY}H${end - 40}`}
          stroke={p.accent}
          strokeWidth="8"
          strokeOpacity="0.16"
        />
        <path
          d={`M${end - 170} ${armY}H${end - 40}`}
          stroke={p.accent}
          strokeWidth="2.6"
        />
        <path
          d={`M${end - 210} ${armY}H${end - 186}`}
          stroke={p.line}
          strokeWidth="3"
        />
      </g>
      <circle
        cx={end}
        cy={armY}
        r="13"
        fill={p.stage}
        stroke={p.lineStrong}
        strokeWidth="1.5"
      />
      <circle cx={end} cy={armY} r="3.2" fill={p.accent} />
      <g transform={`translate(${lx} ${ly})`}>
        <rect
          x="-22"
          y={upper ? -138 : 118}
          width="44"
          height="20"
          rx="7"
          fill={p.metal}
          stroke={p.lineStrong}
          strokeOpacity="0.55"
        />
        <path
          d={jaw}
          fill="#fff"
          fillOpacity="0.08"
          stroke={p.lineStrong}
          strokeOpacity="0.8"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d={shine}
          fill="none"
          stroke="#fff"
          strokeOpacity="0.38"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
    </g>
  )
}
