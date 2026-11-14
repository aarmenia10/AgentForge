import RequireAccount from '@/components/RequireAccount'
import { PageShell } from '@/components/PageShell'

export default function MePage() {
  return (
    <RequireAccount
      title="My agents"
      purpose="Sign in to see the agents you publish and the agents friends share with you."
      reason="Sign in to see your agents."
    >
      <PageShell title="My agents">
        <p>
          Your agents and the ones friends share with you will be listed here.
          This page is not built yet.
        </p>
      </PageShell>
    </RequireAccount>
  )
}
