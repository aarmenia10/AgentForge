import { useEffect, useState } from 'react'
import { originLabel } from '@/lib/portability'
import { Link } from '@/router/Router'
import { councilStore } from '@/services/councilStore'
import {
  smallButton,
  textLink,
  VisibilityLabel,
} from '@/components/studio/parts'
import type { CouncilRecord } from '@/types/council'

async function page(owner?: string, after?: string) {
  const store = await councilStore()
  return owner ? store.listShared(owner, after) : store.listMine(after)
}

export function MyCouncils({ owner }: { owner?: string }) {
  const [items, setItems] = useState<CouncilRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    page(owner)
      .then(({ items, cursor }) => {
        if (active) {
          setItems(items)
          setCursor(cursor)
        }
      })
      .catch(() => {
        if (active) setError('Could not load councils.')
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [owner])
  async function more() {
    setBusy(true)
    setError('')
    try {
      const next = await page(owner, cursor ?? undefined)
      setItems((current) => [...current, ...next.items])
      setCursor(next.cursor)
    } catch {
      setError('Could not load more councils.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3">
      {error && <p role="alert">{error}</p>}
      {!items.length && !busy && !error && (
        <p>
          {owner
            ? 'No councils shared.'
            : 'Export a council from a connected AI app or save a public council to see it here.'}
        </p>
      )}
      {items.map((item) => (
        <article
          key={item.id}
          className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl p-4"
        >
          <div className="min-w-0">
            <Link
              to={'/councils/' + item.id + (owner ? '?shared=1' : '?mine=1')}
              className={textLink}
            >
              {item.name}
            </Link>
            <p className="break-all text-xs">
              {item.id}@{item.version} · {item.members.length} members
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <VisibilityLabel visibility={item.visibility} />
            {item.visibility === 'public' && <span>{item.review_status}</span>}
            {originLabel(item.origin_app, item.saved_from_chat) && (
              <span>{originLabel(item.origin_app, item.saved_from_chat)}</span>
            )}
          </div>
        </article>
      ))}
      {busy && <p role="status">Loading councils…</p>}
      {cursor && (
        <button
          className={smallButton}
          type="button"
          disabled={busy}
          onClick={() => void more()}
        >
          Load more councils
        </button>
      )}
    </div>
  )
}
