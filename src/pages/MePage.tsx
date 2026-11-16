import RequireAccount from '@/components/RequireAccount'
import { PageShell } from '@/components/PageShell'
import { MyAgents } from '@/components/me/MyAgents'
import { SharedWithMe } from '@/components/me/SharedWithMe'
import { primaryButton } from '@/components/studio/parts'
import { Link } from '@/router/Router'

export default function MePage() {
  return (
    <RequireAccount
      title="My agents"
      purpose="Sign in to see the agents you publish and the agents friends share with you."
      reason="Sign in to see your agents."
    >
      <PageShell title="My agents">
        <div className="mt-2 space-y-10 text-sm">
          <section aria-labelledby="me-mine" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="me-mine"
                className="text-lg font-semibold text-slate-900 dark:text-white"
              >
                Agents you made
              </h2>
              <Link to="/studio" className={primaryButton}>
                New agent
              </Link>
            </div>
            <MyAgents />
          </section>
          <section aria-labelledby="me-shared" className="space-y-3">
            <h2
              id="me-shared"
              className="text-lg font-semibold text-slate-900 dark:text-white"
            >
              Shared with me
            </h2>
            <p>
              Agents your friends share with friends. Open a friend to see
              theirs.
            </p>
            <SharedWithMe />
          </section>
        </div>
      </PageShell>
    </RequireAccount>
  )
}
