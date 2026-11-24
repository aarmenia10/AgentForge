import { ThumbsUp } from 'lucide-react'
import { formatCount } from '@/lib/format'
import { TRENDING_COUNT, type HomeItem } from '@/lib/homeFeed'
import { Link } from '@/router/Router'

const KIND_LABEL = { agent: 'Agent', skill: 'Skill', council: 'Council' }

interface TrendingSectionProps {
  /** Null while the public files load. Empty: nothing to show, no section. */
  items: HomeItem[] | null
}

/** The most liked items across agents, skills, and councils. */
export function TrendingSection({ items }: TrendingSectionProps) {
  if (items && items.length === 0) return null
  return (
    <section
      aria-labelledby="home-trending"
      className="mx-auto max-w-7xl px-4 pb-14 sm:px-6"
    >
      <h2
        id="home-trending"
        className="text-2xl font-semibold tracking-tight sm:text-3xl"
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
              className="h-44 animate-pulse rounded-3xl bg-surface"
            />
          ))}
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <TrendingCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TrendingCard({ item }: { item: HomeItem }) {
  return (
    <article className="card-lift group relative flex h-full flex-col rounded-3xl bg-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-fg">
          {KIND_LABEL[item.kind]}
        </span>
        {item.likes > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-accent-fg">
            <ThumbsUp className="size-3.5" aria-hidden="true" />
            {formatCount(item.likes)}
            <span className="sr-only"> thumbs up</span>
          </span>
        )}
      </div>

      <h3 className="mt-4 text-lg font-semibold tracking-tight">
        {/* The stretched link makes the whole card one click target. */}
        <Link
          to={item.to}
          className="after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--lm-accent-text)]"
        >
          {item.name}
        </Link>
      </h3>

      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-fg-muted">
        {item.description}
      </p>

      <p className="mt-auto pt-4 text-xs text-fg-muted">
        @{item.authorHandle}
        {item.detail && <> · {item.detail}</>}
      </p>
    </article>
  )
}
