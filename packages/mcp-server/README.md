# agentforge-registry

Node 22+ local stdio MCP server. No inference service, API key, or Firestore reads.

```sh
npx -y agentforge-registry --agent postgres-index-tuner@1.0.0
```

The command becomes available after the maintainer publishes this package to npm.
Before publication, build from the repository and use `node packages/mcp-server/dist/cli.js`.

`--catalog <path-or-https-URL>` overrides `AGENTFORGE_CATALOG_URL`. Otherwise the server
loads `public/catalog.json` from the working directory, then its bundled snapshot if
the local file is absent. An explicit source, malformed catalog, or unavailable pinned
version fails closed. It never silently substitutes another version.

`search_registry({ query?, category? })` searches metadata in memory.
`switch_agent({ agent_id })` accepts an id or pinned id@version and returns its full
blueprint. It refreshes the `active_agent` MCP prompt, the active manifest resource,
and the schema-driven `agent_<id>` tool, notifying clients that their lists changed.
The agent tool validates task inputs and returns an execution brief to the calling
model. The client runs the workflow on its own subscription.

Initial server instructions include the selected blueprint. MCP clients control how
instructions/prompts enter model context; a server cannot forcibly replace a client's
system prompt. Required external tools are **declarations**, exposed in the prompt,
resource, and switch result, not executable adapters. Connect those tools separately.
On switching, use the returned blueprint; MCP has no standard notification to replace
initialize-time server instructions. Only protocol messages go to stdout in server mode.

Build from a repository checkout after `npm run build:catalog`:

```sh
npm --prefix packages/mcp-server ci
npm --prefix packages/mcp-server run build
npm pack ./packages/mcp-server
```

The tarball contains the executable, validated catalog snapshot, and runtime dependency
declarations. It has no dependency on the web app or source files after packaging.
