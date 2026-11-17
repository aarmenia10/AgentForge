import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AgentDetailModal } from '@/components/detail/AgentDetailModal'
import { Notice, smallButton } from '@/components/studio/parts'
import { describeServiceError } from '@/lib/studioErrors'
import { listSharedAgents } from '@/services/agents'
import {
  getProfile,
  listRelationships,
  type Relationship,
  type UserProfile,
} from '@/services/profiles'
import type { AgentRecord } from '@/types/agent'

const FRIENDS_PAGE = 20
const AGENTS_PAGE = 20

export function SharedWithMe() {
  const [friends, setFriends] = useState<Relationship[]>([])
  const [profiles, setProfiles] = useState<Map<string, UserProfile | null>>(
    new Map(),
  )
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<AgentRecord | null>(null)

  const loadPage = useCallback(async (after?: string) => {
    setLoading(true)
    setError('')
    try {
      const page = await listRelationships('accepted', FRIENDS_PAGE, after)
      setFriends((current) =>
        after ? [...current, ...page.items] : page.items,
      )
      setCursor(
        page.cursor && page.items.length === FRIENDS_PAGE ? page.cursor : null,
      )
      // One read per friend on this page, for the name on the row.
      const found = await Promise.all(
        page.items.map((r) => getProfile(r.uid).catch(() => null)),
      )
      setProfiles((current) => {
        const next = new Map(current)
        page.items.forEach((r, i) => next.set(r.uid, found[i]))
        return next
      })
    } catch (e) {
      setError(describeServiceError(e, 'list'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  if (!loading && !error && friends.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-white/15">
        <p>No friends yet.</p>
        <p className="mt-2">
          Once you and someone else accept each other as friends, the agents
          they share with friends appear here.
        </p>
      </div>
    )

  return (
    <div className="space-y-3">
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <ul className="space-y-2">
        {friends.map((friend) => (
          <FriendRow
            key={friend.uid}
            uid={friend.uid}
            profile={profiles.get(friend.uid) ?? null}
            onOpen={setOpen}
          />
        ))}
      </ul>
      {loading && (
        <p className="inline-flex items-center gap-2" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading your friends…
        </p>
      )}
      {cursor && !loading && (
        <button
          type="button"
          className={smallButton}
          onClick={() => loadPage(cursor)}
        >
          Show more friends
        </button>
      )}
      {open && (
        <AgentDetailModal
          agent={open}
          onClose={() => setOpen(null)}
          installable={false}
        />
      )}
    </div>
  )
}

function FriendRow({
  uid,
  profile,
  onOpen,
}: {
  uid: string
  profile: UserProfile | null
  onOpen: (agent: AgentRecord) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [agents, setAgents] = useState<AgentRecord[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const panelId = `friend-${uid}`
  const name = profile ? `@${profile.handle}` : 'A friend'

  async function load(after?: string) {
    setLoading(true)
    setError('')
    try {
      const page = await listSharedAgents(uid, AGENTS_PAGE, after)
      setAgents((current) =>
        after && current ? [...current, ...page.items] : page.items,
      )
      setCursor(
        page.cursor && page.items.length === AGENTS_PAGE ? page.cursor : null,
      )
    } catch (e) {
      setError(describeServiceError(e, 'list'))
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    // Loaded only when opened, to keep database reads low.
    if (next && agents === null && !loading) void load()
  }

  return (
    <li className="rounded-xl border border-slate-900/10 dark:border-white/10">
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={toggle}
          className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left hover:bg-slate-900/5 dark:hover:bg-white/5"
        >
          {expanded ? (
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 break-words font-semibold text-slate-900 dark:text-white">
            {name}
          </span>
          {profile?.display_name && (
            <span className="min-w-0 truncate text-slate-600 dark:text-slate-400">
              {profile.display_name}
            </span>
          )}
        </button>
      </h3>
      {expanded && (
        <div id={panelId} className="space-y-2 px-4 pb-4">
          {error && (
            <Notice tone="error" role="alert">
              {error}
            </Notice>
          )}
          {agents && agents.length === 0 && (
            <p>{name} has not shared any agents with friends yet.</p>
          )}
          {agents && agents.length > 0 && (
            <ul className="space-y-2">
              {agents.map((agent) => (
                <li
                  key={agent.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/5 px-3 py-2 dark:bg-white/5"
                >
                  <span className="min-w-0">
                    <span className="block break-words font-medium text-slate-900 dark:text-white">
                      {agent.name}
                    </span>
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                      v{agent.version}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={smallButton}
                    onClick={() => onOpen(agent)}
                  >
                    Open<span className="sr-only"> {agent.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {loading && (
            <p className="inline-flex items-center gap-2" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading…
            </p>
          )}
          {cursor && !loading && (
            <button
              type="button"
              className={smallButton}
              onClick={() => load(cursor)}
            >
              Show more
            </button>
          )}
        </div>
      )}
    </li>
  )
}
