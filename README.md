# AgentLemon

**The GitHub for AI Agents.** An open-source, framework-agnostic registry where people publish, discover, and install AI agents.

AgentLemon (formerly AgentForge, renamed 2026-11-18) does not run your agents. It stores a manifest for each one (prompt blueprint, required tools, input and output schemas) and hands that manifest to the AI client you already pay for. Inference happens inside Claude, Cursor, Codex, or ChatGPT on your own subscription. The registry itself costs nothing to operate.

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
7. **Two people work here now, each with their own AIs.** Before you write any code, read the [shared board](#81-shared-board). If someone else has claimed the files you need, stop and say so. Claim your own work there first, in a small commit of its own, and remove the claim when you merge. A new idea or plan goes in the [ideas inbox](#82-ideas-inbox) before anyone builds it.

---

## 1. What exists today

Verified by the orchestrator on 2026-11-17 at the P2-17 merge: `npm run lint`, `npm run format:check`, `npm run build`, `npm test` (209), `npm run test:package` (5), and `npm run test:firestore` (24) all pass, and CI rebuilt the catalog from Firestore and deployed. Every Phase 2 screen is built. The live two-account walkthrough is recorded in `docs/verification/P2-16.md`.

| Area | State |
| --- | --- |
| Web catalog | Built. Search, category pills, framework filter, sort, four-tab detail view, `?agent=<id>` deep links, light and dark themes |
| Static catalog | Built. `scripts/export-catalog.ts` validates version 2 records, exports only public and approved agents, strips Firestore metadata, and writes `public/catalog.json`. The site reads only that file |
| Seed agents | 14 validated schema version 2 public manifests with the AgentForge author identity. At least two in every category, including `creative`, and all five frameworks represented |
| Validation | Built. Strict version 2 manifest and Firestore record validation in `src/lib/validateManifest.ts` (zod plus JSON Schema compilation) |
| MCP server | Released. `agentlemon-registry` 0.3.0 is served from the site at `/mcp/agentlemon-registry-0.3.0.tgz`. Every `agentforge-registry` release (0.1.0 to 0.2.2) stays available on both addresses and installs with `npx`. Ships the AI navigation guide, ranked search, and `compare_agents` |
| Firestore rules | Profiles, unique handles, mutual friends, visibility, owner submissions, admin review/verification, and atomic per-user stars. Private/friends reads use current ownership/friendship |
| Firebase project | `agentforge-b10db`, linked through `.firebaserc`. Web config is in `.env.production` |
| Live site | https://agentlemon.web.app, deployed automatically from `main` by CI. The old address https://agentforge-b10db.web.app gets the same deploy: it keeps serving files for existing installs and sends page visits to the new address |
| Deployed Firestore rules | Match `firestore.rules` in this repo. CI deploys them with the site |
| Firebase Authentication | Email and password is enabled: a sign-in attempt from the site on 2026-11-14 got `INVALID_LOGIN_CREDENTIALS` back, not `OPERATION_NOT_ALLOWED`. Google is unconfirmed |
| Sign-in | Built (P2-2). A quiet "Sign in" in the nav opens a dialog with Google and email and password. Signed in, it becomes an account menu with a verify-your-email reminder. Signed-out visitors load no Firebase code |
| Publishing | Built. Manifest Studio at `/studio`, My agents at `/me`, the review queue at `/review`. Public agents are reviewed by an admin, then enter the catalog on the next hourly pipeline run. Edits to an approved agent wait in review while the approved version stays live, and every approved version stays available at `/agents/<id>/<version>.json` |
| Profiles and friends | Built. Public profiles at `/u/<handle>` from the catalog, Settings, a one-time welcome step, and Friends at `/friends` |
| Stars | Built. Star button on the detail view; counts reach the catalog on the next pipeline run |
| Catalog pipeline | Live. Repository variable `CATALOG_SOURCE=firestore` is set; CI rebuilds from approved Firestore agents on every merge and hourly |
| CI and deploys | `.github/workflows/ci.yml` builds and tests every push and deploys Hosting and rules from `main`. First automated deploy succeeded 2026-11-12 |
| Lint and format | ESLint recommended rules run in CI. Prettier checks new and conforming files, with an explicit legacy formatting baseline |

### Project facts


| Fact | Value |
| --- | --- |
| Firebase project ID | `agentforge-b10db` (project number `1090755022709`) |
| Live URL | https://agentlemon.web.app (second Hosting site `agentlemon` in the same project). Old: https://agentforge-b10db.web.app |
| Catalog URL | https://agentlemon.web.app/catalog.json (the old address serves the same file) |
| Auth domain | `agentlemon.web.app` (changed 2026-11-18; `agentforge-b10db.firebaseapp.com` before) |
| Plan | Spark (no cost) |
| Firestore | Database `(default)`, location `nam5`, currently empty |
| MCP server install | `npx -y https://agentlemon.web.app/mcp/agentlemon-registry-0.3.0.tgz`. Not on the npm registry, by decision |
| Remote connector | https://agentlemon-connector.lesslimit.workers.dev/mcp (Cloudflare Workers, free plan, account subdomain `lesslimit`). The old Worker at `agentforge-connector.lesslimit.workers.dev` keeps running, undeployed, until nobody uses it |
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
| MCP server loads a public agent | `catalog.json` and `agents/<id>/<version>.json` from Hosting; bundled catalog fallback | 0 |
| "My agents" and "Shared with me" | Firestore, bounded queries, signed-in users only | A few per visit |
| Remote connector answers a search | `catalog.json` from Hosting, cached briefly in the Worker | 0 |
| Publish, star, friend | Firestore writes behind security rules | n/a |

The Spark plan allows 50,000 document reads and 20,000 writes per day, 1 GiB of Firestore storage, and 360 MB per day of Hosting transfer. A collection query bills one read per document returned, which is why public browsing never touches Firestore.

### MCP install contract

The web app generates this entry and the server must honor it. The generator is `src/lib/mcpConfig.ts`.

```json
{
  "mcpServers": {
    "agentlemon-<agent-id>": {
      "command": "npx",
      "args": ["-y", "https://agentlemon.web.app/mcp/agentlemon-registry-0.3.0.tgz", "--agent", "<agent-id>@<version>"]
    }
  }
}
```

The version is pinned so an installed agent cannot change underneath its user. MCP 0.2.2 resolves an older pin from `/agents/<id>/<version>.json`; the agent must still be in the current catalog. Every response is validated as a public manifest with the requested id and version, including HTTP 200 responses (missing Hosting files return SPA HTML). Version files use five-minute cache headers so takedowns propagate; released tarballs remain immutable and all five releases stay hosted. Offline catalog fallback still resolves pins present in the bundled snapshot.

The hourly Firestore export reads roughly **approved agents + snapshots** documents, plus two small reads per seed for provisioning. At 1,000 combined agent/snapshot documents this is about 24,000 reads/day before account traffic; add a cheaper change-detection step by then, before approaching Spark's 50,000 daily reads (about 2,000 combined documents at hourly cadence). That step is deferred. `public/export-state.json` hashes the catalog and all version files; scheduled CI compares it to the live export so history-only changes and takedowns deploy too.

---

## 3. Invariants

These hold through Phase 3. Breaking one requires the owner's explicit sign-off, recorded in the decision log.

1. **No server-side inference.** AgentForge never calls a model and never proxies a model call.
2. **No paid infrastructure.** Firebase stays on Spark, which means no Cloud Functions. One free-tier hosted service is permitted: the remote connector on Cloudflare Workers ([section 7.6](#76-remote-connector)). It must run on a plan that pauses at its limit instead of billing, and it stores nothing: no database, no key-value store, no logs of user content. It may sign a user in and act with that user's own Firebase permissions, so the security rules still decide what it can read and write; it never holds admin power. Any credential it needs between calls is encrypted and held by the user's AI app, not by us (amended 2026-11-18, P3-1).
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
| 2026-11-18 | P3-0 rename, as built: `firebase.json` deploys the same `dist/` to two Hosting sites, `agentlemon` and `agentforge-b10db`. A script at the top of `index.html` sends page visits on the old host names to the same path on `agentlemon.web.app`; static files (`catalog.json`, `/agents/**`, `/mcp/**`, `export-state.json`) are served on both, so every released server keeps working. The Firebase auth domain is `agentlemon.web.app` (its `/__/auth/handler` is registered on the OAuth client). Environment variables become `AGENTLEMON_*`; `agentlemon-registry` 0.3.0 still honors `AGENTFORGE_CATALOG_URL` as a fallback. Browser storage keys move to `agentlemon.*` (a new origin starts empty anyway). Unchanged on purpose: project id `agentforge-b10db`, seed `owner_uid` and author `@agentforge`, the repository link until the repository is renamed |
| 2026-11-18 | P3-7 (owner-agreed rules and CI changes): every write that changes a public approved agent, and every snapshot creation, also writes `export_sources/{source}/changes/{id}` in the same commit, and the rules require it. Hourly CI reads only those queues, applies the marked changes to an encrypted Actions-cache checkpoint of the last public export that must match Hosting's digest, then deletes each marker with an update-time precondition after a successful deploy or an equal compare. The first run each UTC day, any new commit, and any missing or invalid checkpoint run the full export. Phase 3 collections reuse the queue. Admin SDK or console edits that bypass rules must mark the document or trigger a full run |
| 2026-11-18 | P3-8 skills contract accepted as written in `docs/SKILLS.md` (choices listed in its section 13). Notably: public skill readers ignore unknown fields while writers reject them; skill list pages hold at most 20; three read tools (`search_skills`, `get_skill`, `get_skill_file`); no zip upload; linter rule SK-01 blocks every script, which yields the owner's script rule through the existing private-save decision |
| 2026-11-18 | P3-1 design accepted (`docs/CONNECTOR_AUTH.md`). Two addresses: `/mcp` stays public, `/account/mcp` adds account tools and asks for sign-in only when one is used. The connector carries the user's encrypted Firebase refresh token inside OAuth tokens held by the AI app; a per-user `connector_grants/{uid}` document handles revocation and replay. Orchestrator defaults for the owner's open choices, which he may override: refresh tokens lapse after 30 idle days or 90 days in all; the redirect allowlist starts with Claude's hosted callback and loopback, adding ChatGPT once its value is seen; items saved from a chat carry a visible "Saved from chat" label on `/me`. Biggest accepted risk: a leak of the Worker's encryption keys exposes every connected user's refresh token, and only a password change ends that at Firebase |
| 2026-11-18 | **Owner decided: Phase 3 plan approved** as written in section 6 (P3-0 to P3-15). Merges: code lands by pull request from `task/<id>` with CI green; the orchestrator may merge README-only changes straight to `main` after all six checks pass locally. The username rule of 2026-11-16 is confirmed |
| 2026-11-18 | **Owner decided: rename to AgentLemon (P3-0).** The product name, page titles, guide text, MCP package (`agentlemon-registry`, starting at 0.3.0), MCP config keys, connector Worker (`agentlemon-connector`), and the site address all change. The Firebase project id `agentforge-b10db` cannot change, so the new address is a second Hosting site in the same project (`agentlemon.web.app` if available). The old address keeps serving `catalog.json`, `/agents/**`, and every tarball in `/mcp/` permanently, because installed configs point there; page visits to it redirect to the new address. The old connector Worker is left running, untouched, until nobody uses it. The 14 seed agents keep author `@agentforge` until launch, because changing their author changes their content and their versions are frozen; `agentlemon` joins the reserved usernames. Internal stored identifiers (seed `owner_uid: 'agentforge'`) do not change. The GitHub repository is renamed last. No custom domain for now |
| 2026-11-18 | **Owner signed off: invariant 2 amended (P3-1).** The connector may sign users in and act for them, as long as it stays free and stores nothing. Sign-in happens on our own site; the connector receives an encrypted credential that the user's AI app holds; every Firestore call uses the user's own token, so the rules decide. Design in `docs/CONNECTOR_AUTH.md` before any code |
| 2026-11-18 | **Owner decided: skills (P3-8 to P3-10).** A skill is a second kind of item beside agents, with the same public, friends, and private choices and the same review for public. **Private skills may include scripts; friends and public skills are text only** until a reviewer who reads code joins. Skills live in their own public file, never in `catalog.json`, so released servers keep working. Size cap about 200 KB per skill |
| 2026-11-18 | **Owner decided: save from chat (P3-11).** Anything an AI saves through the connector lands as private on the user's page. Making it public is a deliberate step on the site and goes through review. A confirmed email is still required. The site's own forms stay |
| 2026-11-18 | **Owner decided: councils (P3-14).** Spelled "council". A council bundles agents and skills, each pinned to a version, with the instructions for how they work together. "Export the council" from a chat saves any missing member as private, then the council. Visitors can take the whole council or single members. A public council may contain only public, approved members, and goes through review |
| 2026-11-18 | **Owner decided: thumbs and comments replace stars (P3-13).** Thumbs up or down, one vote per user, changeable. Existing stars become thumbs up. Comments are public; admins can delete any comment and authors can delete their own. **A comment containing a word on the blocked-words list cannot be posted**, enforced in the browser and again in the rules or pipeline. Counts and comments reach the site through the hourly static export (an hour's delay is accepted), so invariant 3 holds |
| 2026-11-18 | **Owner decided: sign-up questions and suggestions (P3-12).** Three or four multiple-choice questions, each with an "Other" option, presented as a quick step and skippable; answers are editable in Settings. Suggestions are computed in the browser from the catalog's tags and categories. No model is called (invariant 1). Built now even though the catalog is small |
| 2026-11-18 | **Owner decided: the cheaper hourly export (P3-7) is done first,** before skills, votes, or comments add documents for the pipeline to re-read |
| 2026-11-18 | Owner approved the planned-but-unaddressed items: P3-1 is now connector sign-in (the local `npx` server stays public-only); P3-2 stays and suits Tommy; P3-3 is retired, replaced by P3-11; P3-4 is dropped for now; P3-6 analytics stays off. Protected-file changes these tasks need (`src/types/`, `firestore.rules`, `.github/`, `docs/AI_GUIDE.md`, `docs/SAFETY_LINTER.md`) are agreed in scope; each still gets its own decision-log row when it lands |
| 2026-11-16 | P2-17 (owner-authorized): admin approvals atomically create exact records in `agent_versions/<id>@<version>`. Snapshots have no client reads, updates, or deletes. Identical re-approval retries without writing the existing snapshot; rules still require complete record equality, so reused versions with changed content fail. Seed provisioning creates only missing versions and rejects source content changes at an existing version. Both MCP servers share strict historical resolution; the Worker entry remains default-only and shared code has no Node/Ajv. MCP 0.2.2 is the fifth permanent tarball. |
| 2026-11-16 | P2-17 (owner-authorized rules/pipeline changes): the exporter publishes linted historical manifests only for currently public approved catalog members, deletes stale generated files, preserves seed takedowns, and strips storage fields. Five-minute version caching permits withdrawal. Scheduled CI compares an export digest covering catalog plus history, rather than catalog bytes alone. Budget a cheaper change-detection step at roughly 1,000 combined approved-agent/snapshot documents; do not build it now. |
| 2026-11-16 | P2-12 to P2-15 account screens. **Owner-approved: changing a username never renames published agents.** Each agent keeps the `author.handle` it was approved under until its owner publishes an update; Settings says so beside the username field. Usernames follow `validHandle` (3 to 30 lowercase letters, digits, or hyphens, starting and ending with a letter or digit; `agentforge`, `admin`, `support` reserved), checked live with `getProfileByHandle`. **Welcome step trigger:** a signed-in user this browser has not yet seen with a profile or a welcome gets one `getProfile` read; no profile means the welcome step (connector link first, then a username) shows once and is never shown again, skipped or not. localStorage key `agentforge.profile.<uid>` holds `{ handle, welcomed }`, so a normal visit costs no Firestore read and loads no Firestore code. The welcome dialog is portaled to `document.body`, because the nav's backdrop blur captures `position: fixed`. The public profile reads only `catalog.json`; "Add friend" reads nothing until it is pressed. The detail view reads the user's own star (`agents/{id}/stars/{uid}`) directly through a dynamic import, because `src/services` has no star-state reader yet |
| 2026-11-16 | P2-4/P2-7/P2-9 screen patterns. Service errors reach the page only through `describeServiceError(error, action)` in `src/lib/studioErrors.ts`, which never shows SDK text. Linter findings appear beside their field as "Blocked" or "Check" with the rule id and the finding's message; with no findings the UI says the linter has nothing to flag and that this is not a safety check. No checkmark, badge, or "passed" wording anywhere. Status and visibility labels use `StatusText` from `src/components/studio/parts.tsx` (monospace capitals, no background). Review status is shown only for public agents; private and friends agents read "No review needed" |
| 2026-11-17 | The Firebase web API key is restricted to `https://agentforge-b10db.web.app/*` and `https://agentforge-b10db.firebaseapp.com/*`. Any new address that must sign users in (a custom domain, a preview channel) has to be added to the key in the Google Cloud console first. Local work uses the practice mode, which has its own key. When saving, Google reported recent Geocoding and Static Maps calls with this key. The site uses neither, and both were already outside the key's allowed list, so this is taken to be outside probing of a public key |
| 2026-11-16 | **Owner decided: the README is the shared source of truth for two people.** Tommy works through Codex; Aidan through Claude Code and Codex. Every idea goes in the ideas inbox (8.2), every piece of work in progress is claimed on the shared board (8.1), and every plan or binding choice is written here before or with the code. Work lands by pull request from a `task/<id>` branch with CI green. Protected files (listed in section 8) need Aidan's agreement |
| 2026-11-16 | Local practice mode: `npm run emulators` with `npm run dev:emulator` or `build:emulator` runs the site against the Auth and Firestore emulators (`docs/LOCAL_TESTING.md`). `src/lib/firebaseAuthInstance.ts` owns the one Auth instance and imports no Firestore code. `useAuth()` exposes `sendVerificationEmail()` |
| 2026-11-16 | P3-5 version history is pulled into Phase 2 as P2-17. Without it, an approved edit breaks every install pinned to the previous version, because the catalog holds only the newest one and an unavailable pin fails closed |
| 2026-11-16 | Orchestrator review of the wave 3 data merge, three corrections. (1) A live document that squats on a seed id is ignored, and the seed is still published from source; it no longer removes the seed. (2) `updateAgent` requires a higher version only when the live agent is public and approved. Drafts, private, friends, and not-yet-approved agents save without a version bump. (3) An hourly CI run queues behind a deploy in flight instead of cancelling it |
| 2026-11-16 | P2-7 versioned edits: approved public content stays in `agents/{id}`; owner proposals live in `agent_edits/{id}`. `updateAgent` requires a higher semver and returns `{ staged }`. Admin approval atomically copies the exact proposal, carries over live stars, views and author verification, and deletes it. Visibility changes remain immediate and remove stale proposals. This supersedes in-place public edits |
| 2026-11-16 | P2-7 self-approval: trusted `config/review { allow_self_approval: boolean }` has no client write access. Missing or true permits admin self-approval; false denies it for both submissions and versioned edits, enforced in rules |
| 2026-11-16 | P2-6/P2-7 export boundary: invalid or blocked live records are skipped and logged by id, rule and field path without field text; invalid or blocked source seeds fail the build. Only the Node exporter applies exact-version/text-hash safety allowances. Seed source content wins, seed-id squatters are excluded, seed provisioning preserves live counters, and Firestore exports use live star counts |
| 2026-11-16 | P2-7 deployment switch: CI tests and committed-tarball checks always use seeds. On main, repository variable `CATALOG_SOURCE=firestore` enables a separate post-test Firestore/site rebuild using `FIREBASE_SERVICE_ACCOUNT`; any read failure prevents deployment. Unset keeps seed deployments. Hourly scheduled runs skip deployment when catalog bytes equal the live snapshot. The deploy account needs Firestore read and seed-write access before enabling the switch |
| 2026-11-14 | **P2-11 router contract.** No router library. `src/router/routes.ts` is a pure `matchRoute(pathname)` returning `{ name, params }` (one trailing slash tolerated, `/u/<handle>` validated with `authorHandleSchema`, anything else is `not-found`); add a route there and a title in `routeTitle`. `src/router/Router.tsx` provides `useRoute()` (`route`, `location`, `go(to, { replace })`) and `<Link to>`, which navigates in place on a plain left click only. Never call `history.pushState` for a page change; use `go` or `Link`. On a path change the router scrolls to the top, sets `document.title`, and focuses the page's `main h1`. Every page but `HomePage` is a `React.lazy` chunk in `App.tsx`, and `tests/auth-ui.test.ts` fails if `src/pages/*`, `RequireAccount`, or `src/services/agents` becomes statically reachable from `src/main.tsx`. Signed-in pages wrap their content in `src/components/RequireAccount.tsx` (hold while restoring, a purpose panel plus one `openSignIn({ reason })` while signed out, render in place after sign-in, go to `/` on sign-out). New pages use `PageShell` for the frame. `?agent=<id>` stays owned by `HomePage` |
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

`AgentRecord` extends `AgentManifest` with `owner_uid: string`, `review_status: 'pending' | 'approved' | 'rejected'`, and `shared_with: string[]` (at most 100 uids). These three fields never appear in `catalog.json`. The exporter validates documents even when they will be excluded, and suppresses an existing seed when its live record becomes non-public or loses approval. Source-controlled seeds are maintainer-approved public manifests. Every approved version is stored as the exact `AgentRecord` in immutable `agent_versions/{id}@{version}`. Admin approval and snapshot creation are atomic; a previously used version can be approved again only with identical record content. Live counters and author verification can change independently without rewriting historical snapshots. The exporter strips storage fields from each snapshot and applies the same manifest validation, safety linter, and exact allowances as the catalog. Only agents currently public and approved publish `/agents/<id>/<version>.json`; private, friends, pending, rejected, taken-down, invalid, or blocked current agents publish none. `catalog.json` keeps only the newest version.

### Version 1 compatibility

Version 1 is retired. The immutable 0.1.0 and 0.1.1 server tarballs reject the version 2 live catalog and fall back to their bundled version 1 snapshots. `npm run test:package` runs both committed releases against the new catalog and checks initialization, the bundled manifest, and search.

### Skills (P3-8)

`src/types/skill.ts`, validated by `src/lib/skillSchema.ts` (zod only, safe in the Worker). Full contract in `docs/SKILLS.md`.

| Field                  | Type                                                                   | Notes                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `skill_schema_version` | `1`                                                                    | Required literal, named apart from the agent `schema_version`                                                |
| `visibility`           | `'public' \| 'friends' \| 'private'`                                   | As agents. Scripts only in `private`                                                                         |
| `id`, `version`        | `string`                                                               | Slug and semver, as agents. Skill ids are their own namespace                                                |
| `name`, `description`  | `string`                                                               | Must equal the SKILL.md frontmatter. Name: lowercase slug, at most 64 characters. Description: at most 1,024 |
| `author`               | `AgentAuthor`                                                          | As agents                                                                                                    |
| `tags`                 | `string[]`                                                             | 1 to 10 lowercase slugs                                                                                      |
| `files`                | `{ path, kind: 'instructions' \| 'reference' \| 'script', content }[]` | Exactly one `SKILL.md` at the root. Kind is derived from the path and a `#!` first line, never chosen        |
| `stats`                | `{ updated_at }`                                                       | Vote counts arrive with P3-13                                                                                |

Limits: 200 KB in all and 100 KB per file (UTF-8 bytes), 50 files, relative paths with no `..`, no leading `/`, and no hidden names. Binary files are rejected. Reference files are an allowlist of text types; anything executable or unknown is a script, and a script blocks sharing with friends and public review.

`SkillRecord` adds `owner_uid` and `review_status` (no `shared_with`). Firestore mirrors agents: live `skills/{id}`, pending `skill_edits/{id}`, immutable `skill_versions/{id}@{version}`. Skills never enter `catalog.json`. The public files are `skills.json` (`{ skill_schema_version, skills }`, file lists without text) and `skills/<id>/<version>.json` for every approved version of each currently published skill. Public readers ignore unknown fields so later additions do not break released servers.

Item references, shared with councils: `{ kind: 'agent' | 'skill', id, version }`, written `skill:<id>@<version>`. Always pinned.

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
| P1-4 | MCP go-live: live catalog with bundled fallback, Codex in the install panel, standalone packaging, and release as a tarball on the site | Codex, Claude | none | The snippet from the site connects on a machine that has never seen the repo | done. Verified live for Claude Code in P1-7 and for Codex CLI on Windows on 2026-11-17 |
| P1-5 | AI navigation guide per [7.4](#74-ai-navigation-guide), including the server wiring in `packages/mcp-server/src/server.ts` | Claude | none | A connected AI given a vague task lists and compares candidates before choosing, and says so when nothing fits |done (not yet observed with a live model; that check belongs to P1-7) |
| P1-6 | Seed coverage: at least two agents per category including `creative`, and at least one agent for each framework | Codex | none | Every category pill and every framework filter returns results | done |
| P1-7 | Live verification: walk the deployed site and a real MCP connection, file what breaks | Antigravity | P1-2, P1-4 | A written pass or fail for each Phase 1 "done when" | done. Report in `docs/verification/P1-7.md`: 25 pass, 1 not tested, 1 bug (fixed). Open follow-ups below the table |

**Phase 1 is complete.** Two follow-ups from P1-7 remain open and do not block Phase 2:

- **Guide behavior, unprompted.** Owner-tested on Claude Code on Windows, 2026-11-12. With "Use AgentForge to find..." Claude searched five ways, compared, and reported its choice: pass. With the plain task it also used the registry, but a previously loaded agent's tool was still visible, so a fully cold unprompted run is still unobserved. Version 0.1.1 adds the when-to-look rule. Not yet tested on Codex.
- **Codex connection.** Closed 2026-11-17: registered with the site's Windows command in Codex CLI 0.169.0, and `switch_agent` loaded an agent.

### Phase 2: Accounts, publishing, and sharing

Goal: people sign in, publish their own agents, and choose who sees them.

| ID | Task | Owner | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- |
| P2-1 | Schema version 2 per [section 5](#5-schema-contract): update the contract, then migrate seeds, validator, exporter, MCP server, and tests | Claude (contract), Codex (migration) | Phase 1 | No `github` field or author icon remains. Footer source link and icon stay. All five required checks pass | done |
| P2-2 | Sign-in per [7.2](#72-accounts): implement `AuthService` in `src/lib/auth.ts`, build the sign-in dialog and account menu | Codex (service), Claude (UI) | P1-1, owner enables both providers in the console | Sign up, sign in, sign out, and password reset work on the live site with both methods | service and UI done. Email and password is live on the Firebase project; Google provider, authorized domain, and a full live walkthrough with both methods remain (owner and Antigravity) |
| P2-3 | Profiles and friends: `users/{uid}`, unique handles, friend requests | Codex (data and rules), Claude (UI) | P2-2 | Two test accounts can become friends and unfriend. Rules tests cover every denial | data and rules done; UI/live account walkthrough remains |
| P2-4 | Manifest Studio: a guided form that builds a valid manifest with live validation and a visibility choice | Claude | P2-1, P2-2 | A signed-in user publishes an agent without writing JSON | done. `/studio` and `/studio?edit=<id>`: five steps, a field builder that writes JSON Schema (or edit as JSON), live validation and linter findings beside each field, verified-email and username gates, versioned edits, and a local draft. Verified in local practice mode with Playwright; not yet walked on the live site |
| P2-5 | Visibility storage and rules per [7.3](#73-visibility) | Codex | P2-1, P2-3 | Rules tests prove a private agent is unreadable by anyone else and a friends agent is readable only by friends | done; rules, typed services, bounded queries and revocation covered by emulator tests |
| P2-6 | Safety linter per [7.5](#75-safety-linter) | Claude (rule spec), Codex (implementation) | P2-1 | The linter runs in the Studio and again in the exporter. A flagged manifest cannot reach the catalog | done. Runs in the Studio, the review queue, and the exporter |
| P2-7 | Review queue and catalog pipeline: an admin screen to approve or reject public submissions, and a CI job that rebuilds `catalog.json` from approved agents. Edits carry a new version, and the approved version stays live until the edit is approved (decision of 2026-11-14). The Firestore mode needs deploy service-account read and seed-write permissions, an owner step | Codex (pipeline), Claude (UI) | P1-2, P2-5, P2-6 | An approved agent appears on the live site within one pipeline run. An unapproved one never does | data, versioned edits, rules, catalog CI and the review screen done. `/review` lists new submissions, waiting edits (field-by-field comparison) and published agents, shows every linter finding, and approves, rejects, takes down, and sets "Verified author". Verified in local practice mode; live Firestore-mode activation and verification remain |
| P2-8 | Stars: provision `agents/{id}` on approval and add the star button | Codex | P2-2, P2-7 | Starring persists, is one per user, and shows in the catalog after the next rebuild | seed provisioning, live catalog counters, and the star button done. The detail view shows a star icon and the live count; signed out it asks for sign-in, signed in it toggles at once and reverts with a plain message on failure. Cards show the count only. Verified in local practice mode against a provisioned agent (star, persist across reload, unstar, failure revert); live walkthrough remains |
| P2-9 | "My agents" and "Shared with me" pages at `/me`: the signed-in user's agents with visibility and review status, edit and change-visibility actions, and agents friends shared with them | Claude | P2-5, P2-11 | A user sees their own private, friends, and pending agents, and agents friends shared with them | done. Paged My agents with visibility, review status, and waiting edits; open, edit, change visibility (confirmed), make private, withdraw an edit. Shared with me loads a friend's agents only when that row is opened. Verified in local practice mode; not yet walked on the live site |
| P2-10 | Remote connector per [7.6](#76-remote-connector): a hosted MCP endpoint on Cloudflare Workers, deployed by CI, plus a copyable connector link on the home page and the install tab | Claude | P2-1, owner's Cloudflare account and two repository secrets | The connector URL, added in Claude's connector settings, lets Claude on desktop, web, and phone search and load public agents with nothing installed | done. Live at the URL in Project facts. CI smoke-tests it after every deploy. Owner-tested in ChatGPT on 2026-11-14 (authentication set to none): it searched, compared, chose, and described "Verified author" correctly. Owner-tested in the Claude app on the web and on a phone on 2026-11-17: all five checks passed, including loading an agent at a named version |
| P2-11 | App shell and routing: real pages and URLs for what follows (`/me`, `/u/<handle>`, `/settings`, `/studio`, `/review`), keeping `?agent=<id>` links working. Everything else in wave 3 builds on this, so it goes first | Claude | P2-2 | Each page has its own URL, survives a reload, and works with the back button. Signed-out visitors who open a signed-in page are asked to sign in | done. Pages are placeholders with no nav links; each screen session adds its own link. Verified with Playwright on a `VITE_AUTH_STUB=1` build; the `/review` admin check against real Firestore is unverified until a real admin signs in |
| P2-12 | Public profile page at `/u/<handle>`: display name, handle, "Verified author" badge, and that author's public agents. Built from `catalog.json`, so it costs no Firestore reads and works signed out | Claude | P2-11 | Clicking an author anywhere opens their profile | done. Author tags on cards and in the detail view link to `/u/<handle>`; agents open the normal detail view; "No public agents from @handle yet." when empty; "Add friend" for a signed-in visitor who is not that author (hidden for reserved handles). Verified in local practice mode, signed out and signed in |
| P2-13 | Settings page: change display name and handle, see the verify-email state and resend the email, sign out, and find the connector link | Claude (UI), Codex (a resend-verification method on `authService`) | P2-11, P2-3 | A user changes their handle and the change shows on their agents after the next catalog build | done. `/settings`: display name and username with a live availability check and the format rule, the published-agents username note, verify-email state with resend and "I have confirmed it", the connector card, and sign out. Verified in local practice mode; the handle change reaching the catalog after a build is not yet walked on the live site |
| P2-14 | Welcome step and connector placement: after a first sign-up, show a welcome step whose first item is the connector link. **Remove the connector card from the home page.** It stays at the top of each agent's install tab (so signed-out visitors can still find it) and in Settings | Claude | P2-11, P2-13 | The home page has no connector card. A new account sees the welcome step once | done. Shown once to any signed-in user without a profile (existing Google accounts included), never over the sign-in dialog or on Settings; skippable; remembered per user in localStorage (decision log). Verified in local practice mode with two accounts at desktop and 375px |
| P2-15 | Friends screens: find people by handle, send, accept, and decline requests, and remove a friend | Claude | P2-11, P2-3 | Two accounts become friends and unfriend through the UI alone | done. `/friends`: search by username prefix, send, accept, decline, cancel, and remove (confirmed); requests to you, requests you sent, friends. Says plainly when a confirmed email or a username is missing. Two emulator accounts became friends and unfriended through the UI alone; live walkthrough remains |
| P2-16 | Hardening before public launch: restrict the Firebase web API key to the site's own addresses, add the second admin, decide whether an admin may approve their own submission, and run a two-account end-to-end verification of all of Phase 2 on the live site | Owner, Antigravity | all of the above | A written pass or fail for every Phase 2 "done when" | done 2026-11-17, with gaps listed in `docs/verification/P2-16.md`. Web key restricted to the site's two addresses. Second admin added. Self-approval is a setting, default allowed. Live two-account walkthrough: 20 checks passed, 0 failed |
| P2-17 | Version history (moved up from P3-5): every approved version is kept as an immutable snapshot and published as a static file, so an install pinned to an older version keeps loading after the author updates. Local server and connector resolve old pins from those files | Codex | P2-7 | An agent is approved at 1.0.0, edited, and approved at 1.1.0; a config pinned to 1.0.0 still loads the 1.0.0 blueprint | done. Immutable approvals, filtered version export, shared old-pin resolution, MCP 0.2.2, and emulator/server/package coverage. All six required local checks pass |

#### Wave 3 order

Waves 1 and 2 are done (P2-1, P2-2, P2-3, P2-5, the P2-6 spec, P2-10). Wave 3 is the rest, in this order:

1. **Foundations, in parallel.** Claude: P2-11 (routing). Codex: P2-6 linter code, the P2-7 pipeline with versioned edits, the P2-8 star provisioning, and the resend-verification method for P2-13.
2. **Screens, after P2-11 merges.** Claude, in two sessions to keep each one small. First: P2-4 (Studio), P2-9 (`/me`), and the P2-7 review screen. Second: P2-12 (profile), P2-13 (settings), P2-14 (welcome step and connector placement), P2-15 (friends), and the P2-8 star button.
3. **Step 2 is now three parallel sessions with separate files** (2026-11-16): Claude A (P2-4, P2-9, P2-7 review screen), Claude B (P2-12 to P2-15, the P2-8 star button, the account-menu links), and Codex (P2-17). `docs/LOCAL_TESTING.md` describes the local practice mode they verify against.
4. **Verification.** P2-16, with Claude in Chrome walking the live site using the owner's admin account and a second account.

**Phase 2 is complete as of 2026-11-17.** The owner confirmed the welcome step on his own live sign-in, and Tommy received and used a real verification email when he signed up with an email and password. The local server was connected in Codex CLI on the owner's Windows computer and `switch_agent` returned `k8s-manifest-hardening@1.0.0`, which closes the Codex check left open since P1-7. What is still unverified, none of it blocking:

- Three walkthrough checks whose results the tester lost: a friend's agent under "Shared with me", an old version file still loading after an edit, and unfriending removing access. All three passed in the practice database.

### Phase 3: Your items everywhere

Goal: build something once in one AI app and use it in all the others, with no extra steps. Approved by the owner on 2026-11-18. Database work runs one task at a time because it shares `firestore.rules`; screens and design documents run alongside it.

| ID | Task | Owner | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- |
| P3-0 | Rename to AgentLemon (decision 2026-11-18): new Hosting site, product name everywhere, `agentlemon-registry` 0.3.0, `agentlemon-connector` Worker, old address kept serving files and redirecting pages, repository renamed last | Orchestrator (code), owner with Claude in Chrome (console) | none | The site, connector, and a fresh install snippet all work on the new names; an install made with 0.2.2 still loads | console done 2026-11-18 (site `agentlemon`, auth domains, web key, OAuth client, names). Code in review; live check and repository rename remain |
| P3-7 | Cheaper hourly export: an hourly run with nothing changed costs a handful of Firestore reads; a run with changes reads only what changed, with a periodic full rebuild as a safety net. Must extend to the collections Phase 3 adds | Codex | none | Tests show an unchanged run reads no agent documents, a changed run reads only changed ones, and takedowns and visibility changes still remove items | done 2026-11-18. Per-document change queues; an idle hour reads 0 agent or snapshot documents (about 2 billed reads, was 56). First live scheduled runs not yet observed |
| P3-8 | Skills contract: data shape, size cap, script rule, public file layout, linter coverage, and a reference format councils can reuse | Claude Code | none | `docs/SKILLS.md`, types, a Node-free validator, and tests merged; the orchestrator has folded the README text into section 5 | done 2026-11-18. `docs/SKILLS.md`, 29 validator tests, linter rule SK-01 specified |
| P3-9 | Skills build: Firestore records and rules, review, export to a separate public file and version files, connector and local server read tools | Codex | P3-0, P3-7, P3-8 | A public skill is approved and readable through the connector; private and friends skills never reach a public file; a script blocks sharing | open |
| P3-10 | Skills screens: upload, My items, skill detail view, review queue | Claude Code | P3-8 (runs alongside P3-9) | A signed-in user uploads a skill without writing JSON and sees it on their page | open |
| P3-1 | Connector sign-in: design first (`docs/CONNECTOR_AUTH.md`), then build. OAuth for MCP clients, sign-in on our site, an encrypted credential held by the AI app, Firestore with the user's own token, a way to disconnect all apps | Claude Code (design), Codex (build), owner (second web key and Worker secrets) | P3-0 for the build | In the Claude app, connecting signs the user in once, and the connector then lists that user's private and friends items and nobody else's | design done 2026-11-18 (`docs/CONNECTOR_AUTH.md`); build open |
| P3-11 | Save from chat: connector tools to save an agent or skill to the signed-in user's page as private, and to list and fetch their own items | Codex (tools), Claude Code (site labels) | P3-1, P3-9 | "Save this as an agent to my AgentLemon" in a connected app creates a private agent that appears on `/me` | open |
| P3-12 | Sign-up questions and suggestions: three or four multiple-choice questions with "Other", shown as a quick step after the username, skippable, editable in Settings; a suggestions page built in the browser from catalog tags | Claude Code (UI), Codex (profile fields and rules) | P3-0 | A new account answers the questions and sees suggestions; changing answers in Settings changes them | open |
| P3-13 | Thumbs and comments: votes and comments with rules, blocked-words check, admin and author deletion, report, static hourly export, stars converted to thumbs up, then the screens | Codex, then Claude Code | P3-7 | A vote and a comment appear on the live site within an hour; a comment with a blocked word cannot be posted; an admin can delete any comment | open |
| P3-14 | Councils: contract, data and rules, screens, and the "export the council" connector tool | Claude Code (contract, screens), Codex (data, tool) | P3-9, P3-11 | A council exported from a chat appears on the user's page with every member, and a visitor can take the whole council or one member | open |
| P3-2 | Missing-tool help: detect which required MCP tools the client lacks and return the install snippet for each | Codex (suits Tommy) | P3-0 | A connected AI loading an agent is told which declared tools it lacks and how to add them | open |
| P3-15 | Phase 3 live verification on the real site and in real AI apps | Owner with Antigravity or Claude in Chrome | all of the above | A written pass or fail for every Phase 3 "done when" | open |
| P3-3 | Command-line publishing | | | | retired 2026-11-18, replaced by P3-11 |
| P3-4 | SDKs for TypeScript and Python | | | | dropped for now, 2026-11-18 |
| P3-5 | Version history | | | | moved to Phase 2 as P2-17 |
| P3-6 | Usage analytics | | | | stays off, 2026-11-18 |

**Order.** P3-0 and P3-7 first, with the P3-8 contract and the P3-1 design written alongside. Then P3-9 with P3-10, then the P3-1 build, P3-11, P3-12, P3-13, P3-14, and P3-15. P3-2 can go to Tommy once P3-0 merges.

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
| Submit, edit, change visibility | `createAgent(manifest)`, `updateAgent(manifest) -> { staged: boolean }`, `setAgentVisibility(id, visibility)` |
| Versioned edit views/actions | `getPendingEdit(id)`, `withdrawPendingEdit(id)`, `listMyPendingEdits(pageSize?, afterId?)`, `listEditQueue(status?, pageSize?, afterId?)`, `reviewEdit(id, 'approved' \| 'rejected')` |
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
- **Stateless.** A shared web service cannot remember which agent one user loaded. So it has no `switch_agent` and no per-agent tool. It offers `search_registry`, `compare_agents`, and `get_agent({ agent_id, version? })`, which returns the full blueprint in one call. `agent_id` also accepts `id@version`; conflicting selectors fail closed. It serves the same guide, with the same rules, through its instructions and the `registry_guide` resource and prompt.
- **One source of logic.** Search, comparison, validation, and the guide text are shared with `packages/mcp-server`, not copied. The two must not drift, and a test enforces it.
- **Data.** It reads `catalog.json` from Firebase Hosting, caches it for a few minutes, and falls back to a bundled snapshot. An older requested pin is fetched from `/agents/<id>/<version>.json` only while the id remains in that catalog. It validates the public manifest and exact id/version, rejecting missing-file SPA HTML even with HTTP 200. It stores nothing and logs no user content.
- **Limits.** When the free plan's daily request limit is reached, the connector stops answering until the next day. The site and the local server are unaffected. No setting may be enabled that converts overage into charges.
- **Not in scope yet.** Private and friends agents need sign-in on the connection itself (OAuth). That is Phase 3, with P3-1.
- **Listing.** Adding the URL as a custom connector works as soon as the service is live. Appearing in an AI vendor's built-in connector directory requires that vendor's review and is a later, separate step.

## 8. Who does what

| Agent | Use it for | Do not use it for |
| --- | --- | --- |
| **Claude** (lead architect) | Schema and interface contracts, UI and design, written specifications and guides, security rule specs, review of other agents' work | Bulk data entry |
| **Codex** | Implementing against fixed interfaces: services, security rules, exporter and pipeline work, CI, tests, seed data, npm packaging | Product or schema decisions |
| **Antigravity** | Anything that needs a real signed-in browser: console checks, live-site walkthroughs, end-to-end verification | Changing source code outside its task |
| **Owner** (Aidan) | Credentials, console settings, approvals, and every decision marked "owner" | |
| **Tommy** (partner, second admin) | Works through Codex only. Builds tasks from section 6 and proposes new ones in the ideas inbox | Changing the protected files below without Aidan's agreement |

One orchestrator at a time. Claude, in Aidan's sessions, holds that role now: it turns ideas into task IDs, writes session prompts, and reviews merges. Session prompts are written against the task IDs in section 6.

**How work lands, for everyone:**

1. Claim it on the shared board (a commit to `main` that changes only this README).
2. Work on a branch named `task/<id>`. Never commit code straight to `main`.
3. Run `npm run lint`, `npm run format:check`, `npm run build`, `npm test`, `npm run test:package`, and, if you touched rules or services, `npm run test:firestore`.
4. Open a pull request into `main`. Merge it only when CI is green. Merging deploys the live site, so a red or unfinished branch never merges.
5. In the same pull request: update your task's status in section 6, add a decision-log row for any choice that binds later work, and remove your claim.

**Protected files.** A change to any of these needs Aidan's agreement first, recorded in the decision log: `src/types/agent.ts`, `firestore.rules`, anything under `.github/`, `docs/SAFETY_LINTER.md`, `docs/AI_GUIDE.md`, and sections 3 and 4 of this README. Nobody rewrites or deletes another person's decision-log rows, task rows, or claims.

### 8.1 Shared board

What is being built right now. One row per claim. Add yours before you start and delete it when you merge. If a claim is more than three days old with no branch activity, ask its owner before taking the work over.

| Task | Who | AI | Branch | Files or areas it touches | Claimed |
| --- | --- | --- | --- | --- | --- |
| P3-0 rename | Aidan | Claude Code (orchestrator) | `task/p3-0-rename` | Name strings and URLs across the repo, `firebase.json`, `.env.production`, `index.html`, `packages/mcp-server` (new 0.3.0 tarball), `packages/connector/wrangler.toml`, `.github/workflows/*` (URL lines only), README | 2026-11-18 |

### 8.2 Ideas inbox

Anything either person wants to add, before it is planned. One row each. Nobody builds from this table directly: the orchestrator turns an accepted idea into a task ID in section 6, with an owner and a "done when", and marks the row. Add rows at the bottom.

| Date | From | Idea | Status |
| --- | --- | --- | --- |
| 2026-11-17 | Aidan | **Skills, not only agents.** Upload a skill (for example a Claude skill folder with its `SKILL.md`) to your AgentForge page with a description, share it with the same public, friends, and private choices, and let any AI app load it through the connector, including apps with no skill feature of their own | Planned as P3-8 to P3-10 (2026-11-18) |
| 2026-11-17 | Aidan | **Publish from inside a chat.** In any connected AI: "turn this chat into a formal agent and post it to my AgentForge", or "send this skill to AgentForge". It lands on the user's own page and is then usable from their other AI apps | Planned as P3-1 and P3-11; invariant 2 amended (2026-11-18) |
| 2026-11-17 | Aidan | **The end goal, for judging every later idea:** build something once in one AI subscription and use it in all the others with no extra steps | Guiding principle, not a task |
| 2026-11-18 | Aidan | **Sign-up questions and suggestions.** A quick multiple-choice step at sign-up about work and goals, then suggested agents and skills | Planned as P3-12 |
| 2026-11-18 | Aidan | **Thumbs and comments instead of stars,** with blocked words | Planned as P3-13 |
| 2026-11-18 | Aidan | **Councils.** Export several agents and skills working together from a chat as one bundle; visitors take all or part | Planned as P3-14 |
| 2026-11-18 | Aidan | **Rename to AgentLemon,** including the MCP server and the web address | Planned as P3-0 |

### 8.3 Orchestrator notes for wave 3

Written 2026-11-17. **Superseded on 2026-11-18** by the approved Phase 3 plan (section 6) and its decision-log rows, which win wherever these notes differ (scripts, for example). Kept as background for the P3-1 design.

**Skills as a second kind of item**

- A skill is a folder: an instruction file (`SKILL.md` with a name and description) plus optional reference files and scripts. The instructions are text, like a blueprint, so the safety linter already applies.
- Any AI can use a skill as plain instructions fetched through the connector, including apps with no skill feature of their own. That is what makes it cross-subscription.
- Proposed first version: text only. Scripts are stored and shown as text, flagged, and never presented as safe to run. Running strangers' code is a different class of risk from reading their text.
- Keep skills out of `catalog.json`. Released local servers validate that file strictly and fall back to their bundled snapshot when it changes shape. Use a separate file (for example `skills.json`) and separate version files.
- It is a schema change, so `src/types/agent.ts` (protected) changes with the owner's agreement. Options: a `kind` field in a new schema version, or a sibling contract for skills.
- Size: one Firestore document holds about 1 MiB, and Cloud Storage is not assumed available on the free plan. Cap skill size in version one and say so in the upload screen.
- Reading public skills needs no sign-in, so this part can be built before the connector work below.

**Sign-in on the connector, then publishing from a chat**

- Today the connector is public, read-only, stateless, and holds no user data (invariant 2, section 7.6). Reading a user's private or friends items, or posting to their page, requires the connector to know who the user is. That means amending invariant 2 and 7.6 with the owner's written sign-off.
- Sketch to evaluate, not yet designed: the Worker acts as the OAuth front for MCP clients, signs the user in with Firebase Auth, and calls Firestore with the user's own token, so the existing security rules keep deciding what is allowed and the Worker needs no admin power. Token storage and refresh on a free plan is the open question. Do a short design pass before promising it.
- Anything an AI posts should land as **private**. Making it public stays a deliberate step on the site and still goes through human review (invariant 4). A verified email is still required.
- This overlaps P3-1 (private and friends agents over MCP) and replaces most of P3-3 (command-line publishing).

**Two decisions to put to the owner first**

1. May the connector sign users in and act for them? If yes, record the invariant change under his name.
2. Skills, version one: text only, scripts displayed but flagged. Agree, or say what instead.

**Suggested order:** skills on the site and readable through the connector, then connector sign-in, then publish-from-chat. P3-2 (missing-tool help) is small and independent and suits Tommy's Codex.

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
├── tests/                        # catalog, MCP, routes, and Firestore emulator tests
└── src/
    ├── main.tsx                  # Entry: theme, router, auth providers
    ├── App.tsx                   # Shell: nav, routed page (lazy chunks), footer
    ├── router/
    │   ├── routes.ts             # Pure matchRoute(pathname) and page titles
    │   └── Router.tsx            # RouterProvider, useRoute, go, Link
    ├── pages/                    # HomePage (catalog, ?agent=) and lazy pages:
    │                             # Me, Settings, Friends, Studio, Review, Profile, NotFound
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
        ├── PageShell.tsx         # Frame and h1 for every page except home
        ├── RequireAccount.tsx    # Gate for signed-in pages
        ├── ConnectorCard.tsx     # Connector link: install tab, Settings, welcome step
        ├── auth/                 # SignInDialog, AccountMenu (links, welcome trigger)
        ├── profile/              # Username form, handle rules, profile memory, Add friend
        ├── settings/             # Email verification panel
        ├── friends/              # Person rows, relationship sorting
        ├── welcome/              # One-time welcome step
        ├── AgentCard.tsx, AgentGrid.tsx
        └── detail/               # AgentDetailModal, SchemaViewer, InstallPanel
```

---

## 12. Open questions for the owner

1. The name. Decided 2026-11-18: AgentLemon (P3-0).
2. Who reviews public submissions once there are more than the owner can handle.

## License

MIT
