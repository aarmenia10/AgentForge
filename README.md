# AgentForge

**The GitHub for AI Agents.** An open-source, framework-agnostic registry where people publish, discover, and install AI agents.

AgentForge does not run your agents. It stores a manifest for each one (prompt blueprint, required tools, input and output schemas) and hands that manifest to the AI client you already pay for. Inference happens inside Claude, Cursor, Codex, or ChatGPT on your own subscription. The registry itself costs nothing to operate.

The tagline is a comparison. AgentForge has no affiliation with GitHub and no GitHub integration.

---

## 0. Read this first (every AI session)

This README is the project's single source of truth. It replaces the earlier "Phased Rollout Master Plan" document. Where the two disagree, this file wins.

1. **Find your task.** Work is listed in [section 6](#6-roadmap) with an ID such as `P1-3`. Do the task you were given and nothing else.
2. **Obey the invariants** in [section 3](#3-invariants) and the decisions in [section 4](#4-decision-log). They are not suggestions.
3. **Do not reshape the schema contract** (`src/types/agent.ts`) unless your task is a schema task. Everything else depends on it.
4. **Branch per task.** Work on `task/<id>` (for example `task/p1-3`), and merge to `main` only when `npm run build` and `npm test` both pass.
5. **Update this file when you finish.** Change your task's status in section 6, and add a line to the decision log if you made a choice that binds later work.
6. **Stop and ask the owner** when a task needs a credential, a console setting, a paid plan, or a product decision that this file does not answer. Do not invent one.

---

## 1. What exists today

Verified for P2-1: `npm run lint`, `npm run format:check`, `npm run build`, `npm test`, and `npm run test:package` pass. The unit/integration suite passes 35 tests; package checks cover the exact 0.2.0 release plus both immutable older tarballs falling back from version 2 to their bundled version 1 catalogs.

| Area | State |
| --- | --- |
| Web catalog | Built. Search, category pills, framework filter, sort, four-tab detail view, `?agent=<id>` deep links, light and dark themes |
| Static catalog | Built. `scripts/export-catalog.ts` validates version 2 records, exports only public and approved agents, strips Firestore metadata, and writes `public/catalog.json`. The site reads only that file |
| Seed agents | 14 validated schema version 2 public manifests with the AgentForge author identity. At least two in every category, including `creative`, and all five frameworks represented |
| Validation | Built. Strict version 2 manifest and Firestore record validation in `src/lib/validateManifest.ts` (zod plus JSON Schema compilation) |
| MCP server | Released. `agentforge-registry` 0.2.1 is served from the site at `/mcp/agentforge-registry-0.2.1.tgz` (0.1.0, 0.1.1, and 0.2.0 stay available) and installs with `npx`. Ships the AI navigation guide, ranked search, and `compare_agents` |
| Firestore rules | Profiles, unique handles, mutual friends, visibility, owner submissions, admin review/verification, and atomic per-user stars. Private/friends reads use current ownership/friendship |
| Firebase project | `agentforge-b10db`, linked through `.firebaserc`. Web config is in `.env.production` |
| Live site | https://agentforge-b10db.web.app, deployed automatically from `main` by CI |
| Deployed Firestore rules | Match `firestore.rules` in this repo. CI deploys them with the site |
| Firebase Authentication | Email and password is enabled: a sign-in attempt from the site on 2026-11-14 got `INVALID_LOGIN_CREDENTIALS` back, not `OPERATION_NOT_ALLOWED`. Google is unconfirmed |
| Sign-in | Built (P2-2). A quiet "Sign in" in the nav opens a dialog with Google and email and password. Signed in, it becomes an account menu with a verify-your-email reminder. Signed-out visitors load no Firebase code |
| Publishing | Typed submission and visibility services implemented; Studio and review/catalog pipeline remain P2-4/P2-7 |
| Stars | Rules and transaction code exist. Unusable until sign-in exists and `agents/{id}` documents are provisioned |
| CI and deploys | `.github/workflows/ci.yml` builds and tests every push and deploys Hosting and rules from `main`. First automated deploy succeeded 2026-11-12 |
| Lint and format | ESLint recommended rules run in CI. Prettier checks new and conforming files, with an explicit legacy formatting baseline |

### Project facts


| Fact | Value |
| --- | --- |
| Firebase project ID | `agentforge-b10db` (project number `1090755022709`) |
| Live URL | https://agentforge-b10db.web.app |
| Catalog URL | https://agentforge-b10db.web.app/catalog.json |
| Auth domain | `agentforge-b10db.firebaseapp.com` |
| Plan | Spark (no cost) |
| Firestore | Database `(default)`, location `nam5`, currently empty |
| MCP server install | `npx -y https://agentforge-b10db.web.app/mcp/agentforge-registry-0.2.1.tgz`. Not on the npm registry, by decision |
| Remote connector | https://agentforge-connector.lesslimit.workers.dev/mcp (Cloudflare Workers, free plan, account subdomain `lesslimit`) |
| Repository | `aarmenia10/AgentForge`, default branch `main` |

---

## 2. Architecture

```
                      ┌─────────────────────────────────────────────┐
                      │  Firebase (Spark plan, $0)                  │
 Browser ───────────▶ │  Hosting: React SPA + catalog.json snapshot │
                      │  Firestore: accounts, private and friends   │
                      │             agents, review queue, stars     │
                      │  Auth: Google, email + password             │
                      └──────────────────────┬──────────────────────┘
                                             │ HTTPS: catalog.json
 Claude Desktop / Claude Code / Cursor / Codex
        │ stdio (MCP)                        │
        ▼                                    │
 agentforge-registry     ◀───────────────────┘
 (runs locally via npx)
        │ search, compare, load a blueprint, hand it to the client
        ▼
 The user's own model subscription does the inference
```

There are two ways in for an AI app, and both read the same `catalog.json`:

| Path | For | How the user connects | State |
| --- | --- | --- | --- |
| Local server (`agentforge-registry`, via `npx`) | Desktop and command-line clients with Node installed | A config snippet or one command from the install tab | Live |
| Remote connector (Cloudflare Workers) | Any client that accepts a remote MCP URL, including phone and web apps | Paste one URL into the app's connector settings | Built, task P2-10. Deployed by `.github/workflows/connector.yml` |

### Read path

| Operation | Source | Firestore reads |
| --- | --- | --- |
| Browse, search, filter, sort public agents | `catalog.json` on Hosting, filtered in memory | 0 |
| MCP server loads a public agent | `catalog.json` from Hosting, bundled snapshot as fallback | 0 |
| "My agents" and "Shared with me" | Firestore, bounded queries, signed-in users only | A few per visit |
| Remote connector answers a search | `catalog.json` from Hosting, cached briefly in the Worker | 0 |
| Publish, star, friend | Firestore writes behind security rules | n/a |

The Spark plan allows 50,000 document reads and 20,000 writes per day, 1 GiB of Firestore storage, and 360 MB per day of Hosting transfer. A collection query bills one read per document returned, which is why public browsing never touches Firestore.

### MCP install contract

The web app generates this entry and the server must honor it. The generator is `src/lib/mcpConfig.ts`.

```json
{
  "mcpServers": {
    "agentforge-<agent-id>": {
      "command": "npx",
      "args": ["-y", "https://agentforge-b10db.web.app/mcp/agentforge-registry-0.2.1.tgz", "--agent", "<agent-id>@<version>"]
    }
  }
}
```

The version is pinned so an installed agent cannot change underneath its user.

---

## 3. Invariants

These hold through Phase 3. Breaking one requires the owner's explicit sign-off, recorded in the decision log.

1. **No server-side inference.** AgentForge never calls a model and never proxies a model call.
2. **No paid infrastructure.** Firebase stays on Spark, which means no Cloud Functions. One free-tier hosted service is permitted: the remote connector on Cloudflare Workers ([section 7.6](#76-remote-connector)). It must stay stateless, hold no user data, and run on a plan that pauses at its limit instead of billing.
3. **Public browsing costs zero Firestore reads.** It is served from `catalog.json`.
4. **No client can make an agent public by itself.** A manifest reaches `catalog.json` only through the review path in `P2-7`.
5. **Installed agents are version-pinned.** A manifest never mutates under a user.
6. **No secrets in the repo or in the web bundle.** Firebase web config is public by design and may be committed. Service account keys may not.
7. **One schema.** `src/types/agent.ts` is canonical for the site, Firestore, and the MCP server.

---

## 4. Decision log

Binding. Newest first. Add to it, do not rewrite history.

| Date | Decision |
| --- | --- |
| 2026-11-14 | **Owner confirmed: owners may reset review_status only to pending.** Every owner manifest or visibility edit invalidates approval. Only admins may approve/reject or change author.verified. Creation always starts pending with author.verified false, including for admin clients; email verification is required for submission and owner edits |
| 2026-11-14 | **Owner decided: a private agent may be saved even when the safety linter reports block findings.** Only its author can load it. The block still prevents sharing with friends and submitting for public review |
| 2026-11-14 | **Owner decided: only admins approve safety-linter exceptions** (entries in `safety-linter-allow.json`). Today that is the owner and one named partner |
| 2026-11-14 | **Owner decided: editing an approved public agent never changes what users already have.** Every edit must carry a new version number. The approved version stays in `catalog.json` until the edited version is approved, then the new one replaces it. This keeps invariant 5 (version-pinned installs) true once publishing exists |
| 2026-11-14 | Admins are users with a document at `admins/{uid}`, created by hand in the Firebase console. The owner is an admin. A second admin is to be added once that person has signed in. Admins can see pending public submissions, approve or reject them, and grant "Verified author". They cannot read other people's private or friends agents, and cannot edit or delete anyone's agent |
| 2026-11-14 | P2-10: the connector lives in `packages/connector/`. Its Worker entry file `src/worker.ts` may export only the default handler, because the Workers runtime rejects any other export. Logic shared with the local server lives in `packages/mcp-server/src/shared.ts` and `src/lib/manifestSchema.ts`, which must stay free of Node APIs and Ajv (Ajv generates code at runtime, which Workers forbid). The connector validates the catalog's shape with zod only. A test fails if the two servers' search or compare results differ |
| 2026-11-14 | The local server's committed tarball must match its source byte for byte, so any change under `packages/mcp-server/src/` needs a version bump and `npm run release:mcp`. The shared-code extraction for P2-10 is released as 0.2.1 with no behavior change |
| 2026-11-14 | P2-5: friendship authorization checks the current accepted users/{owner_uid}/relationships/{viewer_uid} record. Atomic unfriend deletes both records and revokes server access immediately, without agent writes. shared_with remains in AgentRecord for schema compatibility but grants no access; new records use an empty list. This supersedes the list-based authorization originally suggested in 7.3. Agent reads in the service require the server, preventing an offline fallback to formerly shared cached data |
| 2026-11-14 | P2-5 query contract: My agents filters owner_uid; Shared with me first pages accepted relationships, then pages one friend's agents with owner_uid and visibility=friends. Review pages filter visibility=public and review_status. Every list is capped at 50, ordered by document id, with a cursor. Public browsing still uses catalog.json. Admins may read pending/rejected public submissions, but have no private/friends read bypass |
| 2026-11-14 | P2-3 data: profiles and handle lookup require sign-in; profile and relationship queries are capped at 50 and paginate by handle or uid. Handle claims and renames are atomic with the profile (a rename releases the old claim); agentforge, admin, and support are reserved. Mutual requests live in matching users/{uid}/relationships/{otherUid} records with sender_uid, status (pending or accepted), and created_at. Rules require both copies to be created, accepted, or removed together; only the recipient accepts. removeFriendship also cancels or declines pending requests. The sender must have a verified email |
| 2026-11-14 | P2-2 UI: features that need an account call `useAuth().openSignIn({ reason })` when the user tries the action. Nothing gates browsing, the detail view, or the install tab. `src/main.tsx` must not reach a Firebase module through static imports, and `tests/auth-ui.test.ts` fails if it does. `VITE_AUTH_STUB=1` builds the site with an in-memory AuthService for local UI checks; production builds never include it |
| 2026-11-14 | P2-6 spec: `docs/SAFETY_LINTER.md` defines rules SL-01 to SL-15. A `block` finding keeps a record out of `catalog.json` and fails the build for a seed. The only way to clear a false positive is an owner-approved entry in `safety-linter-allow.json`, pinned to agent, version, rule, field, and text hash. A clean lint result is never shown as a safety signal |
| 2026-11-14 | P2-2 service: `authService` keeps the AuthService method contract. AuthUser adds `emailVerified`; `refreshAuthUser()` reloads verification and forces a fresh ID token after the email link. Auth and Firestore are separate lazy imports. Observing a new signed-out visitor does not load either SDK; a local session marker enables Firebase session restoration for returning users |
| 2026-11-13 | P2-1: schema version 2 is current; MCP 0.2.0 ships it. Catalog inclusion depends on public visibility and approval, independently of author verification. Maintainer seeds are approved in source; live privacy/review changes suppress matching seeds. Immutable 0.1.0 and 0.1.1 releases keep their bundled version 1 fallback, covered by package tests |
| 2026-11-12 | `docs/AI_GUIDE.md` is the canonical AI guide. `packages/mcp-server/src/guide.ts` holds a generated copy (`node packages/mcp-server/sync-guide.mjs`) and a hand-written condensed version, and a test fails when they drift. `public/llms.txt` must teach the same rules. Any change to the selection rules lands in all three (P1-5) |
| 2026-11-13 | **Owner confirmed: public agents need the owner's approval before they appear.** Private and friends agents publish instantly |
| 2026-11-13 | **Owner confirmed: friends are mutual.** One person sends a request and the other accepts |
| 2026-11-13 | **"Verified author" is the only wording for the badge.** It means the registry confirmed who the author is. It is not a safety check, a quality rating, or a review of the agent. Never shorten it to "Verified" in UI text, docs, or guide text. The manifest field stays `author.verified`; MCP tool results report it as `author.verified_author` so an AI cannot misread it. This supersedes the `{ name, verified }` shape in the tool contract entry below |
| 2026-11-13 | The AI guide says **when to look**: check the registry at the start of any specialized task, and always when the user says "use AgentForge". It also requires checking that an already-loaded agent fits the task, because a loaded agent survives a cleared conversation. The dependable way for a user to trigger a search is to say "Use AgentForge to find an agent for ...", and the install tab tells them so |
| 2026-11-13 | **Invariant 2 amended with the owner's sign-off.** "No server we operate" becomes "no paid infrastructure". A free Cloudflare Workers service may host the remote connector so that AgentForge can be added by URL in an AI app's connector settings, including on phones. Firebase remains the home of the site, catalog, accounts, and data. Nothing moves to Cloudflare except the connector |
| 2026-11-13 | MCP server 0.1.1 released with the guide changes above and `verified_author`. 0.1.0 stays hosted |
| 2026-11-12 | MCP tool contract: `search_registry` returns `{ candidates: [...], next_step }` with ranked candidates, never a bare array and never a single answer. `compare_agents` takes 2 to 5 ids. Neither tool loads an agent. Both emit `author` as `{ name, verified }` only, so schema version 2 does not change their output (P1-5) |
| 2026-11-12 | **The owner rejected the flat redesign and it was reverted.** The visual style is the original one: glass surfaces, the gradient headline, the gradient logo tile, soft page glow, and cards that lift and glow on hover. The only standing change is that small labels are never pills ([section 7.1](#71-visual-style)). This supersedes the earlier token rule from P1-3 |
| 2026-11-12 | This README is the plan of record. The Gemini-authored master plan is retired. Corrections to it are listed in [section 9](#9-corrections-to-the-retired-master-plan) |
| 2026-11-12 | Sign-in is **Google** and **email + password**. Nothing else |
| 2026-11-12 | Agents have a visibility: **public**, **friends**, or **private** |
| 2026-11-12 | The MCP server must ship with a navigation guide that teaches a connected AI to compare candidates before choosing an agent ([section 7.4](#74-ai-navigation-guide)) |
| 2026-11-11 | **GitHub is not part of the product.** No GitHub sign-in, no GitHub identity, no GitHub API. The tagline is a comparison only |
| 2026-11-12 | Command-line install snippets come in two forms. PowerShell strips the bare `--` that `claude mcp add` and `codex mcp add` require, so the install panel also shows a Windows form that wraps the same line in `cmd /c "..."`. Any new command-line client added to `src/lib/mcpConfig.ts` gets both forms (P1-7, bug 1) |
| 2026-11-12 | **The MCP server is distributed from our own site, not the npm registry.** Install snippets run `npx -y https://agentforge-b10db.web.app/mcp/agentforge-registry-<version>.tgz`. No npm account is involved and no third party can claim the name. Every released tarball stays in `public/mcp/` permanently, because installed configs point at it. Release with `npm run release:mcp`, then commit the tarball and bump `MCP_SERVER_VERSION` in `src/lib/mcpConfig.ts` |
| 2026-11-11 | The MCP package is the unscoped `agentforge-registry`. The `@agentforge` npm scope and the `agentforge-mcp` name belong to unrelated projects and must never appear in an install snippet |
| 2026-11-11 | Firestore runs in production mode with the rules in this repo. Never test mode |
| 2026-11-11 | The schema has no rating field. "Popular" sorts by views, "Top Rated" by stars, "Newest" by `updated_at` |

---

## 5. Schema contract

`src/types/agent.ts`. Field names are snake_case because the manifest is serialized as-is.

### Version 2 (current)

| Field | Type | Notes |
| --- | --- | --- |
| `schema_version` | `2` | Required literal discriminator |
| `visibility` | `'public' \| 'friends' \| 'private'` | Only public, approved records enter the catalog |
| `id` | `string` | Unique slug, also the Firestore document id |
| `name`, `version`, `description` | `string` | `version` is semver |
| `author` | `{ uid: string, name: string, handle: string, verified: boolean }` | AgentForge identity. Handle is 3 to 30 lowercase letters, digits, or hyphens, starting and ending with a letter or digit. Uniqueness enforcement belongs to P2-3 |
| `tags` | `string[]` | Lowercase. Category pills map 1:1 onto tags |
| `framework` | `'crewai' \| 'langchain' \| 'autogen' \| 'mcp_native' \| 'custom'` | |
| `tools_required` | `{ name, type, endpoint?, description }[]` | `type` is `mcp_tool`, `python_function`, or `rest_api` |
| `input_schema`, `output_schema` | `Record<string, any>` | JSON Schema |
| `prompt_blueprint` | `{ system_prompt, instructions[], verification_rules[] }` | |
| `stats` | `{ stars, views, updated_at }` | `updated_at` is ISO 8601 |

`author.verified` means **Verified author**: the registry confirmed identity. It is not a safety check, quality rating, or review of the agent. MCP search and comparison results keep reporting `author` as `{ name, verified_author }`.

### Firestore documents

`AgentRecord` extends `AgentManifest` with `owner_uid: string`, `review_status: 'pending' | 'approved' | 'rejected'`, and `shared_with: string[]` (at most 100 uids). These three fields never appear in `catalog.json`. The exporter validates documents even when they will be excluded, and suppresses an existing seed when its live record becomes non-public or loses approval. Source-controlled seeds are maintainer-approved public manifests.

### Version 1 compatibility

Version 1 is retired. The immutable 0.1.0 and 0.1.1 server tarballs reject the version 2 live catalog and fall back to their bundled version 1 snapshots. `npm run test:package` runs both committed releases against the new catalog and checks initialization, the bundled manifest, and search.

---

## 6. Roadmap

Status values: `done`, `open`, `blocked` (says on what). Owners are defaults and the project owner can reassign.

### Phase 0: Foundation. Done.

Scaffold (React 19, Vite, TypeScript, Tailwind v4, Lucide), schema contract, design system, catalog UI, detail view, install snippet generator, static exporter, validator, MCP package, star rules, tests.

### Phase 1: Live, good-looking, and connectable

Goal: a stranger can open the site, like what they see, and connect it to Claude or Codex in under two minutes. No accounts yet.

| ID | Task | Owner | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- |
| P1-1 | Link the Firebase project: commit `.firebaserc`, fill the Project facts table, commit the public web config as `.env.production` | Claude | none | `.firebaserc` and `.env.production` are on `main` and the build passes | done |
| P1-2 | CI and deploys. `.github/workflows/ci.yml` already builds and tests every push and deploys Hosting and rules from `main` using the `FIREBASE_SERVICE_ACCOUNT` secret. Remaining: add ESLint and Prettier and a lint step | Codex | none | A push to `main` reaches the live site with no manual step | done |
| P1-3 | Visual style per [7.1](#71-visual-style): original look kept, pill labels replaced | Claude | none | No pill-shaped labels remain. Both themes and 375px verified | done |
| P1-4 | MCP go-live: live catalog with bundled fallback, Codex in the install panel, standalone packaging, and release as a tarball on the site | Codex, Claude | none | The snippet from the site connects on a machine that has never seen the repo | done. Verified live for Claude Code in P1-7. Codex connection not yet tested on a real machine |
| P1-5 | AI navigation guide per [7.4](#74-ai-navigation-guide), including the server wiring in `packages/mcp-server/src/server.ts` | Claude | none | A connected AI given a vague task lists and compares candidates before choosing, and says so when nothing fits |done (not yet observed with a live model; that check belongs to P1-7) |
| P1-6 | Seed coverage: at least two agents per category including `creative`, and at least one agent for each framework | Codex | none | Every category pill and every framework filter returns results | done |
| P1-7 | Live verification: walk the deployed site and a real MCP connection, file what breaks | Antigravity | P1-2, P1-4 | A written pass or fail for each Phase 1 "done when" | done. Report in `docs/verification/P1-7.md`: 25 pass, 1 not tested, 1 bug (fixed). Open follow-ups below the table |

**Phase 1 is complete.** Two follow-ups from P1-7 remain open and do not block Phase 2:

- **Guide behavior, unprompted.** Owner-tested on Claude Code on Windows, 2026-11-12. With "Use AgentForge to find..." Claude searched five ways, compared, and reported its choice: pass. With the plain task it also used the registry, but a previously loaded agent's tool was still visible, so a fully cold unprompted run is still unobserved. Version 0.1.1 adds the when-to-look rule. Not yet tested on Codex.
- **Codex connection.** Check 21 was not tested because Codex was not installed on the test machine.

### Phase 2: Accounts, publishing, and sharing

Goal: people sign in, publish their own agents, and choose who sees them.

| ID | Task | Owner | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- |
| P2-1 | Schema version 2 per [section 5](#5-schema-contract): update the contract, then migrate seeds, validator, exporter, MCP server, and tests | Claude (contract), Codex (migration) | Phase 1 | No `github` field or author icon remains. Footer source link and icon stay. All five required checks pass | done |
| P2-2 | Sign-in per [7.2](#72-accounts): implement `AuthService` in `src/lib/auth.ts`, build the sign-in dialog and account menu | Codex (service), Claude (UI) | P1-1, owner enables both providers in the console | Sign up, sign in, sign out, and password reset work on the live site with both methods | service and UI done. Email and password is live on the Firebase project; Google provider, authorized domain, and a full live walkthrough with both methods remain (owner and Antigravity) |
| P2-3 | Profiles and friends: `users/{uid}`, unique handles, friend requests | Codex (data and rules), Claude (UI) | P2-2 | Two test accounts can become friends and unfriend. Rules tests cover every denial | data and rules done; UI/live account walkthrough remains |
| P2-4 | Manifest Studio: a guided form that builds a valid manifest with live validation and a visibility choice | Claude | P2-1, P2-2 | A signed-in user publishes an agent without writing JSON | open |
| P2-5 | Visibility storage and rules per [7.3](#73-visibility) | Codex | P2-1, P2-3 | Rules tests prove a private agent is unreadable by anyone else and a friends agent is readable only by friends | done; rules, typed services, bounded queries and revocation covered by emulator tests |
| P2-6 | Safety linter per [7.5](#75-safety-linter) | Claude (rule spec), Codex (implementation) | P2-1 | The linter runs in the Studio and again in the exporter. A flagged manifest cannot reach the catalog | spec done (`docs/SAFETY_LINTER.md`); implementation open |
| P2-7 | Review queue and catalog pipeline: an admin screen to approve or reject public submissions, and a CI job that rebuilds `catalog.json` from approved agents | Codex (pipeline), Claude (UI) | P1-2, P2-5, P2-6 | An approved agent appears on the live site within one pipeline run. An unapproved one never does | open |
| P2-8 | Stars: provision `agents/{id}` on approval and add the star button | Codex | P2-2, P2-7 | Starring persists, is one per user, and shows in the catalog after the next rebuild | open |
| P2-9 | "My agents" and "Shared with me" views | Claude | P2-5 | A user sees their own private, friends, and pending agents, and agents friends shared with them | open |
| P2-10 | Remote connector per [7.6](#76-remote-connector): a hosted MCP endpoint on Cloudflare Workers, deployed by CI, plus a copyable connector link on the home page and the install tab | Claude | P2-1, owner's Cloudflare account and two repository secrets | The connector URL, added in Claude's connector settings, lets Claude on desktop, web, and phone search and load public agents with nothing installed | built and verified in the local Workers runtime. Live check runs in CI after each deploy. Owner test in a real AI app pending |

### Phase 3: Runtime and reach

Not scheduled in detail. Do not start without the owner.

| ID | Task | Note |
| --- | --- | --- |
| P3-1 | Private and friends agents over MCP | The local server needs to sign in as the user. Needs a design for token handling first |
| P3-2 | Companion tool resolution | Detect which required MCP tools the client lacks and return the install snippet for each |
| P3-3 | CLI publishing | A `publish` command in `agentforge-registry`. Depends on P3-1's sign-in |
| P3-4 | SDKs for TypeScript and Python | Unscoped package names only. `@agentforge/*` is not ours |
| P3-5 | Version history | Keep past versions so an old pin still resolves |
| P3-6 | Usage analytics | Analytics is currently off. Turning it on is an owner decision |

### Phase 4: Hosted execution and revenue

Unscheduled. Hosted agent execution, paid agents with a platform fee, and private enterprise registries. Every item here breaks invariant 1 or 2 and needs a paid plan, so none of it starts without a written decision from the owner.

---

## 7. Feature specifications

### 7.1 Visual style

The owner likes the original look and it stays. An earlier version of this section called for a flat redesign. That was the orchestrator's overreach, the owner rejected the result, and it was reverted on 2026-11-12.

**Keep, and match in new work:**

- Frosted glass surfaces (`glass` and `glass-strong` in `src/index.css`) over the soft teal and navy page glow.
- The headline with gradient text on the emphasized words.
- The gradient logo tile beside the "AgentForge" wordmark.
- Hover feedback: cards and category pills lift slightly and light up.
- Rounded cards and inputs, and the rounded category pills in the hero.
- The slate, navy, and teal palette, in light and dark themes.

**The one rule that changed: small labels are not pills.** No tinted, ringed, fully rounded capsule behind a short label. Use these instead:

| Label | Treatment |
| --- | --- |
| Framework, tool type | Colored monospace capitals with wide letter spacing, no background (`FrameworkBadge` in `src/components/ui.tsx`) |
| Star count | A star icon and a number, no background |
| Line above the headline | Plain uppercase text, no capsule |
| Active filter chip | Small rounded rectangle, not a capsule |

Tags keep their small rounded-rectangle chips. Numbered step markers stay circular.

Constraints: keyboard access, visible focus states, AA contrast, and no horizontal scroll at 375px. Ask the owner before changing the overall look again.

### 7.2 Accounts

- **Methods:** Google, and email with password. Both are free on Spark. The interface is `AuthService` in `src/lib/auth.ts`.
- **Email accounts** must verify their address before they can publish or send friend requests.
- **Signed-out users** keep full access to browsing, the detail view, and the install snippet. Sign-in is requested only at the moment someone tries to publish, star, or add a friend. The nav carries a quiet "Sign in" link, never a prominent gate.
- **Profile:** `users/{uid}` holds `handle`, `display_name`, `avatar_url`, `created_at`. Handles are unique, enforced through a `handles/{handle}` document.
- **Owner console step:** enable both providers under Authentication, and add the live domain to the authorized domains list.

### 7.3 Visibility

| Visibility | Who can see it | Where it lives | Review |
| --- | --- | --- | --- |
| `public` | Everyone | Firestore until approved, then `catalog.json` | Required |
| `friends` | The author and accepted friends | Firestore only | None |
| `private` | The author | Firestore only | None |

Rules of the design:

- Private and friends agents **never** enter `catalog.json`. The exporter must drop anything that is not both `public` and `approved`, and a test must prove it.
- Friends visibility is enforced by security rules using the current accepted relationship with the owner. `shared_with` is retained as schema metadata (at most 100 entries), but ignored for authorization; no agent cleanup is required on unfriend.
- Every account-view query is constrained by `owner_uid`, and shared-agent queries additionally require `visibility == 'friends'`. Page size is 1 to 50. Shared with me pages accepted relationships first, then requests one owner's page at a time.
- Changing an agent from private or friends to public sends it to review. Changing public to private removes it from the next catalog build.
- Every owner content or visibility edit sets `review_status` to `pending`, while preserving `author.verified` and aggregate counters. Only an admin can approve/reject or change author verification. Client deletion remains denied; visibility changes remove an agent from public circulation on the next catalog build.
- Until `P3-1`, private and friends agents are usable from the website only (copy the blueprint). The local MCP server sees public agents.

The UI imports the lazy functions in `src/services/agents.ts`:

| Operation | Functions |
| --- | --- |
| Submit, edit, change visibility | `createAgent(manifest)`, `updateAgent(manifest)`, `setAgentVisibility(id, visibility)` |
| Account views | `getAgentRecord(id)`, `listMyAgents(pageSize?, afterId?)`, `listSharedAgents(ownerUid, pageSize?, afterId?)` |
| Admin views/actions | `isCurrentUserAdmin()`, `listReviewQueue(status?, pageSize?, afterId?)`, `reviewAgent(id, status)`, `setAuthorVerified(id, verified)` |

Lists return `{ items, cursor }`. Pass the cursor to the next call; an empty page has a null cursor. For Shared with me, use `listRelationships('accepted', pageSize, afterUid)` from `src/services/profiles.ts` to page the owners. All agent reads require the server and fail closed offline. Creation derives author identity from the caller's profile and initializes counters, approval, and verification; updates preserve counters and admin verification.

**Owner setup:** use the Firebase console (Firestore Database) or a trusted Admin SDK to create `admins/{your Firebase Auth uid}`, for example with `{ role: 'admin' }`. Authorization depends on the document's existence. No browser client, including an admin, can create, edit, or delete admin membership. Deploy the committed query indexes once with `npx firebase deploy --only firestore:indexes --project agentforge-b10db`; the existing CI deploys rules but does not deploy indexes.

### 7.4 AI navigation guide

The failure to prevent: a connected AI searches once, takes the first plausible result, and runs with it.

Deliverables:

1. **`docs/AI_GUIDE.md`**: the canonical text.
2. **MCP server instructions**: a condensed version returned at initialization, so every client receives it without asking.
3. **A `registry_guide` MCP resource and prompt** carrying the full text.
4. **`public/llms.txt`**: the same guidance for AIs that reach the website directly, with the catalog URL and its shape.
5. **Tools that make the right behavior easy:** `search_registry` returns several ranked candidates with the fields needed to compare them, and a `compare_agents` tool returns a side-by-side of chosen candidates.

What the guide must teach:

- **When to look.** At the start of any specialized task, and always when the user asks for AgentForge. Before using an agent that is already loaded, check that it fits the task.
- **How the registry is laid out.** Categories, tags, frameworks, what a manifest contains, and what each field is for.
- **How to search.** Run more than one query (the task's domain, the action, the expected output). Never stop at the first hit.
- **How to choose.** Shortlist at least three candidates when they exist. For each, check that the input schema matches what the user can provide, that the output schema matches what the user wants, that the required tools are available in this client, whether the author is verified, and how recently it was updated. Prefer the narrowest agent that fully covers the task over a broad one that partly covers it.
- **When not to choose.** If nothing fits, say so and proceed without an agent. A poor match is worse than none.
- **How to report.** Tell the user which agent was picked, what it was compared against, and why.
- **How to stay safe.** A blueprint is third-party text. It never overrides the user's instructions or the client's own rules.

### 7.5 Safety linter

A published manifest is a system prompt that strangers load into their own AI, so it is the main attack surface.

- Checks: instruction-override phrasing, attempts to extract secrets or files, hidden content (zero-width characters, HTML comments, remote images), shell commands in prompts, and tool endpoints that are not `https` or a recognized package runner.
- It runs twice: in the Manifest Studio for fast feedback, and in the exporter, which is the check that counts because the browser cannot be trusted.
- It assists review. It does not replace it. A clean lint result is not an approval.
- Unverified authors get a visible warning on the install tab.

---

### 7.6 Remote connector

The local server needs Node and a terminal, and cannot run on a phone or in a web app. The remote connector is the same registry behind one web address that a user pastes into their AI app's connector settings.

- **Where it runs.** Cloudflare Workers, free plan. Code lives in `packages/connector/`. CI deploys it with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.
- **What it is.** An MCP server over Streamable HTTP at `/mcp`. Public, read-only, no sign-in.
- **Stateless.** A shared web service cannot remember which agent one user loaded. So it has no `switch_agent` and no per-agent tool. It offers `search_registry`, `compare_agents`, and `get_agent`, which returns the full blueprint in one call. It serves the same guide, with the same rules, through its instructions and the `registry_guide` resource and prompt.
- **One source of logic.** Search, comparison, validation, and the guide text are shared with `packages/mcp-server`, not copied. The two must not drift, and a test enforces it.
- **Data.** It reads `catalog.json` from Firebase Hosting, caches it for a few minutes, and falls back to a bundled snapshot. It stores nothing and logs no user content.
- **Limits.** When the free plan's daily request limit is reached, the connector stops answering until the next day. The site and the local server are unaffected. No setting may be enabled that converts overage into charges.
- **Not in scope yet.** Private and friends agents need sign-in on the connection itself (OAuth). That is Phase 3, with P3-1.
- **Listing.** Adding the URL as a custom connector works as soon as the service is live. Appearing in an AI vendor's built-in connector directory requires that vendor's review and is a later, separate step.

## 8. Who does what

| Agent | Use it for | Do not use it for |
| --- | --- | --- |
| **Claude** (lead architect) | Schema and interface contracts, UI and design, written specifications and guides, security rule specs, review of other agents' work | Bulk data entry |
| **Codex** | Implementing against fixed interfaces: services, security rules, exporter and pipeline work, CI, tests, seed data, npm packaging | Product or schema decisions |
| **Antigravity** | Anything that needs a real signed-in browser: console checks, live-site walkthroughs, end-to-end verification | Changing source code outside its task |
| **Owner** | Credentials, console settings, approvals, and every decision marked "owner" | |

One orchestrator at a time. Claude holds that role now. Session prompts are written against the task IDs in section 6.

---

## 9. Corrections to the retired master plan

So that nobody acts on the old document:

| The old plan said | The truth |
| --- | --- |
| Claim the `@agentforge` npm scope or `agentforge-mcp` | Both belong to other projects. The package is `agentforge-registry` |
| GitHub OAuth for identity and verification badges | GitHub is not part of the product. Sign-in is Google and email + password |
| Enable Firestore in test mode | Production mode only. Test mode leaves the database world-writable |
| Live at `agentforge.web.app` | The real URL depends on the assigned project ID. See Project facts |
| Search uses Fuse.js | Search is a plain in-memory filter in `src/lib/catalog.ts`. That is fine at this catalog size |
| The MCP server is published to npm | It is released as a tarball on the project's own site instead |
| Phase 1 is complete | It was not when that plan was written. See section 6 for the current state |

---

## 10. Working on the code

Requires Node 22 or newer.

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # export catalog, typecheck, production bundle in dist/
npm test               # builds the MCP package first, then runs all tests
npm run lint           # installs isolated lint tooling, then checks JS/TS
npm run format:check   # checks Prettier formatting outside the legacy baseline
npm run test:firestore # security rules against the local emulator (needs Java 21+)
npm run build:mcp      # build packages/mcp-server on its own
npm run test:package   # pack, install outside the repo, verify bundled/offline MCP
```

ESLint uses recommended JavaScript and TypeScript rules. Its TypeScript 6 parser
runtime is isolated in `tools/lint` because the current parser does not support
the application's TypeScript 7 compiler; both dependency sets have lockfiles.
Prettier follows the existing no-semicolon, single-quote style. `.prettierignore`
lists existing formatting exceptions individually to avoid a mass reformat.
Remove an entry when formatting that file; new files are checked automatically.

Run the MCP server from a checkout:

```bash
node packages/mcp-server/dist/cli.js --agent postgres-index-tuner@1.0.0
```

The MCP server defaults to the live catalog URL in Project facts and falls back
to its bundled snapshot when that request fails or returns invalid data.
`--catalog` overrides `AGENTFORGE_CATALOG_URL`; either explicit source fails
closed on errors. An unavailable version pin always fails closed.

For Codex, the install panel generates `codex mcp add <server-name> -- npx -y
<tarball URL> --agent <id>@<version>`, following the
[official MCP configuration documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
The package's shared validator is bundled into `dist/cli.js` and manifest types
are checked at build time; the release has no local web-app dependency.
`build:mcp` uses a locked `npm ci` so it cannot re-add that dependency.

Catalog export: without Google credentials the exporter uses the seed file. Set `AGENTFORGE_CATALOG_SOURCE=firestore` plus Application Default Credentials to merge live records. Details are in `.env.example` and `scripts/export-catalog.ts`.

Deploys happen automatically on every push to `main`. To deploy by hand:

```bash
npm run build && npx firebase-tools deploy --only hosting,firestore:rules
```

---

## 11. Directory structure

```
AgentForge/
├── index.html                    # Entry document, pre-paint theme script
├── firebase.json                 # Hosting (SPA rewrite, caching) + Firestore config
├── firestore.rules               # Security rules
├── .env.example                  # Every environment variable, documented
├── docs/
│   ├── AI_GUIDE.md               # Canonical guide for connected AIs (section 7.4)
│   └── SAFETY_LINTER.md          # Safety linter rule specification (P2-6)
├── scripts/
│   └── export-catalog.ts         # Builds public/catalog.json
├── public/
│   ├── catalog.json              # Generated. The site's only read source
├── packages/
│   └── mcp-server/               # The agentforge-registry MCP server
│       └── src/                  # cli.ts, server.ts, catalog.ts, discovery.ts, guide.ts
├── tests/                        # catalog, MCP, and Firestore emulator tests
└── src/
    ├── App.tsx                   # Page composition, catalog state, deep links
    ├── index.css                 # Tailwind import, palette, surface utilities
    ├── types/agent.ts            # CANONICAL CONTRACT
    ├── theme/ThemeProvider.tsx   # Light and dark
    ├── data/seedAgents.ts        # Seed manifests
    ├── services/firestore.ts     # Star transactions
    ├── auth/                     # AuthProvider, useAuth, error messages, dev stub
    ├── lib/
    │   ├── agentRepository.ts    # Data-access interface, static snapshot reads
    │   ├── auth.ts               # AuthService, lazy Firebase sign-in
    │   ├── catalog.ts            # Pure filter and sort
    │   ├── firebase.ts           # Lazy Firebase initialization
    │   ├── mcpConfig.ts          # Install snippet generators
    │   ├── validateManifest.ts   # Runtime manifest validation
    │   └── format.ts             # Counts and relative dates
    └── components/
        ├── ui.tsx                # Badges, author tag, copy button, code block
        ├── TopNav.tsx, Hero.tsx, ExplorerToolbar.tsx
        ├── auth/                 # SignInDialog, AccountMenu
        ├── AgentCard.tsx, AgentGrid.tsx
        └── detail/               # AgentDetailModal, SchemaViewer, InstallPanel
```

---

## 12. Open questions for the owner

1. The name. At least three unrelated projects already ship as "AgentForge" on npm, one of them an MCP server. Renaming is cheap now and expensive after launch.
2. Who reviews public submissions once there are more than the owner can handle.

## License

MIT
