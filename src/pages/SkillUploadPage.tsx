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
      purpose="Sign in to create a skill and choose who can access it."
      reason="Sign in to upload a skill."
    >
      <PageShell title={editId ? 'Edit a skill' : 'Upload a skill'}>
        <p>
          {editId
            ? 'Change your skill, then save it.'
            : 'A skill teaches your AI how to complete a specific task. Tell us what your skill does and add the instructions your AI should follow.'}
        </p>
        {/* Keyed so switching between skills, or from new to edit, starts fresh. */}
        <SkillUpload key={editId ?? 'new'} editId={editId} />
      </PageShell>
    </RequireAccount>
  )
}
