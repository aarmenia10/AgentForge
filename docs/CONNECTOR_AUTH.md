# Connector sign-in (P3-1 design)

Status: design of record for P3-1 and P3-11. The live Claude and ChatGPT walkthroughs are in P3-15.

Names assume the rename in P3-0: the site at `https://agentlemon.web.app` and the connector Worker at `https://agentlemon-connector.lesslimit.workers.dev`. Every origin below is one constant in the code (`SITE_ORIGIN`, `CONNECTOR_ORIGIN`), so a later name change is a config edit.

Confidence tags: **[Certain]** means a primary source or this repository says so. **[Likely]** means strong inference. **[Guessing]** means a gap I filled. Everything marked **UNVERIFIED** must be checked before or during the build. Section 13 collects them.

---

## 1. The uncomfortable parts first

1. **The connector has to hold the user's Firebase refresh token.** Without the Admin SDK there is no other way to mint Firebase ID tokens later. No "short-lived proof" can stand in for it, because the Worker must keep getting fresh ID tokens for weeks. The design keeps that token encrypted inside the OAuth tokens that the AI app holds, never in our storage and never in a URL, which is what invariant 2 allows. But if the Worker's encryption key ever leaks, every connected user's Firebase refresh token leaks with it, and our "Disconnect all apps" button cannot kill those tokens, because only the Admin SDK can revoke a Firebase refresh token. The fallback for a user is a password change (email accounts) or account deletion. This residual risk is the price of "no Cloud Functions, no Admin SDK". **[Certain]** on the Admin-only revocation; see sources [F2].
2. **ChatGPT write tools may not be available to most people.** Secondary reports say write-capable MCP tools need ChatGPT developer mode, which is a beta, and that plan eligibility (Plus and Pro versus Business, Enterprise, Edu) is inconsistent across OpenAI's own pages. I could not read OpenAI's docs from this environment. Treat "save from ChatGPT" as unconfirmed until the owner tests it on his own plan. **UNVERIFIED** [O1, O2].
3. **Several primary sources were unreachable here.** The network policy of this session blocked `modelcontextprotocol.io`, `firebase.google.com`, `developers.openai.com`, `help.openai.com`, `developers.cloudflare.com`, and `docs.cloud.google.com`. I read the MCP specification and the Cloudflare limits from their source repositories on GitHub (same text, same version), and Anthropic's docs directly. Firebase and OpenAI facts come from search-result extracts of their official pages and are tagged accordingly.

Nothing else here is a reason to stop. The sketch holds up with five changes, listed in section 2.

---

## 2. Verdict on the starting sketch

| Sketch element                                                         | Verdict        | Change                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker is the OAuth authorization server for MCP clients, with PKCE    | Keep           | Advertise S256 only, require it on every request                                                                                                                                                                        |
| DCR or client metadata documents                                       | Support both   | CIMD first (the MCP spec now prefers it and deprecates DCR [M1]); stateless DCR as fallback. Both gated by a redirect URI allowlist                                                                                     |
| `/authorize` sends the user to `/connect` on our site                  | Keep           | Request travels in the URL **fragment**, encrypted. The site never puts anything sensitive in a query string                                                                                                            |
| `/connect` signs in with the existing Firebase sign-in                 | Change         | Sign in again in a **separate, in-memory** Firebase Auth instance. The handed-over session is never the browser's saved session and is never persisted in the browser                                                   |
| The site hands the Worker a short-lived proof                          | Change         | The proof is the fresh session's refresh token, sent once in a POST body. A browser-binding cookie on the Worker origin ties the end of the flow to the browser that started it                                         |
| Access and refresh tokens are encrypted blobs only the Worker can open | Keep           | AES-256-GCM, per-type keys, key id in the token. The access token carries the Firebase ID token itself, so ordinary calls cost **zero** token exchanges                                                                 |
| Second API key restricted to the sign-in APIs                          | Keep, narrower | Token Service API only. The Worker never signs anyone in; it only refreshes                                                                                                                                             |
| Revocation with a per-user counter in Firestore                        | Keep, extend   | One owner-only document per user holds a counter **and** a small map of active grants. That map also gives true single-use codes and refresh-token reuse detection, which the MCP spec requires for public clients [M5] |

---

## 3. One URL or two

**Decision: two URLs, and the signed-in one is a superset.**

| URL                                                              | Who adds it                                           | Behavior                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://agentlemon-connector.lesslimit.workers.dev/mcp`         | Anyone, any client, ChatGPT "no authentication" users | Exactly today's connector. Public tools only. Never returns 401. Lists no account tools                                                                                                      |
| `https://agentlemon-connector.lesslimit.workers.dev/account/mcp` | People who want their own items                       | All public tools, working with no token, **plus** the account tools. Calling an account tool without a valid token returns HTTP 401 and the client signs the user in ("lazy authentication") |

Why not one URL with lazy authentication on `/mcp`:

