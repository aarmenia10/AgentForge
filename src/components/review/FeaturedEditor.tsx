import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import {
  Notice,
  inputClass,
  primaryButton,
  secondaryButton,
  smallButton,
} from '@/components/studio/parts'
import { hasBlockedWord } from '@/lib/blockedWords'
import {
  formatFeaturedWeek,
  MAX_FEATURED_ITEMS,
  MAX_FEATURED_NOTE,
  type FeaturedPick,
  type FeaturedSelection,
} from '@/lib/featured'
import { loadHomeSources } from '@/lib/homeData'
import {
  getFeaturedSelection,
  saveFeaturedSelection,
} from '@/services/featured'

const KIND_LABEL = { agent: 'Agent', skill: 'Skill', council: 'Council' }
const keyOf = ({ kind, id }: FeaturedPick) => `${kind}:${id}`

export function FeaturedEditor() {
  const { user } = useAuth()
  const [catalog, setCatalog] = useState<Array<
    FeaturedPick & { name: string }
  > | null>(null)
  const [saved, setSaved] = useState<FeaturedSelection | null>(null)
  const [items, setItems] = useState<FeaturedPick[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let active = true
    Promise.all([loadHomeSources(), getFeaturedSelection()])
      .then(([sources, selection]) => {
        if (!active) return
        setSaved(selection)
        setItems(selection?.items ?? [])
        setCatalog([
          ...sources.agents.map(({ id, name }) => ({
            kind: 'agent' as const,
            id,
            name,
          })),
          ...sources.skills.map(({ id, name }) => ({
            kind: 'skill' as const,
            id,
            name,
          })),
          ...sources.councils.map(({ id, name }) => ({
            kind: 'council' as const,
            id,
            name,
          })),
        ])
      })
      .catch(() => active && setLoadFailed(true))
    return () => {
      active = false
    }
  }, [])

  const names = new Map(catalog?.map((item) => [keyOf(item), item.name]))
  const term = query
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
  const matches = term
    ? (catalog ?? [])
        .filter(
          (entry) =>
            `${entry.name} ${entry.id} ${KIND_LABEL[entry.kind]}`
              .toLowerCase()
              .replace(/[-\s]+/g, ' ')
              .includes(term) &&
            !items.some((item) => keyOf(item) === keyOf(entry)),
        )
        .slice(0, 8)
    : []

  function change(next: FeaturedPick[]) {
    setItems(next)
    setError('')
    setMessage('')
  }

  function move(index: number, offset: number) {
    const next = [...items]
    const target = index + offset
    next[index] = next[target]
    next[target] = items[index]
    change(next)
  }

  async function save(clear = false) {
    if (!user || busy) return
    const picks = clear
      ? []
      : items.map(({ kind, id, note }) => {
          const trimmed = note?.trim()
          return { kind, id, ...(trimmed ? { note: trimmed } : {}) }
        })
    setError('')
    setMessage('')
    if (picks.some(({ note }) => note && hasBlockedWord(note))) {
      setError('Remove blocked words from the notes before saving.')
      return
    }

    setBusy(true)
    try {
      const selection = await saveFeaturedSelection(user.uid, picks)
      setSaved(selection)
      setItems(selection.items)
      setMessage(clear ? 'Featured picks cleared.' : 'Featured picks saved.')
    } catch {
      setError('Could not save the featured picks. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby="featured-editor"
      className="mt-5 space-y-4 text-sm"
    >
      <div>
        <h2 id="featured-editor" className="text-xl font-semibold text-fg">
          Featured this week
        </h2>
        <p>Goes live on the home page within the hour.</p>
      </div>
      {loadFailed ? (
        <Notice tone="error" role="alert">
          Could not load featured picks. Reload to try again.
        </Notice>
      ) : !catalog ? (
        <p role="status">Loading featured picks…</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          className="space-y-4"
        >
          <p>
            {saved ? (
              <>
                Saved for the week of{' '}
                <time dateTime={saved.week_of}>
                  {formatFeaturedWeek(saved.week_of)}
                </time>
                {saved.items.length ? (
                  <>
                    {' '}
                    ·{' '}
                    {saved.items
                      .map((item) => names.get(keyOf(item)) ?? item.id)
                      .join(', ')}
                  </>
                ) : (
                  <> · No picks</>
                )}
              </>
            ) : (
              'No featured picks saved yet.'
            )}
          </p>

          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <label className="block">
              <span className="mb-1 block font-medium text-fg">
                Search public items
              </span>
              <input
                type="search"
                ref={searchInput}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault()
                }}
                className={`${inputClass()} h-10`}
                placeholder="Search agents, skills, and councils"
                disabled={items.length >= MAX_FEATURED_ITEMS}
              />
            </label>
            {items.length < MAX_FEATURED_ITEMS &&
              term &&
              (matches.length ? (
                <ul className="grid gap-1">
                  {matches.map(({ kind, id, name }) => (
                    <li key={keyOf({ kind, id })}>
                      <button
                        type="button"
                        className={smallButton}
                        onClick={() => {
                          change([...items, { kind, id }])
                          setQuery('')
                          const nextFocus =
                            items.length + 1 === MAX_FEATURED_ITEMS
                              ? saveButton
                              : searchInput
                          nextFocus.current?.focus()
                        }}
                      >
                        Add {name} · {KIND_LABEL[kind]}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p role="status">No matching items to add.</p>
              ))}
            <div>
              <h3 className="mb-2 font-semibold text-fg">
                Picks ({items.length} of {MAX_FEATURED_ITEMS})
              </h3>
              <ol className="grid gap-2">
                {items.map((item, index) => {
                  const key = keyOf(item)
                  const name = names.get(key) ?? item.id
                  return (
                    <li
                      key={key}
                      className="space-y-2 rounded-2xl bg-surface p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 break-words font-semibold text-fg">
                          {name}{' '}
                          <span className="font-normal text-fg-muted">
                            · {KIND_LABEL[item.kind]}
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className={smallButton}
                            aria-label={`Move ${name} up`}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            Move up
                          </button>
                          <button
                            type="button"
                            className={smallButton}
                            aria-label={`Move ${name} down`}
                            disabled={index === items.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            Move down
                          </button>
                          <button
                            type="button"
                            className={smallButton}
                            aria-label={`Remove ${name}`}
                            onClick={() =>
                              change(items.filter((_, i) => i !== index))
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <label className="block">
                        <span className="mb-1 block">
                          Note (optional, {MAX_FEATURED_NOTE} characters)
                        </span>
                        <input
                          type="text"
                          className={`${inputClass()} h-10`}
                          value={item.note ?? ''}
                          maxLength={MAX_FEATURED_NOTE}
                          onChange={(event) =>
                            change(
                              items.map((pick, i) =>
                                i === index
                                  ? { ...pick, note: event.target.value }
                                  : pick,
                              ),
                            )
                          }
                        />
                      </label>
                    </li>
                  )
                })}
              </ol>
            </div>
            <div className="flex flex-wrap gap-2">
              <button ref={saveButton} type="submit" className={primaryButton}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className={secondaryButton}
                disabled={!saved?.items.length && !items.length}
                onClick={() => void save(true)}
              >
                Clear
              </button>
            </div>
          </fieldset>
          {error && (
            <Notice tone="error" role="alert">
              {error}
            </Notice>
          )}
          {message && (
            <p role="status" className="text-fg">
              {message}
            </p>
          )}
        </form>
      )}
    </section>
  )
}
