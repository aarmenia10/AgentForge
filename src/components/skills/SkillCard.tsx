import { Files } from 'lucide-react'
import { AuthorLink } from '@/components/ui'
import { formatRelativeTime } from '@/lib/format'
import { formatBytes, skillBytes } from '@/lib/skillRepository'
import { Link } from '@/router/Router'
import type { SkillIndexEntry } from '@/types/skill'
import { SkillBadge } from './parts'

/** The home catalog's card, for a skill. The whole card opens its page. */
export function SkillCard({ skill }: { skill: SkillIndexEntry }) {
  const count = skill.files.length
  return (
    <article className="glass group relative flex h-full flex-col rounded-2xl p-5 transition duration-200 hover:-translate-y-1 hover:shadow-glow">
      <div className="flex items-start justify-between gap-3">
        <SkillBadge />
        <span className="font-mono text-xs text-slate-400">
          v{skill.version}
        </span>
      </div>

      <h3 className="mt-4 break-words text-lg font-semibold tracking-tight">
        {/* The stretched link makes the whole card one click target. */}
        <Link
          to={`/skills/${encodeURIComponent(skill.id)}`}
          className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-teal-500"
        >
          {skill.name}
        </Link>
      </h3>

      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {skill.description}
      </p>

      <ul className="mb-4 mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
        {skill.tags.slice(0, 3).map((tag) => (
          <li
            key={tag}
            className="rounded-md bg-slate-900/5 px-2 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300"
          >
            #{tag}
          </li>
        ))}
      </ul>

      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-slate-900/5 pt-4 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
        <AuthorLink author={skill.author} />
        <span
          className="inline-flex shrink-0 items-center gap-1"
          title="Files and size"
        >
          <Files className="size-3.5" aria-hidden="true" />
          {count} {count === 1 ? 'file' : 'files'} ·{' '}
          {formatBytes(skillBytes(skill.files))}
        </span>
      </footer>
      <p className="mt-2 text-[11px] text-slate-400">
        Updated {formatRelativeTime(skill.stats.updated_at)}
      </p>
    </article>
  )
}
