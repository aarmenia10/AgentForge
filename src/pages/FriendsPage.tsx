import { Loader2, Search } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { PersonRow, type PersonInfo } from '@/components/friends/PersonRow'
import {
  personState,
  sendBlocker,
  splitRelationships,
  type RelationshipLink,
} from '@/components/friends/relationships'
import RequireAccount from '@/components/RequireAccount'
import { PageShell } from '@/components/PageShell'
import { rememberProfile } from '@/components/profile/profileMemory'
import {
  dangerButton,
  inputClass,
  primaryButton,
  smallButton,
} from '@/components/studio/parts'
import { cn } from '@/components/ui'
import { describeServiceError, isPermissionDenied } from '@/lib/studioErrors'
import { Link } from '@/router/Router'
import {
  acceptFriendRequest,
  getProfile,
  listRelationships,
  removeFriendship,
  searchProfiles,
  sendFriendRequest,
} from '@/services/profiles'

export default function FriendsPage() {
  return (
    <RequireAccount
      title="Friends"
      purpose="Sign in to find people by username and manage your friends."
      reason="Sign in to see your friends."
    >
      <PageShell title="Friends">
        <Friends />
      </PageShell>
    </RequireAccount>
  )
}

const PAGE_SIZE = 50

/** An error whose message is already written for people. */
class PlainError extends Error {}

type Load =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready' }

