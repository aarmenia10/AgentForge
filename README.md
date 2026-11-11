# AgentForge

**The GitHub for AI Agents.** An open-source, framework-agnostic registry where people publish, discover, and install AI agents.

AgentForge does not run your agents. It stores a manifest for each one (prompt blueprint, required tools, input and output schemas) and hands that manifest to the AI client you already pay for. Inference happens inside Claude, Cursor, or ChatGPT on your flat-rate subscription. The registry itself costs nothing to operate.

> **Status: Catalog + local MCP implemented.** Ten curated manifests, strict runtime validation, a static snapshot exporter, offline catalog reads, an MCP CLI, and atomic authenticated star transactions are implemented. GitHub sign-in and the author publish/delete UI remain future work. The npm package has not yet been published.

## Vision

Agents today are trapped in the framework that built them. A CrewAI crew, a LangChain graph, and a hand-written MCP prompt cannot be browsed, compared, or installed the same way. AgentForge gives all of them one manifest format and one install path.

- **One schema for every framework.** CrewAI, LangChain, AutoGen, MCP-native, and custom agents share the `AgentManifest` contract.
- **Inspect before you install.** Every listing shows its system prompt, step-by-step instructions, verification rules, tool dependencies, and JSON Schema contracts.
- **One-snippet install.** The detail view generates the exact `claude_desktop_config.json` entry, the Cursor `mcp.json` entry, or the `claude mcp add` command.
- **No keys, no bill.** AgentForge never proxies a model call, so there is no API key to hand over and no usage to meter.

## Architecture: $0-cost and MCP-first

```
                      ┌────────────────────────────────────────────┐
                      │  Firebase (Spark plan, $0)                 │
 Browser ───────────▶ │  Hosting: React SPA + catalog.json snapshot│
 agentforge.web.app   │  Firestore: agents collection (writes,     │
                      │             stars, per-agent reads)        │
                      │  Auth: GitHub OAuth                        │
                      └──────────────────────┬─────────────────────┘
                                             │ HTTPS, manifest fetch
 Claude Desktop / Cursor / Claude Code       │
        │ stdio (MCP)                        │
        ▼                                    │
 agentforge-registry     ◀───────────────────┘
 (runs locally via npx)
        │ exposes the manifest as MCP prompts and tools
        ▼
 The user's own model subscription does the inference
```

Three decisions keep the bill at zero.

1. **No server-side inference.** The registry serves JSON. The user's client runs the model.
2. **No backend compute.** There are no Cloud Functions (they require the paid Blaze plan). Everything is static hosting, Firestore security rules, and client code.
3. **The local MCP server does the integration work.** `agentforge-registry` runs on the user's machine through `npx`, fetches one pinned manifest, and exposes it over stdio.

### Staying at $0: the read-quota constraint

The Spark plan allows 50,000 Firestore document reads per day, and a collection query bills one read per document returned. If the catalog page queried Firestore directly, a 500-agent registry would exhaust the daily quota after 100 page loads.

The read path is therefore designed around a static snapshot:

| Operation | Source | Firestore reads |
| --- | --- | --- |
| Browse, search, filter, sort | `catalog.json` on Hosting, filtered client-side | 0 |
| MCP server fetches a manifest | Static `catalog.json` or bundled snapshot | 0 |
| Publish, star | Firestore write behind security rules | n/a (20k writes/day) |

The snapshot is rebuilt by `npm run build:catalog` and included in every web build. `AgentRepository.listAgents()` fetches `/catalog.json` and falls back to the last valid in-memory snapshot (the seeds on first load). Search and filtering stay in memory. Automated Hosting deployment is not configured yet.

Other Spark limits worth knowing: Hosting transfers 360 MB per day, and Firestore stores 1 GiB. View counters must be batched or sampled, never one write per page view.

### MCP install contract

The web app generates this entry, and `agentforge-registry` must honor it:

```json
{
  "mcpServers": {
    "agentforge-<agent-id>": {
      "command": "npx",
      "args": ["-y", "agentforge-registry", "--agent", "<agent-id>@<version>"]
    }
  }
}
```

