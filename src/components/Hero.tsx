import { lazy, Suspense, useRef, useState } from 'react'
import { Link } from '@/router/Router'
import { Reveal } from './Reveal'
import { ArrowIcon, primaryButtonClass } from './ui'

// The demo form reaches Firestore, so it is fetched only when "Get a demo" is
// pressed. A visitor who never presses it loads no Firebase code (README 7.2).
const RequestDemo = lazy(() => import('./RequestDemo'))

export const secondaryButtonClass =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-surface px-6 text-sm font-semibold text-fg transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2'

/**
 * The first screen of the home page. It fills the screen below the top bar
 * and leaves room for the lemon press behind it: the text sits on the left on
 * wide screens and at the top on phones. Only the text takes the pointer; the
 * open space belongs to the scene (`HomePage`).
 */
export function Hero() {
  const demoButton = useRef<HTMLButtonElement>(null)
  const [demo, setDemo] = useState<'closed' | 'open' | 'dismissed'>('closed')

  return (
    <Reveal
      as="section"
      className="home-hero mx-auto grid max-w-7xl content-start px-4 pt-10 pb-10 sm:px-6 sm:pt-16 lg:grid-cols-2 lg:content-center lg:gap-12 lg:pt-0"
    >
      <div className="pointer-events-auto text-center lg:text-left">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent-fg">
          Open source · Works with AI tools you already use
        </p>

        <h1 className="mx-auto mt-6 max-w-4xl text-balance text-[36px] font-semibold leading-[1.2] tracking-[-0.03em] sm:text-[52px] lg:text-[68px]">
          Achieve <span className="text-accent-fg">More.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-fg-muted sm:text-lg lg:mx-0">
          Discover, download, and share AI tools that help you complete everyday
          tasks, save time, and work smarter. No coding or AI expertise
          required.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
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

      {demo !== 'closed' && (
        // The section lets the pointer through to the scene; the dialog must not.
        <div className="pointer-events-auto">
          <Suspense fallback={null}>
            <RequestDemo
              open={demo === 'open'}
              onClosed={() => {
                setDemo('dismissed')
                demoButton.current?.focus()
              }}
            />
          </Suspense>
        </div>
      )}
    </Reveal>
  )
}
