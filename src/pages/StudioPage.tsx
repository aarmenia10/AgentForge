import RequireAccount from '@/components/RequireAccount'
import { PageShell } from '@/components/PageShell'
import { Studio } from '@/components/studio/Studio'
import { useRoute } from '@/router/Router'

export default function StudioPage() {
  const { location } = useRoute()
  const editId = new URLSearchParams(location.search).get('edit')
  return (
    <RequireAccount
      title="Agent Studio"
      purpose="Sign in to build and publish an agent with a guided form."
      reason="Sign in to publish an agent."
    >
      <PageShell title={editId ? 'Edit an agent' : 'Agent Studio'}>
        <p>
          {editId
            ? 'Change your agent step by step, then save it.'
            : 'Build an agent step by step. No JSON needed.'}
        </p>
        {/* Keyed so switching between agents, or from new to edit, starts fresh. */}
        <Studio key={editId ?? 'new'} editId={editId} />
      </PageShell>
    </RequireAccount>
  )
}
