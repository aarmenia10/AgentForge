import { parseArgs } from 'node:util'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  DEFAULT_CATALOG_URL,
  loadCatalog,
  loadOrigins,
  agentResolver,
  localSkillReader,
} from './catalog'
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
      `Usage: agentlemon-registry [--agent <id>@<version>] [--catalog <file-or-URL>]\nCatalog: --catalog, AGENTLEMON_CATALOG_URL, then ${DEFAULT_CATALOG_URL} with bundled snapshot fallback. Explicit sources fail closed.`,
    )
  } else {
    const source =
      values.catalog ??
      process.env.AGENTLEMON_CATALOG_URL ??
      process.env.AGENTFORGE_CATALOG_URL
    const catalog = await loadCatalog(source)
    const origins = await loadOrigins(source)
    const resolve = agentResolver(catalog, source)
    const active = values.agent ? await resolve(values.agent) : undefined
    const server = createRegistryServer(
      catalog,
      values.agent,
      resolve,
      active,
      localSkillReader(source),
      origins,
    )
    const shutdown = () => {
      void server.close().finally(() => process.exit(0))
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
    await server.connect(new StdioServerTransport())
  }
} catch (error) {
  console.error(
    `agentlemon-registry: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
}
