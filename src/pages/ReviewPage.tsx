import { CouncilReviewQueue } from '@/components/councils/CouncilReviewQueue'
import { useEffect, useState } from 'react'
import RequireAccount from '@/components/RequireAccount'
import { PageHold, PageShell } from '@/components/PageShell'
import { ReviewQueue } from '@/components/review/ReviewQueue'
import { SkillReviewQueue } from '@/components/skills/SkillReviewQueue'
import { AdminReportsView } from '@/components/ratings/AdminReportsView'
import { cn } from '@/components/ui'

export default function ReviewPage() {
  return (
    <RequireAccount
      title="Review queue"
      purpose="Reviewers sign in here to approve or reject agents, skills, and councils submitted for public listing."
      reason="Sign in to open the review queue."
    >
      <ReviewerOnly />
    </RequireAccount>
  )
}

type Access = 'checking' | 'admin' | 'not-admin' | 'error'
type Items = 'agents' | 'skills' | 'councils' | 'reports'

function ReviewerOnly() {
  const [access, setAccess] = useState<Access>('checking')
  const [items, setItems] = useState<Items>('agents')
  const [seen, setSeen] = useState<Set<Items>>(() => new Set(['agents']))

  useEffect(() => {
    let active = true
    // Firestore loads only for a signed-in visitor who opens this page.
    import('@/services/agents')
      .then(({ isCurrentUserAdmin }) => isCurrentUserAdmin())
      .then((admin) => active && setAccess(admin ? 'admin' : 'not-admin'))
      .catch(() => active && setAccess('error'))
    return () => {
      active = false
    }
  }, [])

  if (access === 'checking') return <PageHold />
  if (access === 'not-admin') {
    return (
      <PageShell title="Review queue">
        <p>This page is for reviewers.</p>
      </PageShell>
    )
  }
  if (access === 'error') {
    return (
      <PageShell title="Review queue">
        <p>Could not check reviewer access. Reload to try again.</p>
      </PageShell>
    )
  }
  return (
    <PageShell title="Review queue">
      <p>
        Read each manifest and every skill file in full before you decide. The
        safety linter helps, but you are the check that counts.
      </p>
      <div
        role="group"
        aria-label="What to review"
        className="mt-4 flex w-full rounded-xl bg-slate-900/5 p-1 sm:w-fit dark:bg-white/5"
      >
        {(
          [
            ['agents', 'Agents'],
            ['skills', 'Skills'],
            ['councils', 'Councils'],
            ['reports', 'Reports'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={items === value}
            onClick={() => {
              setItems(value)
              setSeen((current) => new Set(current).add(value))
            }}
            className={cn(
              'h-8 flex-1 rounded-lg px-4 text-sm font-medium transition sm:flex-none',
              items === value
                ? 'bg-white text-slate-900 shadow-sm dark:bg-navy-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Each list loads the first time it is shown and keeps its state. */}
      <div hidden={items !== 'agents'}>
        <ReviewQueue />
      </div>
      <div hidden={items !== 'skills'}>
        {seen.has('skills') && <SkillReviewQueue />}
      </div>
      <div hidden={items !== 'councils'}>
        {seen.has('councils') && <CouncilReviewQueue />}
      </div>
      <div hidden={items !== 'reports'}>
        {seen.has('reports') && <AdminReportsView />}
      </div>
    </PageShell>
  )
}
