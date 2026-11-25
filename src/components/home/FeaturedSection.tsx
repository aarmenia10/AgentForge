import { formatFeaturedWeek, type loadFeatured } from '@/lib/featured'
import { homeItemLink } from '@/lib/homeFeed'
import { HomeCard } from './HomeCard'

export function FeaturedSection({
  featured,
}: {
  featured: Awaited<ReturnType<typeof loadFeatured>>
}) {
  if (!featured) return null
  return (
    <section
      aria-labelledby="home-featured"
      className="mx-auto max-w-7xl px-4 pb-14 sm:px-6"
    >
      <div className="home-glass pointer-events-auto inline-block rounded-3xl px-5 py-3">
        <h2
          id="home-featured"
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Featured this week
        </h2>
        <p className="mt-0.5 text-xs font-medium text-fg-muted">
          Week of{' '}
          <time dateTime={featured.week_of}>
            {formatFeaturedWeek(featured.week_of)}
          </time>
        </p>
      </div>
      <ul className="pointer-events-auto mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {featured.items.map(
          ({ kind, id, name, description, author_handle, note }) => (
            <li key={`${kind}:${id}`}>
              <HomeCard
                item={{
                  kind,
                  name,
                  description,
                  authorHandle: author_handle,
                  to: homeItemLink(kind, id),
                }}
                note={note}
              />
            </li>
          ),
        )}
      </ul>
    </section>
  )
}
