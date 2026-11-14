# agentforge-registry

Version 0.2.1. Node 22+ local stdio MCP server. No inference service, API key, or Firestore reads.

```sh
npx -y https://agentforge-b10db.web.app/mcp/agentforge-registry-0.2.1.tgz --agent postgres-index-tuner@1.0.0
```

The server is distributed as a tarball on the AgentForge site, not through the npm
registry. To cut a release, bump the version here and in `src/lib/mcpConfig.ts`, run
`npm run release:mcp` from the repository root, and commit the new file in `public/mcp/`.
Never delete an old tarball: installed configs point at it.

`--catalog <path-or-https-URL>` overrides `AGENTFORGE_CATALOG_URL`. Otherwise the server
fetches `https://agentforge-b10db.web.app/catalog.json` with a 10-second timeout and
falls back to its bundled snapshot on network, HTTP, parsing, or validation failure.
The 0.2.x server validates schema version 2 manifests: author is `{ uid, name, handle, verified }`, with `visibility` and `schema_version: 2`. The catalog contains only public, approved agents and no Firestore storage metadata. Search and comparison results keep author as `{ name, verified_author }`. "Verified author" means identity confirmed, not safety reviewed.

The default never reads a catalog from the working directory. An explicit source
fails closed on any error, even when it names the default URL. An unavailable pinned
version always fails closed; it never silently substitutes another version.

For OpenAI Codex, install the pinned agent using the documented stdio command:

```sh
codex mcp add agentforge-postgres-index-tuner -- npx -y https://agentforge-b10db.web.app/mcp/agentforge-registry-0.2.1.tgz --agent postgres-index-tuner@1.0.0
```

See [OpenAI's MCP configuration documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

`search_registry({ query?, category?, framework?, limit? })` ranks the catalog in memory
and returns several candidates, each with the fields needed to judge fit: required
inputs, output fields, required tools, author verification, last update, and which
query terms matched. `compare_agents({ agent_ids })` returns a side-by-side of two to
five candidates. Neither loads anything.

The server teaches a connected AI to compare before choosing. A condensed guide is
sent as the initialization instructions, and the full text is served as the
`registry_guide` resource (`agentforge://guide`) and prompt. The canonical text is
`docs/AI_GUIDE.md`; after editing it run `node packages/mcp-server/sync-guide.mjs`.

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
The shared manifest validator is bundled into `dist/cli.js`; manifest types are
checked at build time and erased. Only declared npm packages remain as runtime imports.

From the repository root, `npm run test:package` packs the release, checks its file
list, installs it into an empty temporary consumer outside the repository, and
verifies stdio MCP with both an explicit bundled catalog and offline default fallback.
It also installs the committed 0.1.0 and 0.1.1 tarballs unchanged, returns the version 2
catalog to their default fetch, and proves both start, fall back to their bundled
version 1 manifests, and answer a search.
