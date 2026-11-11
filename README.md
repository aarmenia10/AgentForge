# AgentForge

**The GitHub for AI Agents.** An open-source, framework-agnostic registry where people publish, discover, and install AI agents.

AgentForge does not run your agents. It stores a manifest for each one (prompt blueprint, required tools, input and output schemas) and hands that manifest to the AI client you already pay for. Inference happens inside Claude, Cursor, or ChatGPT on your flat-rate subscription. The registry itself costs nothing to operate.

> **Status: Pass 1.** The web catalog UI, the design system, and the canonical type contract are in place. The data layer, auth, and the MCP server are specified as interfaces and not yet implemented. See [Delegation plan](#multi-agent-delegation-plan).

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
 @agentforge/mcp-server  ◀───────────────────┘
 (runs locally via npx)
        │ exposes the manifest as MCP prompts and tools
        ▼
 The user's own model subscription does the inference
```

Three decisions keep the bill at zero.

1. **No server-side inference.** The registry serves JSON. The user's client runs the model.
2. **No backend compute.** There are no Cloud Functions (they require the paid Blaze plan). Everything is static hosting, Firestore security rules, and client code.
3. **The local MCP server does the integration work.** `@agentforge/mcp-server` runs on the user's machine through `npx`, fetches one pinned manifest, and exposes it over stdio.

### Staying at $0: the read-quota constraint

The Spark plan allows 50,000 Firestore document reads per day, and a collection query bills one read per document returned. If the catalog page queried Firestore directly, a 500-agent registry would exhaust the daily quota after 100 page loads.

The read path is therefore designed around a static snapshot:

| Operation | Source | Firestore reads |
| --- | --- | --- |
| Browse, search, filter, sort | `catalog.json` on Hosting, filtered client-side | 0 |
| MCP server fetches a manifest | Static `/agents/<id>.json` or a single doc read | 0 or 1 |
| Publish, star | Firestore write behind security rules | n/a (20k writes/day) |

The snapshot is rebuilt and redeployed by a GitHub Actions job (free for public repos). `AgentRepository.listAgents()` is the seam where this lives, and the UI already filters in memory through `queryAgents()`.

Other Spark limits worth knowing: Hosting transfers 360 MB per day, and Firestore stores 1 GiB. View counters must be batched or sampled, never one write per page view.

### MCP install contract

The web app generates this entry, and `@agentforge/mcp-server` must honor it:

```json
{
  "mcpServers": {
    "agentforge-<agent-id>": {
      "command": "npx",
      "args": ["-y", "@agentforge/mcp-server", "--agent", "<agent-id>@<version>"]
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
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve the production bundle
```

Deploying requires the Firebase CLI and a project of your own:

```bash
npx firebase-tools login
npx firebase-tools use --add
npm run build && npx firebase-tools deploy
```

## Directory structure

```
AgentForge/
├── index.html                  # Entry document, pre-paint theme script
├── firebase.json               # Hosting (SPA rewrite, asset caching) + Firestore config
├── firestore.rules             # Baseline rules: public read, no writes
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
    │   ├── agentRepository.ts  # Data-access interface + seed implementation
    │   ├── auth.ts             # GitHub OAuth interface (unimplemented)
    │   ├── catalog.ts          # Pure filter and sort over the catalog
    │   ├── mcpConfig.ts        # Install snippet generators per MCP client
    │   └── format.ts           # Compact counts, relative dates
    ├── data/
    │   └── seedAgents.ts       # Six placeholder agents, one per category
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
| **Codex (implementation)** | Everything below | Open |

### Handoff queue for Codex

Each item has a fixed signature already in the repo. Fill in bodies, do not reshape interfaces.

1. **Firestore repository.** Implement `createFirestoreAgentRepository()` in `src/lib/agentRepository.ts` against the `AgentRepository` interface, then switch the `agentRepository` export. Add the `firebase` SDK and a `src/lib/firebase.ts` initializer reading `VITE_FIREBASE_*` env vars.
2. **Static catalog snapshot.** A script that exports the `agents` collection to `public/catalog.json` and per-agent files, plus a GitHub Actions workflow that runs it and deploys Hosting. Point `listAgents()` at the snapshot.
3. **GitHub OAuth.** Implement `AuthService` in `src/lib/auth.ts` with Firebase Auth's `GithubAuthProvider`, and wire the disabled button in `TopNav.tsx`.
4. **Security rules.** Extend `firestore.rules`: authors write only their own manifests, one star document per user per agent, manifest shape validation.
5. **Seed data.** Grow `src/data/seedAgents.ts` into a realistic catalog (30+ agents across all six categories and five frameworks).
6. **Manifest validation.** A runtime validator for `AgentManifest` (shared by the publish flow and the MCP server).
7. **`@agentforge/mcp-server`.** A stdio MCP server in `packages/mcp-server/` that accepts `--agent <id>@<version>`, fetches the manifest, and exposes the prompt blueprint as an MCP prompt and the schemas as a tool definition.
8. **Tests.** Vitest unit tests for `queryAgents`, `buildMcpConfig`, `buildInstallSnippet`, `formatRelativeTime`, and the validator. Component tests for the modal's tab and focus behavior.
9. **Tooling.** ESLint and Prettier configs, CI for typecheck, lint, and test.

### Later passes (Claude)

Publish flow UI, author profile pages, dedicated `/agents/:id` routes with social-preview metadata, and a manifest diff view between versions.

## License

MIT
