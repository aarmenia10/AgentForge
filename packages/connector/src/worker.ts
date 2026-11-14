/**
 * Cloudflare Worker entry point. Keep this file to the default export only:
 * the Workers runtime rejects an entry module that exports anything that is
 * not a handler.
 */
import { createConnector } from './connector'

const handle = createConnector()

export default {
  fetch: (request: Request) => handle(request),
}
