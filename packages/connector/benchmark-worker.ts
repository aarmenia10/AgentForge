// Only bundled by benchmark.mjs. The production Wrangler entry is src/worker.ts.
import { createConnector } from './src/connector'
import { tokenCodec } from './src/tokens'
import {
  ACCOUNT_RESOURCE,
  CONNECTOR_ORIGIN,
  READ,
  WRITE,
} from '../../src/services/connectorConfig'
import { SEED_AGENTS } from '../../src/data/seedAgents'
import {
  START,
  TEST_ENV,
  TEST_RING,
  idToken,
} from '../../tests/connectorFixture'

const user = 'benchmark-user'
const timestampValue = new Date(START).toISOString()
const handle = createConnector({
  now: () => START,
  fetchCatalog: async () => Response.json(SEED_AGENTS),
  async fetch(url, init) {
    if (url.endsWith('/connector_grants/benchmark-user'))
      return Response.json({
        fields: {
          epoch: { integerValue: '0' },
          grants: {
            mapValue: {
              fields: {
                benchmark: {
                  mapValue: {
                    fields: {
                      gen: { integerValue: '1' },
                      created: { timestampValue },
                      refreshed: { timestampValue },
                    },
                  },
                },
              },
            },
          },
        },
      })
    if (url.endsWith('/users/benchmark-user'))
      return Response.json({
        fields: {
          handle: { stringValue: 'benchmark' },
          display_name: { stringValue: 'Benchmark' },
        },
      })
    if (url.endsWith(':commit') && init?.method === 'POST')
      return Response.json({})
    throw new Error('Unexpected upstream in benchmark')
  },
})

export default {
  async fetch(request: Request) {
    const url = new URL(request.url)
    if (url.pathname === '/benchmark-token') {
      const now = () => START / 1000
      const expires = now() + 3300
      return new Response(
        await tokenCodec(TEST_RING, now).seal(
          'at',
          {
            uid: user,
            grant: 'benchmark',
            epoch: 0,
            scopes: [READ, WRITE],
            aud: ACCOUNT_RESOURCE,
            idToken: idToken(user, START),
            idExpires: now() + 3600,
          },
          expires,
        ),
      )
    }
    return handle(
      new Request(`${CONNECTOR_ORIGIN}${url.pathname}`, request),
      TEST_ENV,
    )
  },
}
