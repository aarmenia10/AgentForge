import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { PageHold, PageShell } from '@/components/PageShell'
import { primaryButton, textLink } from '@/components/studio/parts'
import {
  formatItemRef,
  itemRefSchema,
  skillManifestSchema,
} from '@/lib/skillSchema'
import { manifestSchema } from '@/lib/manifestSchema'
import { Link, useRoute } from '@/router/Router'
import { publicCouncils, type CouncilItem } from '@/services/councilPublic'

export default function CouncilMemberPage() {
  const { route } = useRoute()
  const { id, kind, version } = route.params
  const { user, openSignIn } = useAuth()
  const uid = user?.uid
  const [member, setMember] = useState<
    (CouncilItem & { public: boolean; accountUid?: string }) | null
  >(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    async function load(): Promise<
      CouncilItem & { public: boolean; accountUid?: string }
    > {
      const ref = itemRefSchema.parse({ id, kind, version })
      try {
        return { ...(await publicCouncils.member(ref)), public: true }
      } catch (error) {
        if (!uid) throw error
      }
      if (kind === 'agent') {
        const { getAgentRecord } = await import('@/services/agents')
        const item = manifestSchema.strip().parse(await getAgentRecord(id))
        if (item.version === version)
          return { kind, item, public: false, accountUid: uid }
      } else {
        const { getSkillRecord } = await import('@/services/skills')
        const item = skillManifestSchema.strip().parse(await getSkillRecord(id))
        if (item.version === version)
          return { kind: 'skill', item, public: false, accountUid: uid }
      }
      throw new Error('Member version unavailable.')
    }
    load()
      .then((value) => {
        if (active) {
          setMember(value)
          setFailed(false)
        }
      })
      .catch(() => {
        if (active) {
          setMember(null)
          setFailed(true)
        }
      })
    return () => {
      active = false
    }
  }, [id, kind, version, uid])
  async function save() {
    if (!member?.public) return
    if (!uid) {
      openSignIn({ reason: 'Sign in to save this member to My items.' })
      return
    }
    setBusy(true)
    try {
      const id =
        member.item.id.slice(0, 1400).replace(/-+$/, '') +
        '-copy-' +
        crypto.randomUUID().slice(0, 8)
      if (member.kind === 'agent') {
        const { createAgent } = await import('@/services/agents')
        await createAgent({ ...member.item, id, visibility: 'private' })
      } else {
        const { createSkill } = await import('@/services/skills')
        await createSkill({ ...member.item, id, visibility: 'private' })
      }
      setMessage('Private copy saved to My items.')
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not save this member.',
      )
    } finally {
      setBusy(false)
    }
  }
  if (failed)
    return (
      <PageShell title="Member unavailable">
        <p>The pinned member version could not be loaded.</p>
        <Link className={textLink} to="/councils">
          All councils
        </Link>
      </PageShell>
    )
  if (!member || (!member.public && member.accountUid !== uid))
    return <PageHold />
  return (
    <PageShell title={member.item.name}>
      <div className="space-y-4">
        <p>{member.item.description}</p>
        <p className="break-all text-xs">
          <code>{formatItemRef({ id, kind: member.kind, version })}</code> · @
          {member.item.author.handle}
        </p>
        {member.public && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={busy}
              onClick={() => void save()}
            >
              Save to My items
            </button>
            <Link
              className={textLink}
              to={member.kind === 'agent' ? '/?agent=' + id : '/skills/' + id}
            >
              View current listing
            </Link>
          </div>
        )}
        {message && <p role="status">{message}</p>}
        {member.kind === 'agent' ? (
          <pre className="whitespace-pre-wrap break-words rounded-3xl bg-surface p-5 text-sm">
            {[
              member.item.prompt_blueprint.system_prompt,
              ...member.item.prompt_blueprint.instructions,
              ...member.item.prompt_blueprint.verification_rules,
            ].join('\n\n')}
          </pre>
        ) : (
          member.item.files
            .filter(({ kind }) => kind !== 'script')
            .map(({ path, content }) => (
              <details
                key={path}
                open={path === 'SKILL.md'}
                className="rounded-3xl bg-surface p-5"
              >
                <summary className="cursor-pointer font-medium">{path}</summary>
                <pre className="mt-3 whitespace-pre-wrap break-words text-sm">
                  {content}
                </pre>
              </details>
            ))
        )}
      </div>
    </PageShell>
  )
}
