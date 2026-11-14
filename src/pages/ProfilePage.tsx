import { PageShell } from '@/components/PageShell'
import { useRoute } from '@/router/Router'

/** Public: needs no account. */
export default function ProfilePage() {
  const { route } = useRoute()
  return (
    <PageShell title={`@${route.params.handle}`}>
      <p>
        This author&apos;s profile and public agents will appear here. Profiles
        are not built yet.
      </p>
    </PageShell>
  )
}
