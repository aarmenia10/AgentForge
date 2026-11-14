import { PageShell } from '@/components/PageShell'
import { Link } from '@/router/Router'

export default function NotFoundPage() {
  return (
    <PageShell title="Page not found">
      <p>
        Nothing lives at this address.{' '}
        <Link
          to="/"
          className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
        >
          Browse agents
        </Link>
      </p>
    </PageShell>
  )
}
