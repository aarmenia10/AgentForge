import { useEffect, useState } from 'react'
import { primaryButton } from '@/components/studio/parts'
import type { UserPreferences } from '@/services/preferences'

const USE_FOR_OPTIONS = [
  'School',
  'My job',
  'Coding projects',
  'Writing',
  'Research',
  'Business',
  'Personal projects',
]

const GOALS_OPTIONS = [
  'Find agents and skills to use',
  'Share my own',
  'Use my own skills in all my AI apps',
  'Just looking',
]

const AI_APPS_OPTIONS = ['Claude', 'ChatGPT', 'Gemini', 'Cursor', 'Codex']

const HELP_TOPICS_OPTIONS = [
  'Coding',
  'Writing',
  'Research',
  'Data analysis',
  'DevOps',
  'Planning and operations',
]

type LoadState =
  | { state: 'loading' }
  | { state: 'ready'; prefs: UserPreferences }
  | { state: 'error'; message: string }

export function PreferencesSection() {
  const [load, setLoad] = useState<LoadState>({ state: 'loading' })
  const [useFor, setUseFor] = useState<Set<string>>(new Set())
  const [useForOther, setUseForOther] = useState('')
  const [goals, setGoals] = useState<Set<string>>(new Set())
  const [goalsOther, setGoalsOther] = useState('')
  const [aiApps, setAiApps] = useState<Set<string>>(new Set())
  const [aiAppsOther, setAiAppsOther] = useState('')
  const [helpTopics, setHelpTopics] = useState<Set<string>>(new Set())
  const [helpTopicsOther, setHelpTopicsOther] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSavedStatus] = useState(false)

  useEffect(() => {
    let active = true
    import('@/services/preferences')
      .then(({ getPreferences }) => getPreferences())
      .then((prefs) => {
        if (!active) return
        const p = prefs ?? {}
        if (p.use_for) {
          const uSet = new Set<string>()
          for (const u of p.use_for) {
            if (USE_FOR_OPTIONS.includes(u)) {
              uSet.add(u)
            } else {
              uSet.add('Other')
              setUseForOther(u)
            }
          }
          setUseFor(uSet)
        }
        if (p.goals) {
          const gSet = new Set<string>()
          for (const g of p.goals) {
            if (GOALS_OPTIONS.includes(g)) {
              gSet.add(g)
            } else {
              gSet.add('Other')
              setGoalsOther(g)
            }
          }
          setGoals(gSet)
        }
        if (p.ai_apps) {
          const aSet = new Set<string>()
          for (const a of p.ai_apps) {
            if (AI_APPS_OPTIONS.includes(a)) {
              aSet.add(a)
            } else {
              aSet.add('Other')
              setAiAppsOther(a)
            }
          }
          setAiApps(aSet)
        }
        if (p.help_topics) {
          const hSet = new Set<string>()
          for (const h of p.help_topics) {
            if (HELP_TOPICS_OPTIONS.includes(h)) {
              hSet.add(h)
            } else {
              hSet.add('Other')
              setHelpTopicsOther(h)
            }
          }
          setHelpTopics(hSet)
        }
        setLoad({ state: 'ready', prefs: p })
      })
      .catch(
        () =>
          active &&
          setLoad({ state: 'error', message: 'Could not load your answers.' }),
      )
    return () => {
      active = false
    }
  }, [])

  function toggle(
    set: Set<string>,
    setSet: (s: Set<string>) => void,
    v: string,
  ) {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setSet(next)
  }

  async function onSave() {
    if (saving) return
    setSaving(true)
    setSavedStatus(false)
    try {
      const resolvedUseFor = [...useFor].map((u) =>
        u === 'Other' ? useForOther.trim() || 'Other' : u,
      )
      const resolvedGoals = [...goals].map((g) =>
        g === 'Other' ? goalsOther.trim() || 'Other' : g,
      )
      const resolvedAiApps = [...aiApps].map((a) =>
        a === 'Other' ? aiAppsOther.trim() || 'Other' : a,
      )
      const resolvedHelpTopics = [...helpTopics].map((h) =>
        h === 'Other' ? helpTopicsOther.trim() || 'Other' : h,
      )

      const { savePreferences } = await import('@/services/preferences')
      await savePreferences({
        ...(resolvedUseFor.length > 0 ? { use_for: resolvedUseFor } : {}),
        ...(resolvedGoals.length > 0 ? { goals: resolvedGoals } : {}),
        ...(resolvedAiApps.length > 0 ? { ai_apps: resolvedAiApps } : {}),
        ...(resolvedHelpTopics.length > 0
          ? { help_topics: resolvedHelpTopics }
          : {}),
      })
      setSavedStatus(true)
      window.dispatchEvent(new CustomEvent('preferences-updated'))
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  if (load.state === 'loading')
    return (
      <p aria-busy="true" className="text-sm text-slate-500">
        Loading…
      </p>
    )
  if (load.state === 'error')
    return (
      <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
        {load.message}
      </p>
    )

  function OptionBtn({
    value,
    selected,
    onClick,
  }: {
    value: string
    selected: boolean
    onClick: () => void
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={[
          'rounded-lg border px-3 py-1.5 text-sm transition',
          selected
            ? 'border-teal-500 bg-teal-500/10 text-teal-700 dark:border-teal-400 dark:bg-teal-400/10 dark:text-teal-300'
            : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5',
        ].join(' ')}
      >
        {value}
      </button>
    )
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-900 dark:text-white">
          What will you use AgentLemon for?
        </legend>
        <div className="flex flex-wrap gap-2">
          {USE_FOR_OPTIONS.map((opt) => (
            <OptionBtn
              key={opt}
              value={opt}
              selected={useFor.has(opt)}
              onClick={() => toggle(useFor, setUseFor, opt)}
            />
          ))}
          <OptionBtn
            value="Other"
            selected={useFor.has('Other')}
            onClick={() => toggle(useFor, setUseFor, 'Other')}
          />
        </div>
        {useFor.has('Other') && (
          <input
            type="text"
            maxLength={60}
            placeholder="What else?"
            value={useForOther}
            onChange={(e) => setUseForOther(e.target.value)}
            className="mt-2 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-900 dark:text-white">
          What do you want AgentLemon for?
        </legend>
        <div className="flex flex-wrap gap-2">
          {GOALS_OPTIONS.map((opt) => (
            <OptionBtn
              key={opt}
              value={opt}
              selected={goals.has(opt)}
              onClick={() => toggle(goals, setGoals, opt)}
            />
          ))}
          <OptionBtn
            value="Other"
            selected={goals.has('Other')}
            onClick={() => toggle(goals, setGoals, 'Other')}
          />
        </div>
        {goals.has('Other') && (
          <input
            type="text"
            maxLength={60}
            placeholder="What else?"
            value={goalsOther}
            onChange={(e) => setGoalsOther(e.target.value)}
            className="mt-2 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-900 dark:text-white">
          Which AI apps do you use?
        </legend>
        <div className="flex flex-wrap gap-2">
          {AI_APPS_OPTIONS.map((opt) => (
            <OptionBtn
              key={opt}
              value={opt}
              selected={aiApps.has(opt)}
              onClick={() => toggle(aiApps, setAiApps, opt)}
            />
          ))}
          <OptionBtn
            value="Other"
            selected={aiApps.has('Other')}
            onClick={() => toggle(aiApps, setAiApps, 'Other')}
          />
        </div>
        {aiApps.has('Other') && (
          <input
            type="text"
            maxLength={60}
            placeholder="Which app?"
            value={aiAppsOther}
            onChange={(e) => setAiAppsOther(e.target.value)}
            className="mt-2 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-900 dark:text-white">
          What do you want help with?
        </legend>
        <div className="flex flex-wrap gap-2">
          {HELP_TOPICS_OPTIONS.map((opt) => (
            <OptionBtn
              key={opt}
              value={opt}
              selected={helpTopics.has(opt)}
              onClick={() => toggle(helpTopics, setHelpTopics, opt)}
            />
          ))}
          <OptionBtn
            value="Other"
            selected={helpTopics.has('Other')}
            onClick={() => toggle(helpTopics, setHelpTopics, 'Other')}
          />
        </div>
        {helpTopics.has('Other') && (
          <input
            type="text"
            maxLength={60}
            placeholder="What else?"
            value={helpTopicsOther}
            onChange={(e) => setHelpTopicsOther(e.target.value)}
            className="mt-2 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        )}
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className={primaryButton}
        >
          {saving ? 'Saving…' : 'Save answers'}
        </button>
        {saved && (
          <p role="status" className="text-sm text-teal-700 dark:text-teal-300">
            Saved. Your suggestions will update.
          </p>
        )}
      </div>
    </div>
  )
}
