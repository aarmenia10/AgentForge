import { formatItemRef } from '@/lib/skillSchema'
import { Link } from '@/router/Router'
import type { CouncilMember } from '@/types/council'
import type { ItemRef } from '@/types/skill'
import { textLink } from '@/components/studio/parts'

export type MemberStatus = { name: string; handle?: string; state?: string }
export const memberLink = ({ kind, id, version }: ItemRef) =>
  '/councils/member/' +
  kind +
  '/' +
  encodeURIComponent(id) +
  '/' +
  encodeURIComponent(version)

export function CouncilRoster({
  members,
  details = [],
}: {
  members: readonly CouncilMember[]
  details?: readonly (MemberStatus | null)[]
}) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {members
        .map((member, i) => ({ ...member, detail: details[i] }))
        .sort((a, b) => a.order - b.order)
        .map(({ ref, order, role, detail }) => (
          <li
            key={formatItemRef(ref)}
            className="glass min-w-0 space-y-1 rounded-2xl p-4"
          >
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Stage {order} · {ref.kind}
            </div>
            <Link className={textLink} to={memberLink(ref)}>
              {detail?.name ?? ref.id}
            </Link>
            <p>{role}</p>
            <code className="block break-all text-xs">
              {formatItemRef(ref)}
            </code>
            {detail?.handle && <p className="text-xs">@{detail.handle}</p>}
            {detail?.state && <p className="text-xs">{detail.state}</p>}
            {detail === null && (
              <p className="text-xs">Unavailable to this account</p>
            )}
          </li>
        ))}
    </ol>
  )
}
