import RequireAccount from '@/components/RequireAccount'
import { PageShell } from '@/components/PageShell'
import { SkillUpload } from '@/components/skills/SkillUpload'
import { useRoute } from '@/router/Router'

export default function SkillUploadPage() {
  const { location } = useRoute()
  const editId = new URLSearchParams(location.search).get('edit')
  return (
    <RequireAccount
      title="Upload a skill"
      purpose="Sign in to upload a skill folder and choose who can see it."
      reason="Sign in to upload a skill."
    >
      <PageShell title={editId ? 'Edit a skill' : 'Upload a skill'}>
        <p>
          {editId
            ? 'Change your skill, then save it.'
            : 'Choose your skill folder or write SKILL.md here. No JSON needed.'}
        </p>
        {/* Keyed so switching between skills, or from new to edit, starts fresh. */}
        <SkillUpload key={editId ?? 'new'} editId={editId} />
      </PageShell>
    </RequireAccount>
  )
}
