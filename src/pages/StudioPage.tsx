import RequireAccount from '@/components/RequireAccount'
import { PageShell } from '@/components/PageShell'

export default function StudioPage() {
  return (
    <RequireAccount
      title="Manifest Studio"
      purpose="Sign in to build and publish an agent with a guided form."
      reason="Sign in to publish an agent."
    >
      <PageShell title="Manifest Studio">
        <p>
          A guided form for building and publishing an agent will live here.
          This page is not built yet.
        </p>
      </PageShell>
    </RequireAccount>
  )
}
