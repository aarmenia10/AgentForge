/**
 * Cloudflare Worker entry point. Keep this file to the default export only:
 * the Workers runtime rejects an entry module that exports anything that is
 * not a handler.
 */
import { createConnector } from './connector'
import { triggerExport } from './exportTrigger'
import type { ExportTriggerEnv } from './exportTrigger'
import type { OAuthEnv } from './oauth'

const handle = createConnector()

export default {
  fetch: (request: Request, env: OAuthEnv) => handle(request, env),
  // Runs on the cron in wrangler.toml. Never let it throw into the runtime.
  scheduled: (
    _controller: ScheduledController,
    env: ExportTriggerEnv,
    ctx: ExecutionContext,
  ) => {
    ctx.waitUntil(triggerExport(env))
  },
}
