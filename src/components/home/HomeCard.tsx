import { ThumbsUp } from 'lucide-react'
import { displayAuthorHandle } from '@/lib/authorBranding'
import { formatCount } from '@/lib/format'
import type { HomeItem } from '@/lib/homeFeed'
import { Link } from '@/router/Router'

const KIND_LABEL = { agent: 'Agent', skill: 'Skill', council: 'Council' }

export function HomeCard({
  item,
  note,
}: {
  item: Pick<
    HomeItem,
    'kind' | 'name' | 'description' | 'authorHandle' | 'to'
  > &
    Partial<Pick<HomeItem, 'likes' | 'detail'>>
  note?: string
}) {
  const likes = item.likes ?? 0
  return (
    <article className="home-glass card-lift group relative flex h-full flex-col rounded-3xl p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-fg">
          {KIND_LABEL[item.kind]}
        </span>
        {likes > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-accent-fg">
            <ThumbsUp className="size-3.5" aria-hidden="true" />
            {formatCount(likes)}
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

      {note && (
        <p className="mt-3 break-words border-t border-current/20 pt-3 text-sm leading-relaxed">
          {note}
        </p>
      )}

      <p className="mt-auto pt-4 text-xs text-fg-muted">
        @{displayAuthorHandle(item.authorHandle)}
        {item.detail && <> · {item.detail}</>}
      </p>
    </article>
  )
}
