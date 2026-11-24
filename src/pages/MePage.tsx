import { MyCouncils } from '@/components/councils/MyCouncils'
import RequireAccount from '@/components/RequireAccount'
import { PageShell } from '@/components/PageShell'
import { MyAgents } from '@/components/me/MyAgents'
import { SharedWithMe } from '@/components/me/SharedWithMe'
import { FriendSkills } from '@/components/skills/FriendSkills'
import { MySkills } from '@/components/skills/MySkills'
import { primaryButton } from '@/components/studio/parts'
import { Link } from '@/router/Router'

export default function MePage() {
  return (
    <RequireAccount
      title="My items"
      purpose="Sign in to see the agents, skills, and councils you publish, and the ones friends share with you."
      reason="Sign in to see your agents, skills, and councils."
    >
      <PageShell title="My items">
        <div className="mt-2 space-y-10 text-sm">
          <section aria-labelledby="me-mine" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="me-mine" className="text-lg font-semibold text-fg">
                Agents you made
              </h2>
              <Link to="/studio" className={primaryButton}>
                New agent
              </Link>
            </div>
            <MyAgents />
          </section>
          <section aria-labelledby="me-skills" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="me-skills" className="text-lg font-semibold text-fg">
                Skills you made
              </h2>
              <Link to="/skills/new" className={primaryButton}>
                New skill
              </Link>
            </div>
            <MySkills />
          </section>
          <section aria-labelledby="me-councils" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="me-councils" className="text-lg font-semibold text-fg">
                Your councils
              </h2>
              <Link to="/councils" className={primaryButton}>
                Browse councils
              </Link>
            </div>
            <MyCouncils />
          </section>
          <section aria-labelledby="me-shared" className="space-y-3">
            <h2 id="me-shared" className="text-lg font-semibold text-fg">
              Shared with me
            </h2>
            <p>
              Agents, skills, and councils your friends share with friends. Open
              a friend to see theirs.
            </p>
            <SharedWithMe
              friendExtra={(uid, name) => (
                <>
                  <FriendSkills uid={uid} name={name} />
                  <MyCouncils key={uid} owner={uid} />
                </>
              )}
            />
          </section>
        </div>
      </PageShell>
    </RequireAccount>
  )
}
