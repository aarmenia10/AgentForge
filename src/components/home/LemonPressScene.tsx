import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
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
  HANDLE,
  FRAME,
  TOP_SPOUTS,
  SPOUT_LENGTH,
  LEMON,
  PEDESTAL,
  PRISM,
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

/** How far the page has scrolled through the first screen, 0 to 1. */
function scrollProgress(): number {
  return Math.max(0, Math.min(1, window.scrollY / (window.innerHeight * 0.9)))
}

/**
 * The press feeds the Agents and Skills cups. Their streams combine in the
 * glass triangle and fill the Councils cup.
 *
 * Drawn in SVG on two layers: a still one (glows, grid, lines, pedestals) and
 * a live one (press, lemon, prism, streams, juice, drops), each composited on
 * its own so a moving drop never repaints the glows. The cups are real links,
 * laid over the drawing, so keyboards and screen readers get them too.
 */
export default function LemonPressScene() {
  const { appearance } = useTheme()
  const { go } = useRoute()
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
      ram: one('ram'),
      lever: one('lever'),
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
    const scene = startSceneMotion(nodes)
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
  }, [palette.dark])

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
    }
  }

  function onCup(event: MouseEvent<HTMLAnchorElement>, index: number) {
    const plain =
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    if (!plain) return
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
          '--lp-accent': palette.ink,
          '--lp-accent-light': palette.dark ? palette.accentLight : palette.ink,
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
      <StillLayer p={palette} />
      <LiveLayer p={palette} />

      <div aria-hidden="true" className="lp-notes">
        <Note x={540} y={330} align="center" n="01" text="Build once" />
        <Note x={666} y={605} n="02" text="Combine" />
        <Note x={666} y={825} n="03" text="Use everywhere" />
      </div>

      <nav aria-label="Lemon press destinations">
        {CUPS.map((cup, i) => (
          <Link
            key={cup.key}
            to={cup.to}
            className="lp-cup-link"
            style={{
              left: pct(cup.cx - CUP.topHalf - 6, VIEW.w),
              top: pct(cup.top - 12, VIEW.h),
              width: pct((CUP.topHalf + 6) * 2, VIEW.w),
              height: pct(
                (i === 2 ? PEDESTAL.bottom - cup.top : CUP.height) + 12,
                VIEW.h,
              ),
            }}
            onClick={(event) => onCup(event, i)}
            onFocus={() => {
              setHot(`cup-${i}` as Part)
              // A cup reached by Tab while content covers it: show the scene.
              if (window.scrollY > window.innerHeight * 0.3)
                window.scrollTo({
                  top: 0,
                  behavior: 'smooth',
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
  align?: 'start' | 'center'
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
          cy={cup.top + CUP.height * 0.7}
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

      <Pedestal cx={CUPS[2].cx} p={p} />

      {/* The cups' back walls and the far half of each rim. */}
      {CUPS.map((cup) => (
        <g key={cup.key}>
          <path
            d={`${cupPath(cup)}Z`}
            fill={p.dark ? p.accentLight : '#fff'}
            fillOpacity="0.035"
          />
          <path
            d={`M${cup.cx - CUP.topHalf} ${cup.top}A${CUP.topHalf} 11 0 0 1 ${cup.cx + CUP.topHalf} ${cup.top}`}
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
  const entry: Pt = [px, py - 14]

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
          <stop
            offset="0"
            stopColor={p.dark ? p.accentLight : '#fff'}
            stopOpacity="0.85"
          />
          <stop
            offset="1"
            stopColor={p.dark ? p.accentLight : '#fff'}
            stopOpacity="0"
          />
        </radialGradient>
        <Glow id="lp-g-hot" color={p.accentLight} peak={0.4} />
        <Glow id="lp-g-core" color={p.accent} peak={0.95} />
        <linearGradient id="lp-juice" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.juice} stopOpacity="0.96" />
          <stop offset="1" stopColor={p.accentDeep} stopOpacity="0.96" />
        </linearGradient>
        <radialGradient id="lp-surface" cx="0.42" cy="0.4" r="0.7">
          <stop offset="0" stopColor={p.accentLight} />
          <stop offset="1" stopColor={p.accent} />
        </radialGradient>
        <linearGradient id="lp-glass" x1="0" y1="0" x2="1" y2="0">
          <stop
            offset="0"
            stopColor={p.dark ? p.accentLight : p.lineStrong}
            stopOpacity="0.15"
          />
          <stop
            offset="0.3"
            stopColor={p.dark ? p.accentLight : '#fff'}
            stopOpacity="0.02"
          />
          <stop
            offset="0.85"
            stopColor={p.dark ? p.accentLight : '#fff'}
            stopOpacity="0.03"
          />
          <stop
            offset="1"
            stopColor={p.dark ? p.accentLight : '#fff'}
            stopOpacity="0.09"
          />
        </linearGradient>
        <linearGradient id="lp-prism-front" x1="0" y1="0" x2="0.4" y2="1">
          <stop
            offset="0"
            stopColor={p.dark ? p.accentLight : p.lineStrong}
            stopOpacity="0.2"
          />
          <stop
            offset="1"
            stopColor={p.dark ? p.accentLight : '#fff'}
            stopOpacity="0.04"
          />
        </linearGradient>
        <linearGradient id="lp-prism-side" x1="0" y1="0" x2="1" y2="1">
          <stop
            offset="0"
            stopColor={p.dark ? p.accentLight : '#fff'}
            stopOpacity="0.06"
          />
          <stop
            offset="1"
            stopColor={p.dark ? p.accentLight : '#fff'}
            stopOpacity="0.01"
          />
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
          <stop
            offset="0"
            stopColor={p.dark ? p.accentLight : '#fff'}
            stopOpacity="0"
          />
          <stop
            offset="0.5"
            stopColor={p.dark ? p.accentLight : '#fff'}
            stopOpacity="0.5"
          />
          <stop
            offset="1"
            stopColor={p.dark ? p.accentLight : '#fff'}
            stopOpacity="0"
          />
        </linearGradient>
        <radialGradient id="lp-drop" cx="0.35" cy="0.6" r="0.75">
          <stop offset="0" stopColor={p.accentLight} />
          <stop offset="1" stopColor={p.juice} />
        </radialGradient>
        <linearGradient id="lp-arm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.metalLight} />
          <stop offset="0.5" stopColor={p.metal} />
          <stop offset="1" stopColor={p.stage} />
        </linearGradient>
        {CUPS.map((cup, i) => (
          <clipPath key={cup.key} id={`lp-cup-${i}`}>
            <path d={`${cupPath(cup, 3)}Z`} />
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
                stroke={p.dark && j === 1 ? p.accentLight : p.ink}
                strokeWidth={j === 1 ? 1.8 : 1.4}
                strokeOpacity={j === 1 ? 0.95 : 0.8}
              />
            ))}
            <circle
              data-lp="flow"
              cx={line[0][0]}
              cy={line[0][1]}
              r="2.8"
              fill={p.ink}
            />
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
          cy="603"
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
          {[PRISM.left, PRISM.right].map((exit, i) => (
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
          stroke={p.dark ? p.accentLight : '#fff'}
          strokeOpacity="0.14"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <line
          x1={px}
          y1={py}
          x2={PRISM.left[0]}
          y2={PRISM.left[1]}
          stroke={p.dark ? p.accentLight : '#fff'}
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
          cy="603"
          r="130"
          fill="url(#lp-g-hot)"
        />
        {[PRISM.left, PRISM.right].map((exit, i) => (
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
        const sy = surfaceY(cup)
        const hw = cupHalfWidthAt(cup, sy)
        const { top } = cup
        const { topHalf } = CUP
        const bottom = top + CUP.height
        return (
          <g key={cup.key}>
            {i < TOP_SPOUTS.length && (
              <g stroke={p.lineStrong} fill="url(#lp-arm)">
                <path
                  d={`M${cup.cx - 11} ${bottom - 2}h22l-5 ${SPOUT_LENGTH + 2}h-12Z`}
                />
                <ellipse
                  cx={cup.cx}
                  cy={TOP_SPOUTS[i][1]}
                  rx="6"
                  ry="2"
                  fill={p.juice}
                />
              </g>
            )}
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
                d={`M${cup.cx - hw - 6} ${sy}H${cup.cx + hw + 6}V${bottom + 28}H${cup.cx - hw - 6}Z`}
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
              cx="0"
              cy="0"
              rx={hw - 8}
              ry="5.5"
              fill="none"
              stroke={p.dark ? p.accentLight : '#fff'}
              strokeOpacity="0.85"
              strokeWidth="1.1"
              opacity="0"
            />
            <path
              d={cupPath(cup)}
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
              stroke={p.dark ? p.accentLight : '#fff'}
              strokeOpacity="0.22"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d={`M${cup.cx + topHalf - 14} ${top + 20}L${cup.cx + topHalf - 17} ${top + 58}`}
              stroke={p.dark ? p.accentLight : '#fff'}
              strokeOpacity="0.12"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Measure marks on the glass. */}
            <g stroke={p.lineStrong} strokeOpacity="0.5" strokeWidth="1">
              {[0.3, 0.55, 0.8].map((t) => {
                const y = bottom - (bottom - top) * t
                const x = cup.cx + cupHalfWidthAt(cup, y) - 4
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
              stroke={p.dark ? p.accentLight : '#fff'}
              strokeOpacity="0.14"
            />
            <path
              className={`lp-hot lp-hot-cup-${i}`}
              d={cupPath(cup)}
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
        className="lp-hot lp-hot-lemon"
        cx={LEMON[0]}
        cy={LEMON[1]}
        r="190"
        fill="url(#lp-g-hot)"
      />
      <Press p={p} />
      <g data-lp="lemon" transform={`translate(${LEMON[0]} ${LEMON[1]})`}>
        <g transform="scale(1.25 0.84) rotate(90)">
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
            stroke={p.dark ? p.accentLight : p.ink}
            strokeOpacity={p.dark ? 0.5 : 1}
            strokeWidth={p.dark ? 1.2 : 2.2}
          />
        </g>
      </g>

      {/* Drops: hidden until the motion loop places them. */}
      {Array.from({ length: DROP_COUNT }, (_, i) => (
        <g key={i} data-lp="drop" opacity="0">
          <path
            d="M0 -10C3 -5 6.5 -1 6.5 3A6.5 6.5 0 0 1 -6.5 3C-6.5 -1 -3 -5 0 -10Z"
            fill="url(#lp-drop)"
          />
          <circle
            cx="-2"
            cy="2"
            r="1.5"
            fill={p.dark ? p.accentLight : '#fff'}
            opacity="0.8"
          />
        </g>
      ))}
    </svg>
  )
}

/** The central pivot drives the ram onto the fruit. */
function Press({ p }: { p: ScenePalette }) {
  const { left, right, top, bottom } = FRAME
  const [cx, cy] = HINGE
  const [hx, hy] = HANDLE
  const frame = `M${left} ${bottom}V${top + 13}Q${left} ${top} ${left + 13} ${top}H${right - 13}Q${right} ${top} ${right} ${top + 13}V${bottom}`
  const lever = `M${cx - 21} ${cy + 5}L${hx} ${hy}`
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d={frame} fill="none" stroke={p.lineStrong} strokeWidth="16" />
      <path d={frame} fill="none" stroke={p.metal} strokeWidth="11" />
      <path
        d="M334 264H388V275H334ZM408 264H433Q540 284 647 264H672V275H647Q540 301 433 275H408ZM692 264H746V275H692Z"
        fill="url(#lp-arm)"
        stroke={p.lineStrong}
        strokeWidth="2"
      />
      <g
        data-lp="ram"
        fill="url(#lp-arm)"
        stroke={p.lineStrong}
        strokeWidth="2"
      >
        <rect x={cx - 9} y="83" width="18" height="52" rx="5" />
        <path d="M472 144Q477 127 500 126H580Q603 127 608 144Q540 137 472 144Z" />
      </g>
      <g data-lp="lever">
        <path d={lever} stroke={p.lineStrong} strokeWidth="13" />
        <path d={lever} stroke={p.metalLight} strokeWidth="8" />
        <path
          d={`M${hx - 50} ${hy + 14}L${hx} ${hy}`}
          stroke={p.ink}
          strokeWidth="16"
        />
      </g>
      <circle
        cx={cx}
        cy={cy}
        r="16"
        fill={p.metal}
        stroke={p.lineStrong}
        strokeWidth="2"
      />
      <circle cx={cx} cy={cy} r="6" fill={p.accent} />
    </g>
  )
}
