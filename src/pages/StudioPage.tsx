import RequireAccount from '@/components/RequireAccount'
import { PageShell } from '@/components/PageShell'
import { Studio } from '@/components/studio/Studio'
import { useRoute } from '@/router/Router'

export default function StudioPage() {
  const { location } = useRoute()
  const editId = new URLSearchParams(location.search).get('edit')
  return (
    <RequireAccount
      title="Create an Agent"
      purpose="Sign in to build and publish an agent with a guided form."
      reason="Sign in to publish an agent."
    >
      <PageShell title={editId ? 'Edit an agent' : 'Create an Agent'}>
        <p>
          {editId
            ? 'Change your agent step by step, then save it.'
            : 'Tell us what you want your agent to do.'}
        </p>
        {/* Keyed so switching between agents, or from new to edit, starts fresh. */}
        <Studio key={editId ?? 'new'} editId={editId} />
      </PageShell>
    </RequireAccount>
  )
}