The version is pinned so an installed agent never changes underneath its user. The generator lives in `src/lib/mcpConfig.ts`.

## Tech stack

React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, Firebase Hosting, Cloud Firestore.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # export catalog + typecheck + production bundle in dist/
npm run preview    # serve the production bundle
```

Deploying requires the Firebase CLI and a project of your own:

```bash
npx firebase-tools login
npx firebase-tools use --add
npm run build && npx firebase-tools deploy
```

### Catalog export and Firestore stars

`npm run build:catalog` validates every manifest and embedded JSON Schema before
atomically replacing `public/catalog.json`. Only maintainer-verified records ship;
live records override seeds by id, and a revoked verification suppresses its seed.
Duplicate ids or invalid records fail the build. Output ordering is deterministic.

Without Application Default Credentials (ADC), the exporter uses verified seeds.
Set `GOOGLE_APPLICATION_CREDENTIALS` and `GOOGLE_CLOUD_PROJECT` to merge the `agents`
collection, or use ADC from your environment. Explicit credentials, Firestore read
errors, and invalid live data fail rather than silently shipping a stale snapshot.
`AGENTFORGE_CATALOG_SOURCE=seed` forces a reproducible offline export;
`AGENTFORGE_CATALOG_SOURCE=firestore` requires credentials. The Admin SDK is only
used by the build script, never the browser. Store credential files outside the repo.

Star writes require Firebase config from `.env.example`, a signed-in Firebase user,
and an existing `agents/{id}` document provisioned by a trusted Admin import. The
exporter is read-only and does not provision documents. `toggleStarAgent(id, uid)`
checks the current identity and atomically creates/deletes `agents/{id}/stars/{uid}`
with an `increment(1)`/`increment(-1)` aggregate update. Security rules enforce both
sides of that operation and deny collection browsing, forged counts, and manifest
edits. Deploy the rules with the app. Seed-only browsing works without Firebase;
stars require the sign-in integration, which remains outside this implementation.
`publishAgent` and `deleteAgent` still explicitly reject until author ownership and
the publishing flow are implemented; view tracking performs no writes.

### Local MCP package and validation

The package name remains **`agentforge-registry`**, preserving the rename after
`23b34ee`; the unrelated `@agentforge` scope is not used.

```sh
npm --prefix packages/mcp-server ci
npm run build:mcp
node packages/mcp-server/dist/cli.js --agent postgres-index-tuner@1.0.0
npm test
npm run test:firestore  # Java 21+; downloads and runs the local emulator
```

On Windows, if Java fails to establish its internal Unix-domain loopback socket,
run the emulator with `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=<nonexistent-directory>`
to select Java's TCP fallback. This is only a local Java workaround, not a deployed setting.

After an authorized npm release, the equivalent CLI is
`npx -y agentforge-registry --agent postgres-index-tuner@1.0.0`. Build and packing do
not publish it. Use `--catalog <file-or-URL>` or `AGENTFORGE_CATALOG_URL` for a live
Hosting snapshot; otherwise it loads local `public/catalog.json` or its bundled
snapshot. Exact versions fail if absent rather than silently upgrading. The current
catalog holds one version per id; historical pin support requires retained snapshots.

The server exposes `search_registry`, `switch_agent`, an active-agent prompt and
manifest resource, and a task-input tool using the active input schema. That tool
returns a validated execution brief; the calling model performs inference. Prompts
include all instructions, verification rules, output schemas, and external tool
declarations. External tools must be connected separately. MCP clients control
prompt adoption; servers cannot force a replacement of the client's system prompt.
Switching returns the new blueprint and sends list-change notifications.
See [package documentation](packages/mcp-server/README.md) for packaging details.

## Directory structure

```
AgentForge/
├── index.html                  # Entry document, pre-paint theme script
├── firebase.json               # Hosting (SPA rewrite, asset caching) + Firestore config
├── firestore.rules             # Atomic per-user stars; no collection browsing
├── vite.config.ts              # React + Tailwind plugins, "@/" alias
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx                # React root, ThemeProvider
    ├── App.tsx                 # Page composition, catalog state, ?agent= deep links
    ├── index.css               # Tailwind import, navy palette, glass utilities
    ├── types/
    │   └── agent.ts            # CANONICAL CONTRACT: AgentManifest and friends
    ├── theme/
    │   └── ThemeProvider.tsx   # Light/dark context, persisted to localStorage
    ├── lib/
    │   ├── agentRepository.ts  # Static snapshot reads + offline fallback
    │   ├── auth.ts             # GitHub OAuth interface (unimplemented)
    │   ├── catalog.ts          # Pure filter and sort over the catalog
    │   ├── mcpConfig.ts        # Install snippet generators per MCP client
    │   └── format.ts           # Compact counts, relative dates
    ├── data/
    │   └── seedAgents.ts       # Ten curated specialized workflows
    └── components/
        ├── ui.tsx              # Badges, author tag, copy button, code block
        ├── TopNav.tsx          # Logo, search, category links, theme toggle, sign-in
        ├── Hero.tsx            # Headline and category pills
        ├── ExplorerToolbar.tsx # Keyword, framework filter, sort
        ├── AgentCard.tsx       # Grid card
        ├── AgentGrid.tsx       # Grid plus loading, error, and empty states
        └── detail/
            ├── AgentDetailModal.tsx  # Dialog shell, Overview and Tools tabs
            ├── SchemaViewer.tsx      # Field table and raw JSON with copy
            └── InstallPanel.tsx      # "Add to Claude / Cursor" generator
