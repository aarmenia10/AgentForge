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
import { toHex, tokensFor } from '@/theme/appearance'
import { atomPalette } from '@/theme/atomPalette'
import { useTheme } from '@/theme/ThemeProvider'
import { AtomFallback } from './AtomFallback'

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

/** If the chunk fails to load, the static atom stays. */
class AtomBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

interface HeroAtomProps {
  /** Null until the three public files have loaded. */
  items: AtomItems | null
}

/**
 * The home page atom. The nucleus is "Council"; each electron is a real agent
 * or skill. It starts as the static SVG atom and swaps to the interactive 3D
 * one once three.js has loaded, unless the visitor prefers reduced motion or
 * the browser has no WebGL, in which case the static one stays.
 */
export function HeroAtom({ items }: HeroAtomProps) {
  const { appearance } = useTheme()
  const { go } = useRoute()
  const reduced = useReducedMotion()
  const [webgl] = useState(hasWebGL)
  const [lost, setLost] = useState(false)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const palette = useMemo(
    () => atomPalette(tokensFor(appearance).tokens),
    [appearance],
  )
  const list = useMemo(() => (items ? interleave(items) : []), [items])

  const interactive3d = webgl && !reduced && !lost

  // After first paint, fetch the 3D chunk without waiting for the item list.
  useEffect(() => {
    if (!interactive3d) return
    const idle = 'requestIdleCallback' in window
    const handle = idle
      ? window.requestIdleCallback(() => void loadAtom())
      : window.setTimeout(() => void loadAtom(), 150)
    return () => {
      if (idle) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [interactive3d])

  const show3d = interactive3d && list.length > 0
  const staticAtom = (
    <AtomFallback palette={palette} items={items} interactive={!show3d} />
  )
  const hasAgents = (items?.agents.length ?? 0) > 0
  const hasSkills = (items?.skills.length ?? 0) > 0

  return (
    <div
      role="group"
      aria-label="Agents and skills orbiting the Council"
      className="mx-auto w-full max-w-[19rem] sm:max-w-[26rem] lg:max-w-[32rem]"
    >
      <div className="relative aspect-square w-full [container-type:inline-size]">
        {show3d ? (
          <AtomBoundary fallback={staticAtom}>
            <Suspense fallback={staticAtom}>
              <AtomCanvas
                items={list}
                palette={palette}
                activeKey={activeKey}
                onOpen={go}
                onUnavailable={() => setLost(true)}
              />
            </Suspense>
          </AtomBoundary>
        ) : (
          staticAtom
        )}
      </div>

      {show3d && (
        // The same links as the electrons, for keyboards and screen readers.
        <ul className="sr-only" aria-label="Agents and skills in the atom">
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

      {(hasAgents || hasSkills) && (
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-fg-muted">
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
          {show3d && <span>Drag to rotate</span>}
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
      style={{ backgroundColor: color }}
    />
  )
}
