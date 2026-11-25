import { TRENDING_COUNT, type HomeItem } from '@/lib/homeFeed'
import { HomeCard } from './HomeCard'

interface TrendingSectionProps {
  /** Null while the public files load. Empty: nothing to show, no section. */
  items: HomeItem[] | null
}

/**
 * The most liked items across agents, skills, and councils. Home page only:
 * the cards are see-through (`home-glass`) so the lemon press shows behind
 * them, and only the heading and cards take the pointer.
 */
export function TrendingSection({ items }: TrendingSectionProps) {
  if (items && items.length === 0) return null
  return (
    <section
      aria-labelledby="home-trending"
      className="mx-auto max-w-7xl px-4 pb-14 sm:px-6"
    >
      <h2
        id="home-trending"
        className="home-glass pointer-events-auto inline-block rounded-full px-5 py-1.5 text-2xl font-semibold tracking-tight sm:text-3xl"
      >
        Trending
      </h2>
      {items === null ? (
        <div
          aria-busy="true"
          className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {Array.from({ length: TRENDING_COUNT }, (_, i) => (
            <div
              key={i}
              className="home-glass h-44 animate-pulse rounded-3xl"
            />
          ))}
        </div>
      ) : (
        <ul className="pointer-events-auto mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <HomeCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
