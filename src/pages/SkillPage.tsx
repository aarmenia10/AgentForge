import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHold, PageShell } from '@/components/PageShell'
import { SkillBadge } from '@/components/skills/parts'
import { SkillDetail } from '@/components/skills/SkillDetail'
import { textLink } from '@/components/studio/parts'
import { skillRepository, type SkillIndexResult } from '@/lib/skillRepository'
import { closeDetail, Link, useRoute } from '@/router/Router'

/** One public skill, from skills.json and its version file. No database reads. */
export default function SkillPage() {
  const { route, go } = useRoute()
  const id = route.params.id
  const [index, setIndex] = useState<SkillIndexResult | null>(null)

  useEffect(() => {
    let active = true
    skillRepository.listSkills().then((r) => active && setIndex(r))
    return () => {
      active = false
    }
  }, [])

  if (!index) return <PageHold />
  const skill = index.skills.find((s) => s.id === id)
  const back = (
    <Link to="/skills" className={`${textLink} inline-flex items-center gap-1`}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      All skills
    </Link>
  )

  if (!skill)
    return (
      <PageShell title="Skill not found">
        <p>
          {index.state === 'error'
            ? 'The skills list failed to load. Check your connection and reload the page.'
            : `No public skill is called ${id}. It may be private, waiting for review, or taken down.`}
        </p>
        <p className="mt-4">{back}</p>
      </PageShell>
    )

  return (
    <PageShell title={skill.name} onClose={() => closeDetail(go, '/skills')}>
      <div className="-mt-1 mb-5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <SkillBadge />
        <code className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">
          {skill.id}@{skill.version}
        </code>
      </div>
      <SkillDetail
        key={`${skill.id}@${skill.version}`}
        skill={skill}
        loadFiles={() =>
          skillRepository
            .getSkillVersion(skill.id, skill.version)
            .then((v) => v.files)
        }
      />
      <p className="mt-8">{back}</p>
    </PageShell>
  )
}
