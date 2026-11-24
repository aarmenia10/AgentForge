import { useEffect, useState } from 'react'
import { originLabel } from '@/lib/portability'
import { Link } from '@/router/Router'
import { councilStore } from '@/services/councilStore'
import { NewCouncilButton } from './NewCouncilButton'
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

export function MyCouncils({
  owner,
  onCount,
}: {
  owner?: string
  onCount?: (count: number, hasMore: boolean, loading: boolean) => void
}) {
  const [items, setItems] = useState<CouncilRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    onCount?.(items.length, Boolean(cursor), busy)
  }, [busy, cursor, items.length, onCount])

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

  async function remove(item: CouncilRecord) {
    if (
      !window.confirm(
        `Delete ${item.name} permanently? This can't be undone. If it is public, it leaves the site within the hour, and anyone who pinned it can no longer load it.`,
      )
    )
      return
    setDeleting(item.id)
    setError('')
    try {
      const store = await councilStore()
      await store.delete(item.id)
      setItems((current) => current.filter((entry) => entry.id !== item.id))
    } catch {
      setError('Could not delete council.')
    } finally {
      setDeleting(null)
    }
  }
  return (
    <div className="space-y-3">
      {!owner && (
        <NewCouncilButton
          onCreated={(record) =>
            setItems((current) => [
              record,
              ...current.filter(({ id }) => id !== record.id),
            ])
          }
        />
      )}
      {error && <p role="alert">{error}</p>}
      {!items.length && !busy && !error && (
        <p>
          {owner
            ? 'No councils shared.'
            : 'Export a council from a connected AI app or save a public council to see it here.'}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="h-full rounded-3xl bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <Link
                to={'/councils/' + item.id + (owner ? '?shared=1' : '?mine=1')}
                className={`${textLink} break-words font-semibold`}
              >
                {item.name}
              </Link>
              <span className="font-mono text-xs text-fg-muted">
                v{item.version}
              </span>
            </div>
            <p className="mt-1 break-all font-mono text-xs text-fg-muted">
              {item.id} · {item.members.length} members
            </p>
            <p className="mt-2 line-clamp-3 text-sm text-fg-muted">
              {item.description}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg-muted">
                Council
              </span>
              <VisibilityLabel visibility={item.visibility} />
              {item.visibility === 'public' && (
                <span className="text-sm text-fg-muted">
                  {item.review_status}
                </span>
              )}
              {originLabel(item.origin_app, item.saved_from_chat) && (
                <span className="text-sm text-fg-muted">
                  {originLabel(item.origin_app, item.saved_from_chat)}
                </span>
              )}
            </div>
            {!owner && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={smallButton}
                  disabled={deleting !== null}
                  onClick={() => void remove(item)}
                >
                  Delete
                  <span className="sr-only"> {item.name}</span>
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
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
