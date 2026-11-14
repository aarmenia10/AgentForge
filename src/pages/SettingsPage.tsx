import RequireAccount from '@/components/RequireAccount'
import { PageShell } from '@/components/PageShell'

export default function SettingsPage() {
  return (
    <RequireAccount
      title="Settings"
      purpose="Sign in to change your display name, handle, and account details."
      reason="Sign in to open your settings."
    >
      <PageShell title="Settings">
        <p>
          Your display name, handle, and email settings will live here. This
          page is not built yet.
        </p>
      </PageShell>
    </RequireAccount>
  )
}