- Claude supports lazy authentication on one URL: it lists tools and calls public ones without sign-in, and shows an inline Connect card only when a protected tool gets an HTTP 401 [A2]. **[Certain]** for Claude. But no other client documents the same behavior, and ChatGPT asks at setup whether a connector uses OAuth or none. A ChatGPT connector already set to "none" (the owner's own P2-10 test) would see account tools it can never use, and how it reacts to a 401 is unknown. **[Guessing]**
- "Public search keeps working with no sign-in" would then depend on every client's handling of a mixed server. With two URLs, the public URL's behavior does not change at all.
- Claude Free allows one custom connector [A3]. Making the account URL a superset means a Free user loses nothing by choosing it.

What it costs: one more line on the install tab and in Settings ("Want your private items too? Use this link instead"). The old `agentforge-connector` Worker stays public and untouched, per the rename decision.

The path is `/account/mcp`, so its protected resource metadata lives at `/.well-known/oauth-protected-resource/account/mcp`, the path-suffixed form clients try first [M2, A2]. The root `/.well-known/oauth-protected-resource` serves the same document as a fallback. That root document names the account resource; it does no harm to `/mcp`, because clients probe it only after a 401 and `/mcp` never sends one.

---

## 4. The flow

```
 AI app (Claude, ChatGPT)        Worker (CONNECTOR_ORIGIN)               Site /connect (SITE_ORIGIN)       Google
 ─────────────────────────       ──────────────────────────               ──────────────────────────       ──────
 1 tools/call list_my_items ───▶ 401 + WWW-Authenticate
 2 GET PRM, AS metadata     ───▶ JSON documents
 3 (DCR only) POST /register───▶ client_id = sealed registration
 4 browser: GET /authorize  ───▶ validate client, redirect_uri, PKCE,
                                 resource; set __Host- cookie (nonce);
                                 302 to SITE/connect#r=<sealed request>
 5                                                                         read #r, strip it from the URL
                                 ◀── POST /connect/describe {r} ────────── show consent: app host, scopes
 6                                                                         fresh sign-in, in-memory instance ─▶ Firebase Auth
 7                               ◀── POST /connect/complete ───────────── {r, refresh_token, scopes}
                                 exchange refresh token ─────────────────────────────────────────────────▶ securetoken
                                 create grant in Firestore (user's token) ───────────────────────────────▶ Firestore
                                 ─── {finish: CONNECTOR/authorize/finish?h=<sealed handoff>} ──▶
 8 browser: GET /authorize/finish ▶ check cookie nonce == handoff nonce;
                                 302 to redirect_uri?code&state&iss
 9 POST /token (code+verifier)─▶ check PKCE, single-use via grant gen,
                                 exchange refresh token, issue tokens
10 tools/call with Bearer    ──▶ open token, check audience, expiry,
                                 grant; call Firestore as the user
```

Step by step, with the rules each step enforces:

1. **Challenge.** On `/account/mcp`, a `tools/call` for an account tool without a valid token gets `401` and `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="<CONNECTOR>/.well-known/oauth-protected-resource/account/mcp", scope="items:read"`, sent from the HTTP handler **before** the MCP SDK runs, because a tool handler can only produce a 200 [A2]. Initialize, `tools/list`, and public tools pass through. A token that lacks `items:write` and calls a save tool gets `403` with `error="insufficient_scope", scope="items:read items:write"` (the full set, as Claude's docs advise) [M4, A2].
2. **Discovery.** Protected resource metadata: `resource` exactly `<CONNECTOR>/account/mcp`, `authorization_servers: [CONNECTOR_ORIGIN]` (one entry; Claude uses only the first [A1]), `scopes_supported: ["items:read", "items:write"]`, `bearer_methods_supported: ["header"]`. No `offline_access` here [M5]. Authorization server metadata at `/.well-known/oauth-authorization-server`: `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code", "refresh_token"]`, `code_challenge_methods_supported: ["S256"]` (clients must refuse without it [M3]), `token_endpoint_auth_methods_supported: ["none"]`, `client_id_metadata_document_supported: true` (Claude needs both of these two to choose CIMD [A1]), `authorization_response_iss_parameter_supported: true` [M1], and `scopes_supported` including `offline_access` so Claude asks for a refresh token [A1]. Also serve `/.well-known/openid-configuration` with the same content? No: we are not an OpenID provider and should not claim to be. RFC 8414 alone satisfies the spec [M1].
3. **Client identity.**
   - **CIMD.** `client_id` is an HTTPS URL. The Worker fetches it only if its host is on the client allowlist (section 5), with a 3-second timeout and a 16 KB cap, checks that the document's `client_id` equals the URL exactly and that the requested `redirect_uri` is in its `redirect_uris` [M3]. Loopback URIs match with the port ignored, for `127.0.0.1`, `[::1]`, and `localhost` alike, because Claude Code declares `http://localhost/callback` and `http://127.0.0.1/callback` [A1]. Fetched documents may be cached in isolate memory for 5 minutes, like the catalog today. That is a cache, not storage.
   - **DCR (deprecated by the spec, kept for clients that need it).** `POST /register` takes RFC 7591 JSON. Every `redirect_uri` must pass the allowlist, or the response is `invalid_redirect_uri`. The returned `client_id` is a sealed blob (`typ: "client"`) holding the redirect URIs, `client_name` (60 characters, plain text), `application_type`, and an issue time. No secret is issued: `token_endpoint_auth_method: "none"`. Nothing is stored; `/authorize` opens the blob to validate.
4. **`/authorize`.** Validates `response_type=code`, the client, an exact `redirect_uri` match, `code_challenge` with `code_challenge_method=S256` (anything else is refused), `state` present, and `resource` equal to `<CONNECTOR>/account/mcp` (absent is accepted and treated as that value; anything else is `invalid_target`). **Until `redirect_uri` is validated, every error is an HTML error page on the Worker, never a redirect** (RFC 6749 section 4.1.2.1; open-redirect rule [M3]). Then it sets a cookie `__Host-al_flow=<random nonce>; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600` and responds `302` to `SITE_ORIGIN/connect#r=<sealed request>`. The sealed request (`typ: "req"`, 10 minutes) holds the client id, the display host, the redirect URI, the code challenge, state, scopes, resource, and the nonce.
5. **Consent page.** `/connect` reads `#r`, then immediately calls `history.replaceState` to drop the fragment. It `POST`s `{ r }` to `/connect/describe`, which opens the blob and returns only display data: the app's host (the CIMD URL's host, or the redirect URI's host for DCR), the self-asserted name shown as secondary text, whether the redirect is loopback, and the scopes. The page never shows the self-asserted name as the identity [A2, M3]. For a loopback redirect it shows an extra warning ("an app on this computer"). Scopes appear as two plain sentences, with "save private items" individually untickable.
6. **Fresh sign-in.** The page creates a second Firebase app instance with `inMemoryPersistence` and signs in with Google or email and password there, using the same dialog components. The browser's own saved session is not used and not changed. Reasons: the handed-over token is never written to the browser's storage; an attacker cannot pre-plant their own session in the victim's browser to get the victim's AI connected to the attacker's account; and the user sees that they are signing in for this purpose. Cost: one more sign-in for someone already signed in on the site, which matches the P3-1 done-when ("connecting signs the user in once").
7. **Handover.** On Allow, the page `POST`s JSON `{ r, refresh_token, scopes }` to `/connect/complete` with `fetch`, no credentials, no URL parameters. The Worker accepts it only if the `Origin` header equals `SITE_ORIGIN` exactly (CORS alone is not a check; it is a browser courtesy). It opens `r`, checks expiry, exchanges the refresh token at `securetoken.googleapis.com/v1/token` [F1] (this proves the token is real and yields the uid, a fresh ID token, and the refresh token to keep, which may be a new one [F1]), then creates the grant (section 7). It returns `{ finish: "<CONNECTOR>/authorize/finish?h=<sealed handoff>" }`. The page signs out of the in-memory instance, which only forgets the token in memory, and calls `location.replace(finish)` after checking that `finish` starts with `CONNECTOR_ORIGIN + "/authorize/finish?"`. Cancel posts `{ r }` to `/connect/deny`, which returns a `finish` URL that ends in `error=access_denied`.
8. **Finish.** `GET /authorize/finish?h=...` opens the handoff (`typ: "handoff"`, 120 seconds), compares its nonce with the `__Host-al_flow` cookie, clears the cookie, and `302`s to `redirect_uri?code=<sealed code>&state=<state>&iss=<CONNECTOR_ORIGIN>`. A missing or different cookie gets an error page. This binds the end of the flow to the browser that began it, with no storage.
9. **Token endpoint.** Accepts `application/x-www-form-urlencoded` only [A1]. For `authorization_code`: opens the code (`typ: "code"`, 60 seconds), checks `client_id`, `redirect_uri`, `resource`, and `SHA-256(code_verifier) == code_challenge`, then enforces single use through the grant generation (section 7), exchanges the Firebase refresh token, and returns `{ access_token, token_type: "Bearer", expires_in, refresh_token, scope }`. For `refresh_token`: opens it, checks client and resource, checks the grant and generation, exchanges, rotates. Every failure of a code or refresh token is `invalid_grant` with HTTP 400, never a custom code [A1]. The endpoint must answer well inside Claude's 10-second (code) and 30-second (refresh) limits [A1]: two upstream calls of a few hundred milliseconds each.
10. **Calls.** See section 8 for the per-call checks and costs.

---

## 5. Allowlists and redirect rules

Redirect URIs accepted, in both CIMD and DCR:

| Redirect URI                                                                                | For                                    | Confidence                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://claude.ai/api/mcp/auth_callback`                                                   | Claude on web, Desktop, mobile, Cowork | [Certain] [A1]                                                                                                                                                   |
| `http://localhost/callback`, `http://127.0.0.1/callback`, `http://[::1]/callback`, any port | Claude Code and other native clients   | [Certain] for Claude Code [A1]                                                                                                                                   |
| `https://chatgpt.com/connector_platform_oauth_redirect`                                     | ChatGPT                                | **UNVERIFIED** [Guessing]. Not confirmed from any page I could read. The owner's first ChatGPT test shows the real value in the Worker's error page; add it then |

CIMD `client_id` hosts the Worker will fetch: `claude.ai` (Claude Code's document is `https://claude.ai/oauth/claude-code-client-metadata` [A1]; the hosted apps' document URL is not documented, **UNVERIFIED** but very likely on the same host), and the ChatGPT host once confirmed. Any other host gets an error page.

This allowlist is a deliberate limit on which apps can connect to the account URL. It is the single strongest defense against consent phishing (section 10) and it removes the SSRF question from CIMD fetching [M3], because the Worker only ever fetches from a few known hosts. Adding a client (Cursor, VS Code, a new Claude domain) is a one-line change with a test, and needs the owner's agreement.

---

## 6. Token format, lifetimes, and keys

### Envelope

```
al1.<kid>.<base64url( iv[12] || AES-256-GCM ciphertext+tag )>
```

- One master secret per key id, 32 random bytes. Per-type keys are derived with HKDF-SHA256, `info = "agentlemon-connector/v1/<typ>"`, so a code can never be opened as an access token, even by a bug. Additional authenticated data is `al1.<kid>.<typ>`. Web Crypto in Workers provides AES-GCM and HKDF natively [C3]. Encrypting or decrypting a 2 KB blob costs well under a millisecond of CPU. **[Likely]**
- Payload is compact JSON. Every payload has `typ`, `iat`, `exp`, and `v` (format version).
- Not a JWT: nothing outside the Worker needs to read these, and opaque tokens tell an attacker nothing.

### Types

| typ            | Carries                                                                                                        | Lifetime                                               | Where it travels                      |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `client`       | redirect URIs, client name, application type                                                                   | none (until key rotation)                              | DCR response, `client_id` parameter   |
| `req`          | client id, display host, redirect URI, code challenge, state, scopes, resource, flow nonce                     | 10 min                                                 | URL fragment to the site; POST bodies |
| `handoff`      | code (sealed), flow nonce                                                                                      | 120 s                                                  | One query string, Worker to Worker    |
| `code`         | uid, grant id, generation 0, Firebase refresh token, client id, redirect URI, code challenge, resource, scopes | 60 s, single use                                       | Redirect to the AI app's callback     |
| `at` (access)  | uid, grant id, epoch, scopes, audience, **Firebase ID token** and its expiry                                   | until the ID token's expiry minus 5 min (about 55 min) | `Authorization: Bearer` header only   |
| `rt` (refresh) | uid, grant id, generation n, epoch, Firebase refresh token, client id, resource, scopes, consent time          | 30 days idle, 90 days absolute                         | Token endpoint body only              |

Sizes: an access token is about 1.5 to 2 KB (a Firebase ID token is roughly 1 KB) **[Likely]**, well inside Workers' 128 KB header limit and 16 KB URL limit [C1]. The code is under 1.5 KB.

Why put the Firebase ID token inside the access token: it means an ordinary tool call needs no exchange with Google at all. The Worker opens the token and uses the ID token directly as `Authorization: Bearer` against Firestore REST, where Security Rules apply [F3]. The MCP access token itself is never sent upstream, which keeps the spec's ban on token passthrough [M4].

Why 55 minutes: Firebase ID tokens last one hour [F2]. Claude refreshes up to five minutes before expiry and on any 401 [A1], so the user sees nothing. Revocation does not depend on this lifetime, because every account call checks the grant (section 7).

Why 30 days idle, 90 absolute: long enough that a weekly user never re-connects within a quarter, short enough that a forgotten connection dies on its own. **Owner decision; these are defaults.** A Firebase refresh token itself never expires on time [F2], so our own limit is the only one.

### Key rotation

- Worker secret `TOKEN_KEYS`, JSON: `{"current":"k2026a","keys":{"k2026a":"<base64 32 bytes>"}}`. New tokens use `current`; opening accepts any listed key id.
- **Routine rotation (yearly, or when someone with access leaves):** add a new key, make it `current`, keep the old one for 35 days. Every live refresh token is re-sealed with the new key on its next use, and a refresh token unused for 30 days is dead anyway. Then delete the old key.
- **Emergency rotation (key may have leaked):** replace the whole secret with only a new key. Every connection fails with `invalid_grant` and its user reconnects once. This stops the Worker from honoring old tokens, but it does **not** stop someone who already decrypted Firebase refresh tokens (section 1). Tell users with email accounts to change their password; for Google accounts, the Firebase side offers nothing short of the Admin SDK. Record the incident in the decision log.
- DCR `client_id`s sealed with a removed key stop working; Claude then re-registers (DCR clients must handle re-registration [M3]).
- `TOKEN_KEYS` and `FIREBASE_TOKEN_API_KEY` are optional Worker bindings at deploy time. If either is absent or the key ring is invalid, `/account/mcp` gives HTTP 503 with an account setup message. `/mcp` continues to serve the public catalog, and discovery metadata remains available. `wrangler deploy` keeps existing secrets [C4].
- The manual **Connector encryption keys** workflow provisions `TOKEN_KEYS` through Wrangler stdin. Cloudflare hides secret values, so the workflow also puts the active key in a versioned Worker secret named `TOKEN_KEYS_<kid>`. Routine rotation creates a fresh key and references the previous slot and its retirement timestamp in `TOKEN_KEYS`. Authorization server metadata headers expose the current key ID and the previous key's deadline so the workflow can confirm deployment. The Worker stops accepting the previous key after 35 days. The `retire` operation removes its binding. `emergency` immediately publishes a ring that accepts only the new key and removes obsolete slots. All key material stays in Cloudflare between runs.

---

## 7. Revocation, single use, and rotation without storage

One document per user: `connector_grants/{uid}`, readable and writable only by that user, through the rules.

```
{
  epoch: 3,                       // bumped by "Disconnect all apps"
  grants: {                       // at most 20 entries
    "<grant id, 16 random bytes base64url>": {
      gen: 7,                     // generation of the newest refresh token
      app: "claude.ai",           // display host from the consent screen
      name: "Claude",             // self-asserted, display only, 60 chars
      scopes: "items:read items:write",
      created: <timestamp>,
      refreshed: <timestamp>
    }
  }
}
```

- **Grant creation** (`/connect/complete`): read the document, add the grant with `gen: 0`, prune grants not refreshed for 30 days, commit with an `updateTime` precondition (or `exists: false` for a first grant) so concurrent writes cannot clobber each other. **[Likely]** that the Firestore REST commit supports `currentDocument` preconditions; it is part of the v1 API.
- **Code redemption**: requires the grant to exist with `gen == 0`, then writes `gen: 1`. A second redemption finds `gen != 0`, so the code is refused **and the grant is deleted**, which kills every token issued from it, as OAuth 2.1 asks for a reused code.
- **Refresh**: requires `gen == n` (from the refresh token) and the epoch to match, then writes `gen: n+1` and `refreshed`, and returns a refresh token with `n+1`. If the stored generation is higher, an old refresh token has been replayed: delete the grant and return `invalid_grant`. That is refresh-token rotation with reuse detection, which the MCP spec requires for public clients [M5] and Claude expects [A1].
- **Every account tool call**: read the document; the token's epoch must equal `epoch` and its grant must exist. One read, and revocation takes effect on the next call.
- **"Disconnect all apps"** in Settings: one write, `epoch + 1` and `grants: {}`.
- **"Disconnect"** beside one app in Settings: delete that grant's key. Settings lists the grants with their app host and last refresh, which is a cheap "where am I connected" view. Loading that list costs one read, only when the user opens that section.

Rules for the build (a protected-file change; the P3-1 build gets its own decision-log row):

```
match /connector_grants/{uid} {
  function validGrants() {
    let d = request.resource.data;
    return d.keys().hasAll(['epoch', 'grants']) && d.keys().hasOnly(['epoch', 'grants'])
      && d.epoch is int && d.epoch >= 0
      && d.grants is map && d.grants.size() <= 20;
  }
  allow get: if signedIn() && request.auth.uid == uid;
  allow create: if signedIn() && request.auth.uid == uid && validGrants();
  allow update: if signedIn() && request.auth.uid == uid && validGrants()
    && request.resource.data.epoch >= resource.data.epoch;
  allow list, delete: if false;
}
```

The rules cannot stop a user from scribbling on their own grant map from the browser console. That only weakens that user's own revocation, so it is acceptable. What matters is that nobody else can write it and the epoch can never go down.

Known edge: if an AI app sends the same refresh token twice in parallel (a retry race), the second one looks like a replay and the grant dies; the user reconnects. Claude's docs describe one proactive refresh before expiry [A1], so this should be rare. **UNVERIFIED**; the build logs nothing, so watch for user reports. If it bites, add a 30-second grace in which `gen == n+1` and a fresh `refreshed` returns `invalid_grant` without deleting the grant.

---

## 8. Cost per call

Spark allows 50,000 Firestore reads and 20,000 writes a day; a query bills one read per document returned (minimum one), and rule `get()`/`exists()` calls bill reads too [F4]. Workers Free allows 100,000 requests a day, 10 ms CPU and 50 subrequests per request [C1].

| Operation                                                                      | Worker requests | Token exchanges | Firestore reads                            | Firestore writes |
| ------------------------------------------------------------------------------ | --------------- | --------------- | ------------------------------------------ | ---------------- |
| Public tool on either URL                                                      | 1               | 0               | 0                                          | 0                |
| `initialize`, `tools/list` on `/account/mcp`                                   | 1               | 0               | 0                                          | 0                |
| Connecting (discovery, register, authorize, describe, complete, finish, token) | about 7         | 2               | 2                                          | 2                |
| Refresh (about once an hour per active connection)                             | 1               | 1               | 1                                          | 1                |
| `account_status`                                                               | 1               | 0               | 2 (grant, profile)                         | 0                |
| `list_my_items`, page of k                                                     | 1               | 0               | 1 + max(k, 1)                              | 0                |
| `get_item`, public approved                                                    | 1               | 0               | 1 (grant; the item comes from Hosting)     | 0                |
| `get_item`, own item                                                           | 1               | 0               | 2                                          | 0                |
| `get_item`, a friend's friends item                                            | 1               | 0               | 3 (grant, item, relationship in rules)     | 0                |
| `save_agent` (create)                                                          | 1               | 0               | 3 (grant, profile, profile again in rules) | 1                |
| `update_saved_agent`                                                           | 1               | 0               | about 5                                    | 1                |

What it means in practice: one active user doing 30 account calls and 8 refreshes in a day costs roughly 100 reads and 10 writes. Spark's read ceiling allows a few hundred such users a day before the hourly export (P3-7) is counted. That is fine at today's scale; the connector should show up in whatever usage check P3-7 adds.

Two shared ceilings worth knowing:

- The 100,000 daily Worker requests are per Cloudflare account, so heavy account traffic can stop public search for the rest of the day. **[Certain]** on the limit [C1]; the fail mode is Error 1027, never a charge.
- One authenticated user can burn Firestore quota for everyone. That is already true from the browser today, so the connector adds no new class of risk.

The Worker gets 10 ms of CPU per request. Waiting on `fetch()` does not count [C1]. Chat saves are benchmarked through the full MCP route in workerd, including token verification, validation, and Firestore payload construction. The Worker reports inline linter findings for items up to 12 KiB of JSON and defers linting for larger items to the site. Private saves proceed even with a block finding, per the 2026-11-14 decision. Chat agent manifests have a 200 KiB JSON limit. Skill files keep the P3-8 limits of 100 KiB per file and 200 KiB total. The benchmark checks warm batches against 9 ms CPU per call.

---

## 9. Tools

Every account tool is on `/account/mcp` only. Public tools are the same shared code on both URLs, and the existing drift test extends to cover that.

| Tool                                                     | Task            | Scope         | Annotations                    | What it does                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | --------------- | ------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_registry`, `compare_agents`, `get_agent`         | exists          | none          | read-only                      | Unchanged. No token needed on either URL                                                                                                                                                                                                                                                                                        |
| `account_status`                                         | P3-1            | `items:read`  | read-only                      | Returns the user's handle, whether their email is confirmed, and which tools they can use. No email address, no uid. Lets the AI explain "confirm your email before saving"                                                                                                                                                     |
| `list_my_items({ kind?, visibility?, cursor?, limit? })` | P3-1            | `items:read`  | read-only                      | The user's own agents (skills once P3-9 lands), every visibility, with review status. Metadata only, no blueprints. Firestore field mask, limit 1 to 25, cursor paging, the same `owner_uid` query the site uses                                                                                                                |
| `get_item({ kind, id, version? })`                       | P3-1            | `items:read`  | read-only                      | One item's full blueprint, if the rules let this user read it: their own, a friend's friends-visible item, or a public one. Public approved items come from the catalog first. Returns the same third-party-text notice `get_agent` uses                                                                                        |
| `save_agent({ manifest })`                               | P3-11           | `items:write` | not read-only, not destructive | Creates a new agent, always `visibility: "private"`, `review_status: "pending"`, author from the user's profile, counters zero, `shared_with: []`. Commit precondition `exists: false`, so it can never overwrite. Returns the linter findings, the item's `/me` link, and a reminder that making it public happens on the site |
| `save_skill({ skill })`                                  | P3-11           | `items:write` | not read-only, not destructive | Same for skills, after P3-9, in the P3-8 shape. Scripts are allowed because the item is private                                                                                                                                                                                                                                 |
| `update_saved_agent({ manifest })`, `update_saved_skill` | P3-11, optional | `items:write` | **destructive**                | Replaces an existing item only if it is the user's own **and** private. A friends or public item is refused, because a private save would take it down. Marked destructive so Claude always asks [A4]                                                                                                                           |

Design rules for these tools:

- Validate with the zod schemas in `src/lib/manifestSchema.ts` only. `src/lib/validateManifest.ts` uses Ajv, which Workers forbid (decision of 2026-11-14), so the Worker cannot compile the item's input and output JSON Schemas. The site's Studio flags a bad schema when the user opens the item. **[Certain]** on the Ajv import.
- A friend's item is someone else's text. Wrap it in the same notice as public blueprints.
- `list_my_items` performs one Firestore query per page. An unfiltered sequence pages through agents and then skills. Follow `next_cursor` until it is null, including when a page is empty. Agent pages allow 25 results. Skill pages follow the existing 20-result Firestore limit.
- Chat saves carry `saved_from_chat: true` in the Firestore record. Agent and skill records and snapshots can retain it through later site edits and review. Both exporters strip the field and the public manifest schemas omit it. The `/me` owner panels show “Saved from chat”.
- The optional update tools are deferred. Chat saves create new records with an existence precondition.
- Split read and write tools; no catch-all tool [A4]. Every tool gets a `title` and the right hint, because Claude bases auto-permission on them: read-only tools may run unprompted, destructive ones always prompt [A4]. ChatGPT reportedly treats any tool without `readOnlyHint: true` as a write and asks for confirmation [O2]. **UNVERIFIED**
- Add OpenAI's per-tool `securitySchemes` (`noauth` for public tools, `oauth2` with the scope for account tools) in the tool descriptors. It is reported to be how ChatGPT learns which tools need sign-in [O3] and is harmless elsewhere. **UNVERIFIED**
- Not in P3-1: "shared with me" listing. It costs a page of relationships plus a query per friend. `get_item` by id already covers a friend's item someone names. Add a `list_shared_with_me(friend_handle)` later if people ask.
- P3-14 later adds `export_council` on the same scopes and the same private-only rule.

---

## 10. Threat model

| Threat                                   | How it would work                                                                                                                                           | Defense                                                                                                                                                                                                                                                                                                                           | Left over                                                                                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stolen access token**                  | Malware or a log on the AI side leaks a bearer token                                                                                                        | Opaque, encrypted, audience-bound to `/account/mcp` [M4]; header only, never a query string [M4]; about 55 minutes; grant checked on every account call, so "Disconnect" kills it at once                                                                                                                                         | Works until expiry or disconnect if nobody notices                                                                                                                                                                                                 |
| **Stolen refresh token**                 | Same, for the refresh token                                                                                                                                 | Rotation with reuse detection: whichever side refreshes second triggers grant deletion, which kills both branches; 30-day idle limit                                                                                                                                                                                              | An attacker who refreshes first and keeps refreshing holds access until the real client's next refresh kills the grant                                                                                                                             |
| **Stolen Worker key**                    | Cloudflare account compromise, secret leaked                                                                                                                | Secret only in Cloudflare; observability off; emergency rotation                                                                                                                                                                                                                                                                  | Decrypted Firebase refresh tokens stay valid at Firebase until password change or account deletion (section 1). The biggest residual risk in the design                                                                                            |
| **Redirect URI abuse**                   | Attacker registers a client with their own redirect and tricks a user into consenting                                                                       | Exact-match allowlist in both CIMD and DCR (section 5); loopback limited to `localhost` and loopback IPs                                                                                                                                                                                                                          | A malicious local app on the user's own computer can claim a loopback port; the consent screen warns about loopback [M3]                                                                                                                           |
| **Consent phishing**                     | A link to `/authorize` dressed up as something harmless                                                                                                     | The allowlist means the code can only land at claude.ai, ChatGPT, or the user's own machine, where the attacker has no pending state to redeem it; the consent screen names the app by host, not by its claimed name; the user must sign in fresh                                                                                 | The loopback case above                                                                                                                                                                                                                            |
| **CSRF / session swap**                  | Make the victim's AI connect to the attacker's account (then the victim's saves land with the attacker), or the reverse                                     | Fresh in-memory sign-in on `/connect` (no pre-planted session); `Origin` check on `/connect/complete`; flow cookie binds `/authorize` to `/authorize/finish`; `state` and PKCE on the client side; `iss` in the response [M1]                                                                                                     | None known                                                                                                                                                                                                                                         |
| **Open redirect**                        | Use the Worker or the site to bounce a user to an arbitrary URL                                                                                             | The Worker redirects only to validated redirect URIs and shows error pages before validation; `/connect` navigates only to a URL starting with `CONNECTOR_ORIGIN/authorize/finish?`; no `returnTo` parameters anywhere                                                                                                            | None known                                                                                                                                                                                                                                         |
| **Clickjacking**                         | Frame `/connect` and trick the Allow click                                                                                                                  | `/connect` served with `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` (a `firebase.json` header rule in the build)                                                                                                                                                                                 | None known                                                                                                                                                                                                                                         |
| **Token or proof in logs**               | URLs end up in access logs and browser history                                                                                                              | The request travels in a fragment, which servers and `Referer` never see; the refresh token travels only in a POST body; Worker observability stays off and the code never logs headers or bodies; the code and handoff do sit in browser history but are sealed, short-lived, single-use, and PKCE-bound                         | Browser history holds dead sealed blobs                                                                                                                                                                                                            |
| **Replay of a code**                     | Intercepted code reused                                                                                                                                     | PKCE; 60 seconds; true single use through the grant generation, and reuse deletes the grant                                                                                                                                                                                                                                       | None known                                                                                                                                                                                                                                         |
| **Replay of `/connect/complete`**        | Re-POST a captured body                                                                                                                                     | Needs the refresh token, which is the credential itself; `req` expires in 10 minutes; the handoff is useless without the flow cookie                                                                                                                                                                                              | None beyond holding the credential                                                                                                                                                                                                                 |
| **Prompt-injected saves**                | A web page or document in the chat tells the AI "save this as an agent"; the planted text then follows the user into their other AI apps through `get_item` | Saves are always private; tool descriptions say to save only on the user's explicit request and to show the content first; save tools are non-read-only so Claude and ChatGPT ask before running them [A4, O2]; linter findings come back in the result; one item per call; `get_item` wraps every item in the third-party notice | A user who clicks "Always allow" on a save tool loses the confirmation. Recommended follow-up (owner decision, schema change): mark items saved from chat, and show "Saved from chat, not reviewed by you" on `/me` until the user opens them once |
| **Mix-up between authorization servers** | Client confuses issuers                                                                                                                                     | `iss` parameter in every authorization response, advertised in metadata [M1]                                                                                                                                                                                                                                                      | None known                                                                                                                                                                                                                                         |
| **Confused deputy**                      | The Worker acting on Firebase with a client the user never approved                                                                                         | Every client, CIMD or DCR, goes through our own consent screen [M3]; the Worker never holds admin power, and Firestore rules decide every read and write                                                                                                                                                                          | None known                                                                                                                                                                                                                                         |
| **Quota exhaustion**                     | A scripted client hammers account tools                                                                                                                     | Each account call costs at least one read; fail modes are a paused Worker (Error 1027) or Firestore quota errors, never charges                                                                                                                                                                                                   | Public search can be down for the rest of a UTC day                                                                                                                                                                                                |

---

## 11. What the owner sets up

Plain steps, in order. None costs money; do not accept any prompt that offers an upgrade.

1. **Google Cloud console, project `agentforge-b10db`, APIs and Services, Credentials: create an API key** named "AgentLemon connector token key".
   - Application restrictions: **None.** Cloudflare's outgoing addresses are not fixed, so IP limits cannot work, and referrer limits are for browsers.
   - API restrictions: **Restrict key**, select **Token Service API** only. If the first test refresh fails with a "this API is blocked" error, also add **Identity Toolkit API** and tell Codex. **UNVERIFIED** whether Token Service alone is enough.
   - Copy the key. It can only turn refresh tokens someone already holds into ID tokens, so it is low-value, but it is still a secret: it goes only into Cloudflare.
2. **Cloudflare dashboard, Workers and Pages, `agentlemon-connector`, Settings, Variables and Secrets.** Add the Google Cloud key as a **Secret** named `FIREBASE_TOKEN_API_KEY`.
3. **GitHub, Actions, Connector encryption keys.** After the connector code deploys from `main`, choose **Run workflow** and **initialize**. The workflow uses the existing repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to generate and install the encryption keys. The owner never handles the generated values.
4. **Check the Cloudflare plan is still Workers Free** and that no spending or paid add-on is enabled. Leave observability off.
5. **Firebase console, Authentication, Settings, Authorized domains:** confirm `agentlemon.web.app` is listed (P3-0 should have done this). The `/connect` page's Google sign-in needs it.
6. **The existing web API key** must allow `https://agentlemon.web.app/*` (also P3-0). The `/connect` page uses that key like every other page.
7. **Do not upgrade Firebase Authentication to Identity Platform.** It bills by monthly active users.
8. **After the build deploys:** add `https://agentlemon-connector.lesslimit.workers.dev/account/mcp` as a custom connector in Claude on the web, connect, and walk the test in section 12, "Manual". Then try ChatGPT in developer mode and note the redirect URI its error shows, if any.
9. **For routine rotation**, run the workflow with **rotate** and run **retire** after 35 days. Use **emergency** if a key may have leaked. That operation requires connected users to reconnect. See section 6 for the Firebase-side response to a leak.

Rules and the `firebase.json` header change deploy through CI as usual.

---

## 12. Test plan for Codex

Automated connector tests inject upstream `fetch`, the clock, and random bytes. `npm run test:firestore` runs both emulators under Java 21 and exercises the Secure Token refresh endpoint at `http://127.0.0.1:9099/securetoken.googleapis.com/v1/token` as well as the Firestore REST rules. Run `npm --prefix packages/connector run benchmark` for the workerd CPU check.

**Envelope (`packages/connector/src/tokens.ts`)**

1. Seal and open round-trips each type.
2. A token sealed as one type fails to open as every other type.
3. Any flipped byte, a truncated token, a wrong prefix, or an unknown key id fails closed.
4. Expired tokens fail; tokens one second before expiry pass.
5. With two keys listed, tokens from either open; new tokens use `current`.
6. Removing a key makes its tokens fail.

**Discovery and registration**

7. Protected resource metadata at both well-known paths: exact `resource`, one authorization server, scopes without `offline_access`.
8. Authorization server metadata has every field in section 4 step 2, including `S256`, `none`, CIMD support, and the `iss` flag.
9. `/register` accepts an allowlisted redirect, refuses any other with `invalid_redirect_uri`, issues no secret, and its `client_id` opens to the submitted data.

**Authorize, consent, finish**

10. A non-allowlisted redirect, unknown client, CIMD host off the list, CIMD document whose `client_id` differs from its URL, or oversized or slow CIMD document all produce an error page and **no redirect**.
11. Missing `code_challenge`, `plain` method, missing `state`, wrong `resource` are refused; absent `resource` is accepted.
12. Loopback redirects match with any port for `localhost`, `127.0.0.1`, `[::1]`, and not for other hosts.
13. Success sets the `__Host-` cookie with the stated attributes and redirects to `SITE_ORIGIN/connect#r=...` with nothing in the query string.
14. `/connect/describe` returns display data only, never the code challenge or state.
15. `/connect/complete` refuses a missing or wrong `Origin`, an expired `r`, and a refresh token the (mocked) securetoken endpoint rejects; on success it returns a `finish` URL on the Worker origin.
16. `/authorize/finish` refuses a missing cookie, a different nonce, and an expired handoff; on success it redirects with `code`, `state`, and `iss`, and clears the cookie.
17. `/connect/deny` leads to `error=access_denied` with the original `state`.

**Token endpoint**

18. Refuses JSON bodies; accepts form-urlencoded.
19. Wrong verifier, wrong `client_id`, wrong `redirect_uri`, wrong `resource`, expired code: `invalid_grant` with 400.
20. A code redeemed twice: the second fails and the grant is gone; a refresh token from the first redemption then fails too.
21. Refresh rotates; the old refresh token then fails and deletes the grant.
22. A refresh after "Disconnect all" (epoch bumped) fails with `invalid_grant`.
23. Idle and absolute refresh limits are enforced.
24. The Firebase refresh token returned by the exchange is the one sealed into the new refresh token, even when it differs from the old one.
25. `expires_in` never exceeds the Firebase ID token's remaining life minus five minutes.

**MCP gating**

26. `/mcp` never returns 401, lists no account tools, and still passes the existing smoke test.
27. On `/account/mcp` without a token: `initialize`, `tools/list`, and public tools succeed; each account tool returns HTTP 401 with the exact `WWW-Authenticate` header in section 4 step 1, before the SDK runs (batch requests included).
28. With a read-only token, save tools return 403 `insufficient_scope` with the full scope set.
29. A token whose audience is not `/account/mcp` gets 401.
30. Public tool results on both URLs are identical (extend the drift test).
31. Tool list order is deterministic, every tool has a `title`, and annotations match section 9.

**Against the emulators**

32. `connector_grants` rules: the owner can create, read, and update; nobody else can read or write; epoch cannot decrease; more than 20 grants, extra keys, or a non-integer epoch are refused; list and delete are refused.
33. `list_my_items` returns only the caller's items, across all three visibilities, and never another user's.
34. `get_item` reads a friend's friends item, fails after unfriending, and fails for a stranger's private item.
35. `save_agent` creates a private, pending item visible on the owner's account views; refuses an existing id without changing it; refuses a caller without a confirmed email with a clear message; never produces anything the exporter would publish.
36. If `update_saved_agent` is added later, confirm that it refuses friends and public items and someone else's private item.
37. "Disconnect all apps" from the site's service function makes the next account call fail with 401.

**Budget**

38. A benchmark of `save_agent` with the largest allowed manifest, and later `save_skill` at the P3-8 cap, measured in the Workers runtime (`wrangler dev` or Miniflare) with a stated threshold under 10 ms of CPU, failing CI if it regresses.
39. A count test: each tool makes at most the Firestore calls in section 8.

**CI smoke after deploy** (`packages/connector/smoke.mjs`): both metadata kinds return 200 and parse. An account tool without a token returns the authentication challenge when configured or the setup error when a secret is missing. Public search on `/mcp` works in both cases.

**Manual (P3-15, owner with Claude in Chrome)**: Claude web: add the account URL, public search works with no sign-in, "list my items" shows the Connect card, sign in, list shows exactly that account's private and friends items; a second account sees only its own. Claude mobile: same with the account already connected. Claude Code: `claude mcp add --transport http` the account URL, `/mcp` to sign in. "Save this as an agent" lands private on `/me`. "Disconnect all apps" in Settings, then the next call asks to reconnect. ChatGPT developer mode: the same, recording the plan used and whether save is allowed.

---

## 13. Open questions and unverified points

| #   | Question                                                                                             | Why it matters                                                                                                                                                             | How to settle                                                                              |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | ChatGPT's OAuth redirect URI and CIMD host                                                           | Without them ChatGPT cannot connect to the account URL                                                                                                                     | Owner's first ChatGPT connection attempt; the Worker's error page names the rejected value |
| 2   | Which ChatGPT plans and modes allow write tools today                                                | Decides whether "save from ChatGPT" is a feature for most users                                                                                                            | Owner reads OpenAI's help center and tests on his plan                                     |
| 3   | Whether ChatGPT honors an HTTP 401 for one tool (lazy auth) or only signs in up front                | If only up front, ChatGPT users of the account URL simply sign in when adding it; no design change                                                                         | Same test                                                                                  |
| 4   | The hosted Claude apps' CIMD URL host                                                                | The allowlist assumes `claude.ai`                                                                                                                                          | First Claude web connection; if it differs, DCR still works as fallback                    |
| 5   | Token Service API alone is enough for the refresh exchange                                           | Step 1 of section 11                                                                                                                                                       | First refresh in staging                                                                   |
| 6   | Firestore REST accepts the ID token without an API key                                               | If a key is required, add Cloud Firestore API to the second key's restrictions                                                                                             | First emulator-to-production smoke test                                                    |
| 7   | The Firebase refresh exchange may return a new refresh token [F1]                                    | Handled (test 24); listed so nobody "optimizes" it away                                                                                                                    | None                                                                                       |
| 8   | Linter CPU on large skills                                                                           | Could exceed 10 ms                                                                                                                                                         | Benchmark (test 38)                                                                        |
| 9   | Parallel refresh races in real clients                                                               | Could disconnect users needlessly                                                                                                                                          | User reports; grace window in section 7 if needed                                          |
| 10  | Claude follows auth spec versions up to 2025-11-25 [A1]; the latest spec is 2026-07-28 [M1]          | The authorization parts used here are the same in both, but the 2026-07-28 spec also makes MCP stateless (no `initialize`). The connector's SDK upgrade is a separate task | Track when Claude adopts 2026-07-28                                                        |
| 11  | Owner decisions: refresh limits (30/90 days), the client allowlist, and the "saved from chat" marker | Product choices                                                                                                                                                            | Owner                                                                                      |

---

## 14. Sources

Read 2026-11-18. "Read directly" means I read the page or its source file. "Search extract" means the host was blocked here and I relied on search-result extracts of the official page.

- **[M1]** Model Context Protocol specification, version 2026-07-28 (marked latest in the site config), Authorization overview and Key Changes. Read directly from the specification's source repository: `docs/specification/2026-07-28/basic/authorization/index.mdx` and `changelog.mdx` in `github.com/modelcontextprotocol/modelcontextprotocol`. Published at https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization. Key lines: "Authorization is OPTIONAL"; authorization servers and clients "SHOULD support OAuth Client ID Metadata Documents"; DCR "is deprecated and retained for backwards compatibility"; servers "MUST implement OAuth 2.0 Protected Resource Metadata"; servers "SHOULD include the `iss` parameter in authorization responses".
- **[M2]** Same version, Authorization Server Discovery (`authorization-server-discovery.mdx`): path-suffixed metadata "`https://example.com/.well-known/oauth-protected-resource/public/mcp`", then root.
- **[M3]** Same version, Client Registration (`client-registration.mdx`) and Security Considerations (`security-considerations.mdx`): CIMD validation ("MUST validate redirect URIs presented in an authorization request against those in the metadata document"), `client_id_metadata_document_supported`, SSRF, "MUST clearly display the redirect URI hostname during authorization", exact redirect matching, PKCE S256 and `code_challenge_methods_supported`, confused deputy.
- **[M4]** Same version, Authorization overview: resource indicators "MUST be included in both authorization requests and token requests"; tokens "MUST NOT be included in the URI query string"; servers "MUST validate that access tokens were issued specifically for them"; "MUST NOT pass through the token it received"; 403 `insufficient_scope` and step-up.
- **[M5]** Same version: "For public clients, authorization servers MUST rotate refresh tokens"; servers "SHOULD NOT include `offline_access`" in their challenge or resource metadata.
- **[A1]** Anthropic, "Authentication for connectors", https://claude.com/docs/connectors/building/authentication.md, read directly: supported auth types including `oauth_cimd` and `oauth_dcr`; "Claude normally selects CIMD only when your authorization server metadata advertises both `client_id_metadata_document_supported: true` and `none`"; callback `https://claude.ai/api/mcp/auth_callback`; Claude Code loopback and its CIMD at `https://claude.ai/oauth/claude-code-client-metadata`; "Claude uses only the first entry" of `authorization_servers`; refresh "reactively on a 401 response, and proactively up to five minutes before the stored expiry"; `invalid_grant`; rotation for public clients; form-urlencoded token requests; 10 s and 30 s limits; Claude follows "the 2025-03-26, 2025-06-18, and 2025-11-25 authorization specifications" (https://claude.com/docs/connectors/building/index.md).
- **[A2]** Anthropic, "Lazy authentication for MCP servers", https://claude.com/docs/connectors/building/lazy-authentication.md, read directly: public tools before sign-in, "Claude starts sign-in only when the HTTP request itself fails with `401 Unauthorized`", the gate must run before the SDK, a 200 with `isError` does not trigger sign-in, 403 step-up, show the CIMD URL's host rather than `client_name`.
- **[A3]** Anthropic Help Center, "Getting started with custom connectors using remote MCP", https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp, read directly: available on Free, Pro, Max, Ultra, Team, and Enterprise; "Free users are limited to one custom connector"; Claude connects from Anthropic's cloud on every client, including mobile.
- **[A4]** Anthropic, connector review criteria, https://claude.com/docs/connectors/building/review-criteria.md, read directly: "readOnlyHint: true for read-only tools, and destructiveHint: true for tools that modify or delete data. These determine auto-permissions in Claude"; split read and write tools.
- **[O1]** OpenAI Developers announcement of full MCP support in developer mode, https://x.com/OpenAIDevs/status/1965807401745207708 (search extract): write actions "in developer mode"; Business, Enterprise, and Edu in beta. Plan details conflict across secondary sources (for example https://coworker.ai/blog/chatgpt-mcp). OpenAI's own help pages (https://help.openai.com/en/articles/12584461) were blocked here. **UNVERIFIED.**
- **[O2]** Secondary reports on write confirmation in developer mode: https://devops.com/chatgpt-developer-mode-full-mcp-access-with-serious-responsibilities and https://pure-neo.io/ai-news/openai-adds-developer-mode-to-chatgpt-with-full-mcp-client-support (search extracts). **UNVERIFIED.**
- **[O3]** OpenAI Apps SDK, Authentication, https://developers.openai.com/plugins/build/auth.md (search extract; host blocked here): per-tool `securitySchemes` with `noauth` and `oauth2`, protected resource metadata, `_meta["mcp/www_authenticate"]`. **UNVERIFIED** in detail.
- **[F1]** Firebase Auth REST API, "Exchange a refresh token for an ID token", https://firebase.google.com/docs/reference/rest/auth (search extract): `POST https://securetoken.googleapis.com/v1/token?key=[API_KEY]`, form body `grant_type=refresh_token&refresh_token=...`; the response's `refresh_token` is "the refresh token from the request or a newly issued one"; `expires_in` in seconds.
- **[F2]** Firebase, "Manage User Sessions", https://firebase.google.com/docs/auth/admin/manage-sessions (search extract): ID tokens "last for an hour"; refresh tokens expire only when the user is deleted, disabled, or "a major account change is detected" such as a password or email update; revoking refresh tokens is an Admin SDK operation.
- **[F3]** Firebase, "Using the Cloud Firestore REST API", https://firebase.google.com/docs/firestore/use-rest-api (search extract): requests with a Firebase ID token in `Authorization: Bearer` are evaluated against Security Rules.
- **[F4]** Firebase pricing and Firestore quotas, https://firebase.google.com/pricing and https://firebase.google.com/docs/firestore/quotas: Spark daily limits as already recorded in README section 2 (50,000 reads, 20,000 writes). Rule `get()` billing as recorded in README section 2 and in this repository's rules practice. Not re-read here (host blocked).
- **[C1]** Cloudflare Workers limits, https://developers.cloudflare.com/workers/platform/limits/, read directly from `src/content/docs/workers/platform/limits.mdx` in `github.com/cloudflare/cloudflare-docs`: Free plan 100,000 requests a day ("Error 1027" past it), "10 ms" CPU per HTTP request with occasional flexibility, waiting on `fetch()` "does not count toward CPU time", 50 subrequests, 128 MB memory, URL 16 KB, request headers 128 KB.
- **[C3]** Cloudflare Workers Web Crypto, https://developers.cloudflare.com/workers/runtime-apis/web-crypto/, read from the same repository: AES-GCM and HKDF supported.
- **[C4]** Cloudflare Workers secrets, https://developers.cloudflare.com/workers/configuration/secrets/, read from the same repository: the `secrets` property makes `wrangler deploy` "fail with a clear error if any required secrets are not configured"; secrets not included in a deploy "are preserved from the previous version".

---

## 15. README changes

Proposed text for the P3-1/P3-11 pull request description. The orchestrator can fold it into README section 7.6:

> ### 7.6 Remote connector
>
> The local server needs Node and a terminal, and cannot run on a phone or in a web app. The remote connector is the registry behind a web address that a user pastes into their AI app's connector settings. Design of record for sign-in: `docs/CONNECTOR_AUTH.md`.
>
> - **Where it runs.** Cloudflare Workers Free, Worker `agentlemon-connector`. Code lives in `packages/connector/`. CI uses the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. A separate manual workflow generates and rotates `TOKEN_KEYS`. The owner adds `FIREBASE_TOKEN_API_KEY` in Cloudflare. Deploys and `/mcp` work without either secret. Until both are configured, `/account/mcp` reports that account sign-in is unavailable. The old `agentforge-connector` Worker stays available.
> - **Two addresses.** `/mcp` is public and read-only, with no sign-in, and never asks for one. `/account/mcp` offers the same public tools with no sign-in, plus account tools; the first account tool a user calls makes their AI app sign them in. The account address is a superset, so one connector is enough.
> - **Sign-in.** The Worker is an OAuth 2.1 authorization server for MCP clients: PKCE S256 only, Client ID Metadata Documents first, stateless Dynamic Client Registration as a fallback, and an allowlist of redirect URIs (Claude's hosted callback, loopback for native apps, ChatGPT once confirmed). The user signs in on our own site at `/connect`, in a fresh session that the browser does not keep, and approves the app by its host name. The Worker never holds admin power: every Firestore read and write uses the user's own Firebase ID token, so the security rules decide.
> - **Stores nothing.** Access and refresh tokens are encrypted blobs that only the Worker can open, held by the user's AI app. The access token carries the user's Firebase ID token and lasts about 55 minutes; the refresh token carries the Firebase refresh token, rotates on every use, and lapses after 30 idle days or 90 days in all. Keys rotate as `docs/CONNECTOR_AUTH.md` section 6 describes. There is no database, key-value store, Durable Object, or log of user content.
> - **Revocation.** Each user owns one document, `connector_grants/{uid}`, holding a counter and their active connections. Every account call checks it. Settings lists connected apps, disconnects one, or disconnects all. The same document makes authorization codes single-use and detects a replayed refresh token, which disconnects that app.
> - **Tools.** Public tools include `search_registry`, `compare_agents`, `get_agent`, `search_skills`, `get_skill`, and `get_skill_file`. `get_agent` returns the full blueprint and accepts an exact version via `version` or `id@version`. Account tools are `account_status`, `list_my_items`, `get_item`, `save_agent`, and `save_skill`. Chat saves need a confirmed email and appear as private with a “Saved from chat” label on `/me`. Publishing takes a separate submission and review on the site.
> - **Stateless.** A shared web service cannot remember which agent one user loaded, so there is no `switch_agent` and no per-agent tool. The guide is served through the instructions and the `registry_guide` resource and prompt.
> - **One source of logic.** Search, comparison, validation, and the guide text are shared with `packages/mcp-server`, not copied. A test fails if the public tools on either address differ from the local server's.
> - **Data.** Public tools read `catalog.json` from Firebase Hosting, cache it for a few minutes, and fall back to a bundled snapshot. An older requested pin is fetched from `/agents/<id>/<version>.json` only while the id remains in that catalog, and every response is validated as a public manifest with the exact id and version. Account tools read and write Firestore through its REST API with the user's token.
> - **Cost.** Public calls cost no Firestore reads. An account call costs one read for the revocation check plus what it reads; a save costs about three reads and one write; a token refresh, about once an hour per active connection, costs one read, one write, and one exchange with Firebase Auth. See `docs/CONNECTOR_AUTH.md` section 8.
> - **Limits.** The free plan allows 100,000 requests a day per Cloudflare account, shared by both addresses; past that the connector stops answering until midnight UTC. The site and the local server are unaffected. No setting may be enabled that converts overage into charges, and Firebase Authentication is never upgraded to Identity Platform.
> - **Listing.** Adding either address as a custom connector works as soon as the service is live. Appearing in an AI vendor's built-in connector directory requires that vendor's review and is a later, separate step.

Also, in the same pull request: in section 7.3, replace "Until `P3-1`, private and friends agents are usable from the website only (copy the blueprint). The local MCP server sees public agents." with "Private and friends agents are usable from the website and through the connector's account address (`/account/mcp`). The local MCP server sees public agents only." Add a decision-log row for the `connector_grants` rules and the `firebase.json` frame headers, both protected or shared files.
