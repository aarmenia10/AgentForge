import type { ReactNode } from 'react'

/** A titled block on the Settings page. */
export function SettingsSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="mb-3 text-lg font-semibold text-slate-900 dark:text-white"
      >
        {title}
      </h2>
      {children}
    </section>
  )
}
