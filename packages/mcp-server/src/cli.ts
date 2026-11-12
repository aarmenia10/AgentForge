import { parseArgs } from 'node:util'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { DEFAULT_CATALOG_URL, loadCatalog } from './catalog'
import { createRegistryServer } from './server'

try {
  const { values } = parseArgs({
    options: {
      agent: { type: 'string' },
      catalog: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  })
  if (values.help) {
    console.log(
      `Usage: agentforge-registry [--agent <id>@<version>] [--catalog <file-or-URL>]\nCatalog: --catalog, AGENTFORGE_CATALOG_URL, then ${DEFAULT_CATALOG_URL} with bundled snapshot fallback. Explicit sources fail closed.`,
    )
  } else {
    const catalog = await loadCatalog(
      values.catalog ?? process.env.AGENTFORGE_CATALOG_URL,
    )
    const server = createRegistryServer(catalog, values.agent)
    const shutdown = () => {
      void server.close().finally(() => process.exit(0))
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
    await server.connect(new StdioServerTransport())
  }
} catch (error) {
  console.error(
    `agentforge-registry: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
}
