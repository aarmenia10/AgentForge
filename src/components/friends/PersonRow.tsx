import type { ReactNode } from 'react'
import { Link } from '@/router/Router'

export interface PersonInfo {
  uid: string
  handle: string | null
  display_name: string | null
}

/** One person in a Friends list: name, a link to their profile, and actions. */
export function PersonRow({
  person,
  children,
}: {
  person: PersonInfo
  children?: ReactNode
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0">
        {person.handle ? (
          <>
            <p className="truncate font-medium text-fg">
              {person.display_name || `@${person.handle}`}
            </p>
            <Link
              to={`/u/${person.handle}`}
              className="font-mono text-xs text-accent-fg underline-offset-2 hover:underline"
            >
              @{person.handle}
            </Link>
          </>
        ) : (
          <p className="text-fg-muted">An account without a username</p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </li>
  )
}