function Friends() {
  const { user } = useAuth()
  const me = user?.uid ?? ''
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [hasProfile, setHasProfile] = useState(false)
  const [links, setLinks] = useState<RelationshipLink[]>([])
  const [people, setPeople] = useState<Record<string, PersonInfo>>({})
  const [cursor, setCursor] = useState<string | null>(null)
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const loadPeople = useCallback(async (uids: string[]) => {
    const found = await Promise.all(
      uids.map((uid) => getProfile(uid).catch(() => null)),
    )
    setPeople((current) => {
      const next = { ...current }
      uids.forEach((uid, index) => {
        const profile = found[index]
        next[uid] = {
          uid,
          handle: profile?.handle ?? null,
          display_name: profile?.display_name ?? null,
        }
      })
      return next
    })
  }, [])

  const loadPage = useCallback(
    async (after?: string) => {
      const page = await listRelationships(undefined, PAGE_SIZE, after)
      setLinks((current) => (after ? [...current, ...page.items] : page.items))
      setCursor(page.items.length === PAGE_SIZE ? page.cursor : null)
      await loadPeople(page.items.map((item) => item.uid))
    },
    [loadPeople],
  )

  useEffect(() => {
    if (!me) return
    let active = true
    Promise.all([getProfile(me), loadPage()])
      .then(([profile]) => {
        if (!active) return
        if (profile) rememberProfile(me, profile.handle)
        setHasProfile(profile !== null)
        setLoad({ state: 'ready' })
      })
      .catch(
        (error) =>
          active &&
          setLoad({
            state: 'error',
            message: describeServiceError(error, 'list'),
          }),
      )
    return () => {
      active = false
    }
  }, [me, loadPage])

  if (!user) return null
  if (load.state === 'loading') return <p aria-busy="true">Loading.</p>
  if (load.state === 'error') return <p role="alert">{load.message}</p>

  const split = splitRelationships(links, me)
  const blocker = sendBlocker(user.emailVerified, hasProfile)

  async function run(uid: string, action: () => Promise<void>, fail: string) {
    if (busyUid) return
    setBusyUid(uid)
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(
        error instanceof PlainError
          ? `${fail} ${error.message}`
          : isPermissionDenied(error)
            ? `${fail} The server refused it. Reload the page and try again.`
            : `${fail} ${describeServiceError(error, 'save')}`,
      )
    } finally {
      setBusyUid(null)
    }
  }

  const accept = (uid: string) =>
    run(
      uid,
      async () => {
        await acceptFriendRequest(uid)
        setLinks((current) =>
          current.map((link) =>
            link.uid === uid ? { ...link, status: 'accepted' } : link,
          ),
        )
      },
      'Could not accept the request.',
    )

  const remove = (uid: string, fail: string) =>
    run(
      uid,
      async () => {
        await removeFriendship(uid)
        setLinks((current) => current.filter((link) => link.uid !== uid))
        setConfirmRemove(null)
      },
      fail,
    )

  const send = (person: PersonInfo) => {
    if (blocker) {
      setActionError(blocker)
      return
    }
    return run(
      person.uid,
      async () => {
        try {
          await sendFriendRequest(person.uid)
        } catch (error) {
          if (isPermissionDenied(error))
            throw new PlainError(
              'The server refused it. They may have sent you a request at the same moment. Reload the page to check.',
            )
          throw error
        }
        setPeople((current) => ({ ...current, [person.uid]: person }))
        setLinks((current) => [
          ...current,
          { uid: person.uid, sender_uid: me, status: 'pending' },
        ])
      },
      'Could not send the request.',
    )
  }

  const personOf = (uid: string): PersonInfo =>
    people[uid] ?? { uid, handle: null, display_name: null }
  const busy = (uid: string) => busyUid === uid

  return (
    <div className="mt-6 space-y-10 text-sm">
      <section aria-labelledby="friends-find" className="space-y-3">
        <h2 id="friends-find" className="text-lg font-semibold text-fg">
          Find people
        </h2>
        <p>
          Friends see each other&apos;s friends-only agents. A friendship starts
          when one of you sends a request and the other accepts it.
        </p>
        {blocker && (
          <p className="rounded-3xl bg-surface p-4 text-fg">
            {blocker}{' '}
            <Link
              to="/settings"
              className="font-semibold underline underline-offset-2"
            >
              Open Settings
            </Link>
          </p>
        )}
        <FindPeople
          me={me}
          stateOf={(uid) => personState(uid, me, split)}
          onSend={send}
          onAccept={accept}
          busy={busy}
          blocked={blocker !== null}
        />
      </section>

      {actionError && (
        <p role="alert" className="text-fg">
          {actionError}
        </p>
      )}

      <PeopleList
        id="friends-incoming"
        title="Requests to you"
        empty="No requests right now."
      >
        {split.incoming.map(({ uid }) => (
          <PersonRow key={uid} person={personOf(uid)}>
            <button
              type="button"
              onClick={() => accept(uid)}
              aria-disabled={busy(uid) || undefined}
              className={cn(primaryButton, 'h-9 px-4 text-xs')}
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => remove(uid, 'Could not decline the request.')}
              aria-disabled={busy(uid) || undefined}
              className={smallButton}
            >
              Decline
            </button>
          </PersonRow>
        ))}
      </PeopleList>

      <PeopleList
        id="friends-outgoing"
        title="Requests you sent"
        empty="You have no requests waiting."
      >
        {split.outgoing.map(({ uid }) => (
          <PersonRow key={uid} person={personOf(uid)}>
            <button
              type="button"
              onClick={() => remove(uid, 'Could not cancel the request.')}
              aria-disabled={busy(uid) || undefined}
              className={smallButton}
            >
              Cancel request
            </button>
          </PersonRow>
        ))}
      </PeopleList>

      <PeopleList
        id="friends-list"
        title="Friends"
        empty="No friends yet. Find people by username above."
      >
        {split.friends.map(({ uid }) => {
          const person = personOf(uid)
          const name = person.handle ? `@${person.handle}` : 'this friend'
          return (
            <PersonRow key={uid} person={person}>
              {confirmRemove === uid ? (
                <>
                  <span className="text-fg">Remove {name}?</span>
                  <button
                    type="button"
                    onClick={() => remove(uid, 'Could not remove this friend.')}
                    aria-disabled={busy(uid) || undefined}
                    className={cn(dangerButton, 'h-9 px-3 text-xs')}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(null)}
                    className={smallButton}
                  >
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(uid)}
                  aria-label={`Remove ${name} as a friend`}
                  className={smallButton}
                >
                  Remove
                </button>
              )}
            </PersonRow>
          )
        })}
      </PeopleList>

      {cursor && (
        <button
          type="button"
          onClick={() =>
            void loadPage(cursor).catch((error) =>
              setActionError(describeServiceError(error, 'list')),
            )
          }
          className={smallButton}
        >
          Load more
        </button>
      )}
    </div>
  )
}

