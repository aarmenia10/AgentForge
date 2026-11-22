/**
 * Hourly export trigger (README section 7.6). A Workers cron trigger asks
 * GitHub to run the CI workflow with `scheduled=true`, because GitHub's own
 * hourly schedule fires only about every eight hours. The token is an
 * operator secret set in Cloudflare. Without it this does nothing.
 *
 * Stateless by design: no binding, no stored result, and nothing logged
 * except a status code. Never log the token or a response body.
 */
type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface ExportTriggerEnv {
  GITHUB_DISPATCH_TOKEN?: string
  GITHUB_REPO?: string
  [key: string]: unknown
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

export async function triggerExport(
  env: ExportTriggerEnv,
  fetcher: Fetch = fetch,
): Promise<void> {
  const token = env.GITHUB_DISPATCH_TOKEN
  if (typeof token !== 'string' || token === '') return

  const repo = env.GITHUB_REPO
  if (typeof repo !== 'string' || !REPO_PATTERN.test(repo)) {
    console.error('Export trigger skipped: GITHUB_REPO is not set correctly')
    return
  }

  try {
    const response = await fetcher(
      `https://api.github.com/repos/${repo}/actions/workflows/ci.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'agentlemon-connector',
          'Content-Type': 'application/json',
        },
        // Workers reject 'error'; a test forbids it.
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ ref: 'main', inputs: { scheduled: 'true' } }),
      },
    )
    await response.body?.cancel()
    if (response.status !== 204) {
      console.error(`Export trigger failed: GitHub returned ${response.status}`)
    }
  } catch {
    console.error('Export trigger failed: the request did not complete')
  }
}
