import { BadgeCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AgentGrid } from '@/components/AgentGrid'
import { AgentDetailModal } from '@/components/detail/AgentDetailModal'
import { AddFriendButton } from '@/components/profile/AddFriendButton'
import { authorProfile } from '@/components/profile/authorProfile'
import { VERIFIED_AUTHOR_LABEL } from '@/components/ui'
import { agentRepository } from '@/lib/agentRepository'
import { useRoute } from '@/router/Router'
import type { AgentManifest } from '@/types/agent'

/**
 * Public: needs no account. Built from catalog.json alone, so it costs no
 * Firestore reads and works signed out.
 */
export default function ProfilePage() {
  const { route, location } = useRoute()
  const handle = route.params.handle
  const [catalog, setCatalog] = useState<AgentManifest[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    agentRepository
      .listAgents()
      .then((list) => active && setCatalog(list))
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [])

  // Any navigation, including an author link inside the open detail view,
  // closes it.
  useEffect(() => setOpenId(null), [location.key])

  const profile = useMemo(
    () => (catalog ? authorProfile(catalog, handle) : null),
    [catalog, handle],
  )
  const opened = profile?.agents.find((agent) => agent.id === openId) ?? null
  const status = failed ? 'error' : profile ? 'ready' : 'loading'

  return (
    <>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <header className="glass rounded-2xl p-6 sm:p-8">
          <h1
            tabIndex={-1}
            className="break-words text-2xl font-semibold tracking-tight outline-none sm:text-3xl"
          >
            {profile?.displayName ?? `@${handle}`}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
            {profile?.displayName && (
              <span className="font-mono">@{handle}</span>
            )}
            {profile?.verified && (
              <span
                className="inline-flex items-center gap-1 font-medium text-teal-700 dark:text-teal-300"
                title="The registry confirmed who this author is. It is not a safety check or a review of their agents."
              >
                <BadgeCheck className="size-4" aria-hidden="true" />
                {VERIFIED_AUTHOR_LABEL}
              </span>
            )}
          </div>
          {profile && (
            <div className="mt-5">
              <AddFriendButton handle={handle} authorUid={profile.uid} />
            </div>
          )}
        </header>

        <section aria-labelledby="profile-agents" className="mt-10">
          <h2
            id="profile-agents"
            className="mb-4 text-xl font-semibold tracking-tight"
          >
            Public agents
          </h2>
          {status === 'ready' && profile?.agents.length === 0 ? (
            <p className="glass rounded-2xl p-10 text-center text-slate-600 dark:text-slate-300">
              No public agents from @{handle} yet.
            </p>
          ) : (
            <AgentGrid
              agents={profile?.agents ?? []}
              status={status}
              onOpen={(agent) => setOpenId(agent.id)}
              onReset={() => {}}
            />
          )}
        </section>
      </main>

      {opened && (
        <AgentDetailModal
          key={opened.id}
          agent={opened}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  )
}