function PeopleList({
  id,
  title,
  empty,
  children,
}: {
  id: string
  title: string
  empty: string
  children: ReactNode[]
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold text-fg">
        {title}{' '}
        <span className="font-normal text-fg-muted">({children.length})</span>
      </h2>
      {children.length === 0 ? (
        <p className="mt-2">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">{children}</ul>
      )}
    </section>
  )
}

function FindPeople({
  me,
  stateOf,
  onSend,
  onAccept,
  busy,
  blocked,
}: {
  me: string
  stateOf: (uid: string) => ReturnType<typeof personState>
  onSend: (person: PersonInfo) => void
  onAccept: (uid: string) => void
  busy: (uid: string) => boolean
  blocked: boolean
}) {
  const [text, setText] = useState('')
  const [results, setResults] = useState<PersonInfo[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const hintId = useId()

  async function onSearch(event: FormEvent) {
    event.preventDefault()
    const prefix = text.trim().replace(/^@/, '').toLowerCase()
    if (!/^[a-z0-9-]{1,30}$/.test(prefix)) {
      setError('Type the start of a username: letters, digits, or hyphens.')
      return
    }
    setSearching(true)
    setError(null)
    try {
      const page = await searchProfiles(prefix, 10)
      setResults(
        page.items.map((p) => ({
          uid: p.uid,
          handle: p.handle,
          display_name: p.display_name,
        })),
      )
    } catch (err) {
      setError(describeServiceError(err, 'list'))
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSearch} role="search" className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Username
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
            aria-hidden="true"
          />
          <input
            id={inputId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Username, or its first letters"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={error ? hintId : undefined}
            className={cn(inputClass(Boolean(error)), 'h-10 pl-9')}
          />
        </div>
        <button
          type="submit"
          className={primaryButton}
          aria-disabled={searching || undefined}
        >
          {searching && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          Search
        </button>
      </form>
      {error && (
        <p id={hintId} role="alert" className="text-fg">
          {error}
        </p>
      )}
      {results && (
        <div aria-live="polite">
          {results.length === 0 ? (
            <p>No one has a username starting with that.</p>
          ) : (
            <ul aria-label="Search results" className="divide-y divide-line">
              {results.map((person) => (
                <PersonRow key={person.uid} person={person}>
                  <ResultAction
                    state={person.uid === me ? 'self' : stateOf(person.uid)}
                    busy={busy(person.uid)}
                    blocked={blocked}
                    onSend={() => onSend(person)}
                    onAccept={() => onAccept(person.uid)}
                    handle={person.handle ?? ''}
                  />
                </PersonRow>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ResultAction({
  state,
  busy,
  blocked,
  onSend,
  onAccept,
  handle,
}: {
  state: ReturnType<typeof personState>
  busy: boolean
  blocked: boolean
  onSend: () => void
  onAccept: () => void
  handle: string
}) {
  const quiet = 'text-xs text-fg-muted'
  switch (state) {
    case 'self':
      return <span className={quiet}>This is you</span>
    case 'friend':
      return <span className={quiet}>Friends</span>
    case 'outgoing':
      return <span className={quiet}>Request sent</span>
    case 'incoming':
      return (
        <button
          type="button"
          onClick={onAccept}
          aria-disabled={busy || undefined}
          className={smallButton}
        >
          Accept request
        </button>
      )
    default:
      return (
        <button
          type="button"
          onClick={onSend}
          aria-disabled={busy || blocked || undefined}
          aria-label={`Send a friend request to @${handle}`}
          className={smallButton}
        >
          {busy ? 'Sending' : 'Send request'}
        </button>
      )
  }
}
