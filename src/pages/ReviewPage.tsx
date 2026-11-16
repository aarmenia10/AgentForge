import { useEffect, useState } from 'react'
import RequireAccount from '@/components/RequireAccount'
import { PageHold, PageShell } from '@/components/PageShell'
import { ReviewQueue } from '@/components/review/ReviewQueue'

export default function ReviewPage() {
  return (
    <RequireAccount
      title="Review queue"
      purpose="Reviewers sign in here to approve or reject agents submitted for the public catalog."
      reason="Sign in to open the review queue."
    >
      <ReviewerOnly />
    </RequireAccount>
  )
}

type Access = 'checking' | 'admin' | 'not-admin' | 'error'

function ReviewerOnly() {
  const [access, setAccess] = useState<Access>('checking')

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
        Read each manifest in full before you decide. The safety linter helps,
        but you are the check that counts.
      </p>
      <ReviewQueue />
    </PageShell>
  )
}
