import { lazy, Suspense, useRef, useState } from 'react'
import type { AtomItems } from '@/lib/homeFeed'
import { Link } from '@/router/Router'
import { HeroAtom, useAtomSupported } from './home/HeroAtom'
import { Reveal } from './Reveal'
import { ArrowIcon, primaryButtonClass } from './ui'

// The demo form reaches Firestore, so it is fetched only when "Get a demo" is
// pressed. A visitor who never presses it loads no Firebase code (README 7.2).
const RequestDemo = lazy(() => import('./RequestDemo'))

export const secondaryButtonClass =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-surface px-6 text-sm font-semibold text-fg transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2'

interface HeroProps {
  /** The agents and skills that orbit as electrons. Null while loading. */
  atom: AtomItems | null
}

export function Hero({ atom }: HeroProps) {
  const demoButton = useRef<HTMLButtonElement>(null)
  const [demo, setDemo] = useState<'closed' | 'open' | 'dismissed'>('closed')
  const supported = useAtomSupported()
  const [failed, setFailed] = useState(false)
  // `?atomdebug` keeps the atom even when it fails and prints what the
  // browser reports, so a failure on someone's machine can be diagnosed.
  const [debug] = useState(() =>
    new URLSearchParams(window.location.search).has('atomdebug'),
  )
  const [debugLines, setDebugLines] = useState<string[]>([])
  // No atom without WebGL, with reduced motion, after a WebGL failure, or when
  // there are no agents or skills to orbit. Then the hero is the centred text
  // it was before the atom (owner decision 2026-11-24: no static picture).
  const empty = atom !== null && atom.agents.length + atom.skills.length === 0
  const withAtom = supported && !failed && !empty
  const debugReport = debug
    ? [
        `supported (WebGL and no reduced motion): ${supported}`,
        `reduced motion: ${window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? 'unknown'}`,
        ...debugLines,
      ]
    : []

  return (
    <Reveal
      as="section"
      className={
        withAtom
          ? 'mx-auto grid max-w-7xl items-center gap-6 overflow-x-clip px-4 pb-10 pt-6 sm:px-6 sm:pt-12 lg:grid-cols-2 lg:gap-12 lg:pt-10'
          : 'mx-auto max-w-7xl px-4 pb-10 pt-14 text-center sm:px-6 sm:pt-24'
      }
    >
      {/* The text comes first in the page order; on phones the atom sits above it. */}
      <div className={withAtom ? 'text-center lg:text-left' : undefined}>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent-fg">
          Open source · Works with AI tools you already use
        </p>

        <h1 className="mx-auto mt-6 max-w-4xl text-balance text-[36px] font-semibold leading-[1.2] tracking-[-0.03em] sm:text-[52px] lg:text-[68px]">
          Achieve <span className="text-accent-fg">More.</span>
        </h1>

        <p
          className={`mx-auto mt-5 max-w-2xl text-pretty text-base text-fg-muted sm:text-lg ${withAtom ? 'lg:mx-0' : ''}`}
        >
          Discover, download, and share AI tools that help you complete everyday
          tasks, save time, and work smarter. No coding or AI expertise
          required.
        </p>

        <div
          className={`mt-8 flex flex-wrap items-center justify-center gap-3 ${withAtom ? 'lg:justify-start' : ''}`}
        >
          <Link to="/studio" className={primaryButtonClass}>
            Start building
            <ArrowIcon />
          </Link>
          <button
            ref={demoButton}
            type="button"
            className={secondaryButtonClass}
            onClick={() => setDemo('open')}
          >
            Get a demo
          </button>
        </div>
      </div>

      {withAtom && (
        <div className="max-lg:order-first">
          <HeroAtom
            items={atom}
            onUnavailable={(reason) =>
              debug
                ? setDebugLines((lines) => [...lines, `FAILED: ${reason}`])
                : setFailed(true)
            }
            onInfo={
              debug
                ? (lines) => setDebugLines((old) => [...old, ...lines])
                : undefined
            }
          />
        </div>
      )}

      {debug && (
        <pre className="col-span-full overflow-x-auto whitespace-pre-wrap rounded-2xl bg-surface p-4 text-left text-xs text-fg">
          {debugReport.join('\n')}
        </pre>
      )}

      {demo !== 'closed' && (
        <Suspense fallback={null}>
          <RequestDemo
            open={demo === 'open'}
            onClosed={() => {
              setDemo('dismissed')
              demoButton.current?.focus()
            }}
          />
        </Suspense>
      )}
    </Reveal>
  )
}
