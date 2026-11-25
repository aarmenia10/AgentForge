import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import { Hero } from '@/components/Hero'
import { HomeBackdrop, useReducedMotion } from '@/components/home/HomeBackdrop'
import { homeGlass } from '@/components/home/scenePalette'
import { TrendingSection } from '@/components/home/TrendingSection'
import { ArrowIcon, primaryButtonClass } from '@/components/ui'
import { trendingFrom, type HomeSources } from '@/lib/homeFeed'
import { Link } from '@/router/Router'
import { tokensFor } from '@/theme/appearance'
import { useTheme } from '@/theme/ThemeProvider'

// Kept for the session so returning to the home page shows everything at once.
let cached: HomeSources | null = null

/**
 * Reads the three public files after first paint. The loader (and the schema
 * code it needs) is its own chunk. Static files only: zero Firestore reads
 * (invariant 3).
 */
function useHomeSources(): HomeSources | null {
  const [sources, setSources] = useState<HomeSources | null>(cached)
  useEffect(() => {
    if (cached) return
    let cancelled = false
    import('@/lib/homeData')
      .then((module) => module.loadHomeSources())
      .then((loaded) => {
        cached = loaded
        if (!cancelled) setSources(loaded)
      })
      .catch(() => {
        // Without the files the page shows the hero and the buttons only.
        if (!cancelled) setSources({ agents: [], skills: [], councils: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return sources
}

/**
 * The top bar's height, so the background sticks right under it and the hero
 * fills exactly the first screen. Measured, because the bar can change.
 */
function useNavHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const header = document.querySelector('header')
    if (!header) return
    const measure = () => setHeight(header.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])
  return height
}

/**
 * The landing page, top to bottom: the hero, "Explore" and its three
 * buttons, then Trending, all scrolling over the lemon press background.
 * Categories live on /agents.
 *
 * Content sits above the background with `pointer-events: none` on its
 * wrappers and `auto` on the things you can read or press, so the scene
 * answers the pointer wherever nothing covers it.
 */
export function HomePage() {
  const sources = useHomeSources()
  const navHeight = useNavHeight()
  const reduced = useReducedMotion()
  const { appearance } = useTheme()
  const glass = useMemo(
    () => homeGlass(tokensFor(appearance).tokens),
    [appearance],
  )
  const trending = useMemo(
    () => (sources ? trendingFrom(sources) : null),
    [sources],
  )

  const style = {
    '--home-glass': glass.fill,
    '--home-glass-muted': glass.muted,
    '--home-glass-accent-text': glass.accentText,
    ...(navHeight === null ? {} : { '--home-nav': `${navHeight}px` }),
  } as CSSProperties

  return (
    <main className="home relative flex-1 overflow-x-clip" style={style}>
      <HomeBackdrop reduced={reduced} />

      <div className="pointer-events-none relative z-10">
        <Hero />

        <section
          aria-labelledby="home-explore"
          className="mx-auto max-w-7xl px-4 pb-14 sm:px-6"
        >
          <div className="home-glass pointer-events-auto mx-auto max-w-3xl rounded-3xl px-6 py-8 text-center sm:px-10 sm:py-10">
            <h2
              id="home-explore"
              className="text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              Explore
            </h2>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link to="/agents" className={primaryButtonClass}>
                Explore Agents
                <ArrowIcon />
              </Link>
              <Link to="/skills" className={primaryButtonClass}>
                Explore Skills
                <ArrowIcon />
              </Link>
              <Link to="/councils" className={primaryButtonClass}>
                Explore Councils
                <ArrowIcon />
              </Link>
            </div>
          </div>
        </section>

        <TrendingSection items={trending} />
      </div>
    </main>
  )
}
