import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { interleave, type AtomItems } from '@/lib/homeFeed'
import { Link, useRoute } from '@/router/Router'
import { mix, toHex, tokensFor } from '@/theme/appearance'
import { atomPalette } from '@/theme/atomPalette'
import { useTheme } from '@/theme/ThemeProvider'

/** The keyboard list's key for the nucleus (matches `atomScene.ts`). */
const COUNCIL_KEY = 'council'

// The 3D atom and three.js are their own chunk, fetched after first paint.
const loadAtom = () => import('./AtomCanvas')
const AtomCanvas = lazy(loadAtom)

const KIND_LABEL = { agent: 'Agent', skill: 'Skill', council: 'Council' }

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

/** A throwaway context just to learn whether WebGL exists. */
function hasWebGL(): boolean {
  try {
    const probe = document.createElement('canvas')
    const gl = (probe.getContext('webgl2') ??
      probe.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/**
 * Whether this visitor gets the atom at all: the browser has WebGL and the
 * visitor has not asked for reduced motion. Without it the hero shows no atom
 * (owner decision 2026-11-24: no static picture).
 */
export function useAtomSupported(): boolean {
  const reduced = useReducedMotion()
  const [webgl] = useState(hasWebGL)
  return webgl && !reduced
}

/** If the 3D chunk fails to load or throws, the hero drops the atom. */
class AtomBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

interface HeroAtomProps {
  /** Null until the three public files have loaded. */
  items: AtomItems | null
  /** WebGL failed or drew nothing: the hero removes the atom. */
  onUnavailable: () => void
}

/**
 * The home page atom. The nucleus is "Council"; each electron is a real agent
 * or skill. Render it only when `useAtomSupported()` is true. Until three.js
 * and the items arrive, the reserved square shows a soft accent glow.
 */
export function HeroAtom({ items, onUnavailable }: HeroAtomProps) {
  const { appearance } = useTheme()
  const { go } = useRoute()
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const palette = useMemo(
    () => atomPalette(tokensFor(appearance).tokens),
    [appearance],
  )
  const list = useMemo(() => (items ? interleave(items) : []), [items])

  // After first paint, fetch the 3D chunk without waiting for the item list.
  useEffect(() => {
    const idle = 'requestIdleCallback' in window
    const handle = idle
      ? window.requestIdleCallback(() => void loadAtom())
      : window.setTimeout(() => void loadAtom(), 150)
    return () => {
      if (idle) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [])

  const show3d = list.length > 0
  const glow = (
    <div
      aria-hidden="true"
      className="absolute inset-[30%] rounded-full blur-2xl"
      style={{ backgroundColor: toHex(palette.accent), opacity: 0.22 }}
    />
  )
  const hasAgents = (items?.agents.length ?? 0) > 0
  const hasSkills = (items?.skills.length ?? 0) > 0
  // Glow does not read on a light page, so in light mode the atom sits on its
  // own dark rounded stage. In dark mode the page is the stage, and the atom
  // may spill past its column (the hero clips it at the page edge).
  const stage = !palette.dark
  const stageColor = toHex(palette.stage)

  return (
    <div
      role="group"
      aria-label="Agents and skills orbiting the Council"
      className={
        stage
          ? 'mx-auto w-full max-w-[min(100%,36svh)] overflow-hidden rounded-[2rem] px-2 pb-4 sm:max-w-[34rem] lg:max-w-[38rem]'
          : 'mx-auto w-full max-w-[min(100%,34svh)] sm:max-w-[34rem] lg:w-[calc(100%+5rem)] lg:max-w-[46rem] lg:-translate-x-6'
      }
      style={
        stage
          ? {
              backgroundColor: stageColor,
              backgroundImage: `radial-gradient(circle at 50% 44%, ${toHex(mix(palette.stage, palette.accent, 0.1))} 0%, ${stageColor} 62%)`,
            }
          : undefined
      }
    >
      <div
        className="relative aspect-square w-full [container-type:inline-size]"
        // Fade the very edge, so dust and glow never end in a hard line.
        style={{
          maskImage:
            'radial-gradient(closest-side, #000 84%, transparent 100%)',
        }}
      >
        {show3d ? (
          <AtomBoundary onError={onUnavailable}>
            <Suspense fallback={glow}>
              <AtomCanvas
                items={list}
                palette={palette}
                activeKey={activeKey}
                onOpen={go}
                onUnavailable={onUnavailable}
              />
            </Suspense>
          </AtomBoundary>
        ) : (
          glow
        )}
      </div>

      {show3d && (
        // The same links as the nucleus and electrons, for keyboards and
        // screen readers.
        <ul className="sr-only" aria-label="Agents and skills in the atom">
          <li>
            <Link
              to="/councils"
              onFocus={() => setActiveKey(COUNCIL_KEY)}
              onBlur={() => setActiveKey(null)}
            >
              Council: all councils
            </Link>
          </li>
          {list.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <Link
                to={item.to}
                onFocus={() => setActiveKey(`${item.kind}:${item.id}`)}
                onBlur={() => setActiveKey(null)}
              >
                {KIND_LABEL[item.kind]}: {item.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {show3d && (hasAgents || hasSkills) && (
        <p
          className={`relative mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs ${stage ? 'text-white/70' : 'text-fg-muted'}`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Dot color={toHex(palette.accent)} />
            Council
          </span>
          {hasAgents && (
            <span className="inline-flex items-center gap-1.5">
              <Dot color={toHex(palette.agent)} />
              Agents
            </span>
          )}
          {hasSkills && (
            <span className="inline-flex items-center gap-1.5">
              <Dot color={toHex(palette.skill)} />
              Skills
            </span>
          )}
          <span>Drag to rotate</span>
        </p>
      )}
    </div>
  )
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 rounded-full"
      style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
    />
  )
}
