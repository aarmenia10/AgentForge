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

export function MyCouncils({ owner }: { owner?: string }) {
  const [items, setItems] = useState<CouncilRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
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
      {items.map((item) => (
        <article
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-surface p-5"
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
            {!owner && (
              <button
                type="button"
                className={smallButton}
                disabled={deleting !== null}
                onClick={() => void remove(item)}
              >
                Delete
                <span className="sr-only"> {item.name}</span>
              </button>
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
