import { useEffect, useMemo, useState } from 'react'
import { Hero } from '@/components/Hero'
import { TrendingSection } from '@/components/home/TrendingSection'
import { ArrowIcon, primaryButtonClass } from '@/components/ui'
import { atomItems, trendingFrom, type HomeSources } from '@/lib/homeFeed'
import { Link } from '@/router/Router'

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
 * The landing page, top to bottom: the hero with its atom, "Explore"
 * and its three buttons, then Trending. Categories live on /agents.
 */
export function HomePage() {
  const sources = useHomeSources()
  const atom = useMemo(() => (sources ? atomItems(sources) : null), [sources])
  const trending = useMemo(
    () => (sources ? trendingFrom(sources) : null),
    [sources],
  )

  return (
    <main className="flex-1 overflow-x-clip">
      <Hero atom={atom} />

      <section
        aria-labelledby="home-explore"
        className="mx-auto max-w-7xl px-4 pb-14 text-center sm:px-6"
      >
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
      </section>

      <TrendingSection items={trending} />
    </main>
  )
}