```

## The schema contract

`src/types/agent.ts` is the single source of truth for the web app, Firestore documents, and the MCP server. Field names are snake_case because the manifest is serialized as-is.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Unique slug, also the Firestore document id |
| `name`, `version`, `description` | `string` | `version` is semver |
| `author` | `{ name, github, verified }` | `github` is the handle without `@` |
| `tags` | `string[]` | Lowercase. Category pills map 1:1 onto tags |
| `framework` | `'crewai' \| 'langchain' \| 'autogen' \| 'mcp_native' \| 'custom'` | |
| `tools_required` | `{ name, type, endpoint?, description }[]` | `type` is `mcp_tool`, `python_function`, or `rest_api` |
| `input_schema`, `output_schema` | `Record<string, any>` | JSON Schema |
| `prompt_blueprint` | `{ system_prompt, instructions[], verification_rules[] }` | |
| `stats` | `{ stars, views, updated_at }` | `updated_at` is ISO 8601 |

The schema has no rating field. The UI's sort options map onto `stats`: **Popular** sorts by views, **Top Rated** by stars, **Newest** by `updated_at`.

## Multi-agent delegation plan

Work is split by what each model does best. The type contract and the interfaces in `src/lib/` are the boundary: nobody changes them without a schema version bump.

| Owner | Scope | Status |
| --- | --- | --- |
| **Claude (architect + frontend lead)** | Architecture, `AgentManifest` contract, design system, catalog UI, detail view, install generator | Done in Pass 1 |
| **Codex (implementation)** | Snapshot, seeds, validator, local MCP, stars | Implemented; follow-ups below |

### Handoff queue for Codex

Each item has a fixed signature already in the repo. Fill in bodies, do not reshape interfaces.

1. **Repository:** static read path, lazy Firebase config, and atomic stars complete. Author publish/delete remain open.
2. **Static snapshot:** exporter and build integration complete. Hosting deployment automation and historical version retention remain open.
3. **Security rules:** per-user atomic stars complete and emulator-tested. Author ownership/publish policy remains open.
4. **Seed data:** ten specialized, curated workflows complete; expand categories in later passes.
5. **Validation:** shared strict runtime validation and JSON Schema compilation complete.
6. **MCP:** standalone package, pinned selection, discovery, switching, prompts, resources, and task-input tool complete. npm publication remains a release task.
7. **Tests:** catalog, validation, offline behavior, stdio MCP, and Firestore transaction/rule tests complete. UI component tests remain open.
8. **Tooling:** lint/format configuration and automated CI/deployment remain open.

### Later passes (Claude)

Publish flow UI, author profile pages, dedicated `/agents/:id` routes with social-preview metadata, and a manifest diff view between versions.

## License

MIT
