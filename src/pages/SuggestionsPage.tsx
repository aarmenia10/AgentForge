import { useEffect, useState } from 'react'
import RequireAccount from '@/components/RequireAccount'
import { PageShell } from '@/components/PageShell'
import { AgentCard } from '@/components/AgentCard'
import { AgentDetailModal } from '@/components/detail/AgentDetailModal'
import { SkillCard } from '@/components/skills/SkillCard'
import { Link } from '@/router/Router'
import { computeSuggestions, type SuggestionsResult } from '@/lib/suggestions'
import type { AgentManifest } from '@/types/agent'
import type { SkillIndexEntry } from '@/types/skill'

export default function SuggestionsPage() {
  return (
    <RequireAccount
      title="Suggestions"
      purpose="Sign in to see agent and skill suggestions based on your answers."
      reason="Sign in to see your suggestions."
    >
      <PageShell title="Suggestions">
        <SuggestionsContent />
      </PageShell>
    </RequireAccount>
  )
}

type LoadState =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; result: SuggestionsResult }

function SuggestionsContent() {
  const [loadState, setLoadState] = useState<LoadState>({ state: 'loading' })
  const [openAgent, setOpenAgent] = useState<AgentManifest | null>(null)

  useEffect(() => {
    let active = true

    async function fetchData() {
      try {
        const [{ getPreferences }, catalogRes, skillsRes] = await Promise.all([
          import('@/services/preferences'),
          fetch('/catalog.json'),
          fetch('/skills.json').catch(() => null),
        ])
        const [prefs, catalogData, skillsData] = await Promise.all([
          getPreferences(),
          catalogRes.json() as Promise<AgentManifest[]>,
          skillsRes
            ? (skillsRes.json().catch(() => ({ skills: [] })) as Promise<{
                skills?: SkillIndexEntry[]
              }>)
            : Promise.resolve({ skills: [] as SkillIndexEntry[] }),
        ])
        if (!active) return
        const result = computeSuggestions(
          prefs ?? {},
          catalogData,
          skillsData.skills ?? [],
        )
        setLoadState({ state: 'ready', result })
      } catch {
        if (!active) return
        setLoadState({ state: 'error', message: 'Could not load suggestions.' })
      }
    }

    void fetchData()

    function onPreferencesUpdated() {
      void fetchData()
    }
    window.addEventListener('preferences-updated', onPreferencesUpdated)

    return () => {
      active = false
      window.removeEventListener('preferences-updated', onPreferencesUpdated)
    }
  }, [])

  if (loadState.state === 'loading')
    return (
      <p aria-busy="true" className="mt-6 text-sm text-slate-500">
        Loading suggestions…
      </p>
    )
  if (loadState.state === 'error')
    return (
      <p role="alert" className="mt-6 text-sm text-rose-700 dark:text-rose-300">
        {loadState.message}
      </p>
    )

  const { result } = loadState
  return (
    <div className="mt-6 space-y-10">
      {result.few_matches && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          More will appear as people publish.{' '}
          <Link
            to="/settings#settings-preferences"
            className="underline hover:text-teal-600 dark:hover:text-teal-300"
          >
            Change your answers
          </Link>{' '}
          to see different suggestions.
        </p>
      )}

      {result.agents.length > 0 && (
        <section aria-labelledby="suggested-agents-heading">
          <h2
            id="suggested-agents-heading"
            className="mb-4 text-lg font-semibold text-slate-900 dark:text-white"
          >
            Suggested agents
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {result.agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onOpen={(a) => setOpenAgent(a)}
              />
            ))}
          </div>
        </section>
      )}

      {result.skills.length > 0 && (
        <section aria-labelledby="suggested-skills-heading">
          <h2
            id="suggested-skills-heading"
            className="mb-4 text-lg font-semibold text-slate-900 dark:text-white"
          >
            Suggested skills
          </h2>
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {result.skills.map((skill) => (
              <li key={skill.id}>
                <SkillCard skill={skill} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.agents.length === 0 && result.skills.length === 0 && (
        <p className="text-sm text-slate-500">
          No suggestions yet. More will appear as people publish.
        </p>
      )}

      <p className="text-sm text-slate-500">
        <Link
          to="/settings#settings-preferences"
          className="underline hover:text-teal-600 dark:hover:text-teal-300"
        >
          Change your answers
        </Link>{' '}
        to update these suggestions.
      </p>

      {openAgent && (
        <AgentDetailModal
          key={openAgent.id}
          agent={openAgent}
          onClose={() => setOpenAgent(null)}
        />
      )}
    </div>
  )
}
