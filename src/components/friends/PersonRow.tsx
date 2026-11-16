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
            <p className="truncate font-medium text-slate-900 dark:text-white">
              {person.display_name || `@${person.handle}`}
            </p>
            <Link
              to={`/u/${person.handle}`}
              className="font-mono text-xs text-teal-700 underline-offset-2 hover:underline dark:text-teal-300"
            >
              @{person.handle}
            </Link>
          </>
        ) : (
          <p className="text-slate-600 dark:text-slate-400">
            An account without a username
          </p>
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
