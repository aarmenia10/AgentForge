import { useState } from 'react'
import { primaryButton, secondaryButton } from '@/components/studio/parts'

interface PreferencesStepProps {
  onDone: (saved: boolean) => void
}

export function PreferencesStep({ onDone }: PreferencesStepProps) {
  const [useFor, setUseFor] = useState<Set<string>>(new Set())
  const [useForOther, setUseForOther] = useState('')
  const [goals, setGoals] = useState<Set<string>>(new Set())
  const [goalsOther, setGoalsOther] = useState('')
  const [aiApps, setAiApps] = useState<Set<string>>(new Set())
  const [aiAppsOther, setAiAppsOther] = useState('')
  const [helpTopics, setHelpTopics] = useState<Set<string>>(new Set())
  const [helpTopicsOther, setHelpTopicsOther] = useState('')
  const [saving, setSaving] = useState(false)

  function toggleMulti(
    set: Set<string>,
    setSet: (s: Set<string>) => void,
    value: string,
  ) {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setSet(next)
  }

  async function onSubmit(skip = false) {
    if (saving) return
    setSaving(true)
    try {
      if (!skip) {
        const resolveUseFor = [...useFor].map((u) =>
          u === 'Other' ? useForOther.trim() || 'Other' : u,
        )
        const resolveGoals = [...goals].map((g) =>
          g === 'Other' ? goalsOther.trim() || 'Other' : g,
        )
        const resolveAiApps = [...aiApps].map((a) =>
          a === 'Other' ? aiAppsOther.trim() || 'Other' : a,
        )
        const resolveHelpTopics = [...helpTopics].map((h) =>
          h === 'Other' ? helpTopicsOther.trim() || 'Other' : h,
        )
        const { savePreferences } = await import('@/services/preferences')
        await savePreferences({
          ...(resolveUseFor.length > 0 ? { use_for: resolveUseFor } : {}),
          ...(resolveGoals.length > 0 ? { goals: resolveGoals } : {}),
          ...(resolveAiApps.length > 0 ? { ai_apps: resolveAiApps } : {}),
          ...(resolveHelpTopics.length > 0
            ? { help_topics: resolveHelpTopics }
            : {}),
        })
        onDone(true)
      } else {
        onDone(false)
      }
    } catch {
      setSaving(false)
    }
  }

  function OptionButton({
    value,
    selected,
    onClick,
    multi,
  }: {
    value: string
    selected: boolean
    onClick: () => void
    multi: boolean
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
        {multi ? '☑' : '◉'} {value}
      </button>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        We use these to suggest relevant agents and skills. All optional.
      </p>

      {/* Q1: use_for, multi pick */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-900 dark:text-white">
          What will you use AgentLemon for?
        </legend>
        <div className="flex flex-wrap gap-2">
          {[
            'School',
            'My job',
            'Coding projects',
            'Writing',
            'Research',
            'Business',
            'Personal projects',
          ].map((opt) => (
            <OptionButton
              key={opt}
              value={opt}
              selected={useFor.has(opt)}
              onClick={() => toggleMulti(useFor, setUseFor, opt)}
              multi={true}
            />
          ))}
          <OptionButton
            value="Other"
            selected={useFor.has('Other')}
            onClick={() => toggleMulti(useFor, setUseFor, 'Other')}
            multi={true}
          />
          {useFor.has('Other') && (
            <input
              type="text"
              maxLength={60}
              placeholder="What else?"
              value={useForOther}
              onChange={(e) => setUseForOther(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          )}
        </div>
      </fieldset>

      {/* Q2: goals, multi pick */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-900 dark:text-white">
          What do you want AgentLemon for?
        </legend>
        <div className="flex flex-wrap gap-2">
          {[
            'Find agents and skills to use',
            'Share my own',
            'Use my own skills in all my AI apps',
            'Just looking',
          ].map((opt) => (
            <OptionButton
              key={opt}
              value={opt}
              selected={goals.has(opt)}
              onClick={() => toggleMulti(goals, setGoals, opt)}
              multi={true}
            />
          ))}
          <OptionButton
            value="Other"
            selected={goals.has('Other')}
            onClick={() => toggleMulti(goals, setGoals, 'Other')}
            multi={true}
          />
          {goals.has('Other') && (
            <input
              type="text"
              maxLength={60}
              placeholder="What else?"
              value={goalsOther}
              onChange={(e) => setGoalsOther(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          )}
        </div>
      </fieldset>

      {/* Q3: ai_apps, multi pick */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-900 dark:text-white">
          Which AI apps do you use?
        </legend>
        <div className="flex flex-wrap gap-2">
          {['Claude', 'ChatGPT', 'Gemini', 'Cursor', 'Codex'].map((opt) => (
            <OptionButton
              key={opt}
              value={opt}
              selected={aiApps.has(opt)}
              onClick={() => toggleMulti(aiApps, setAiApps, opt)}
              multi={true}
            />
          ))}
          <OptionButton
            value="Other"
            selected={aiApps.has('Other')}
            onClick={() => toggleMulti(aiApps, setAiApps, 'Other')}
            multi={true}
          />
          {aiApps.has('Other') && (
            <input
              type="text"
              maxLength={60}
              placeholder="Which app?"
              value={aiAppsOther}
              onChange={(e) => setAiAppsOther(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          )}
        </div>
      </fieldset>

      {/* Q4: help_topics, multi pick */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-900 dark:text-white">
          What do you want help with?
        </legend>
        <div className="flex flex-wrap gap-2">
          {[
            'Coding',
            'Writing',
            'Research',
            'Data analysis',
            'DevOps',
            'Planning and operations',
          ].map((opt) => (
            <OptionButton
              key={opt}
              value={opt}
              selected={helpTopics.has(opt)}
              onClick={() => toggleMulti(helpTopics, setHelpTopics, opt)}
              multi={true}
            />
          ))}
          <OptionButton
            value="Other"
            selected={helpTopics.has('Other')}
            onClick={() => toggleMulti(helpTopics, setHelpTopics, 'Other')}
            multi={true}
          />
          {helpTopics.has('Other') && (
            <input
              type="text"
              maxLength={60}
              placeholder="What else?"
              value={helpTopicsOther}
              onChange={(e) => setHelpTopicsOther(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          )}
        </div>
      </fieldset>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => onSubmit(true)}
          className={secondaryButton}
          disabled={saving}
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={() => onSubmit(false)}
          className={primaryButton}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save answers'}
        </button>
      </div>
    </div>
  )
}
