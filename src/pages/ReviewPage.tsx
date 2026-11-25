import { CouncilReviewQueue } from '@/components/councils/CouncilReviewQueue'
import { useEffect, useState } from 'react'
import RequireAccount from '@/components/RequireAccount'
import { PageHold, PageShell } from '@/components/PageShell'
import { FeaturedEditor } from '@/components/review/FeaturedEditor'
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
type Items = 'agents' | 'skills' | 'councils' | 'reports' | 'featured'

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
        className="mt-4 flex w-fit max-w-full flex-wrap rounded-2xl bg-surface-2 p-1 sm:rounded-full"
      >
        {(
          [
            ['agents', 'Agents'],
            ['skills', 'Skills'],
            ['councils', 'Councils'],
            ['reports', 'Reports'],
            ['featured', 'Featured'],
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
              'h-9 flex-1 rounded-full px-4 text-sm font-medium transition sm:flex-none',
              items === value
                ? 'bg-surface text-fg'
                : 'text-fg-muted hover:text-fg',
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
      <div hidden={items !== 'featured'}>
        {seen.has('featured') && <FeaturedEditor />}
      </div>
    </PageShell>
  )
}
