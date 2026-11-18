# Local practice mode

Run the whole site against throwaway copies of sign-in and the database. Nothing
here touches the live project, and all data disappears when the emulators stop.
Needs Java 21 or newer.

```bash
npm run emulators      # terminal 1: Auth on 9099, Firestore on 8080, real firestore.rules
npm run dev:emulator   # terminal 2: the site on http://localhost:5173
```

`npm run build:emulator` produces the same thing as a static build in `dist/`.
The mode is switched on by `.env.emulator` (`VITE_FIREBASE_EMULATOR=1`), which
only `--mode emulator` loads. Production builds never read it, and
`tests/local-emulator.test.ts` fails if `.env.production` ever sets the flag.

## Things a test run needs

**Sign up** with any email and a password of six or more characters. No email is
sent.

**Verify an email.** The emulator keeps the link instead of sending it:

```bash
curl -s http://127.0.0.1:9099/emulator/v1/projects/demo-agentlemon/oobCodes
```

Open the `oobLink` of the newest `VERIFY_EMAIL` entry, then use "I have confirmed
it" in the account menu.

**Google sign-in** opens the emulator's own account picker. Add any made-up
account there.

**Make someone an admin.** Clients cannot write `admins/`, as in production. The
emulator accepts the owner token, which bypasses the rules:

```bash
curl -s -X PATCH -H 'Authorization: Bearer owner' -H 'Content-Type: application/json' \
  'http://127.0.0.1:8080/v1/projects/demo-agentlemon/databases/(default)/documents/admins/<UID>' \
  -d '{"fields":{"role":{"stringValue":"admin"}}}'
```

The same call with `config/review` and
`{"fields":{"allow_self_approval":{"booleanValue":false}}}` turns self-approval
off.

**Find a user's UID:**

```bash
curl -s -X POST -H 'Authorization: Bearer owner' -H 'Content-Type: application/json' \
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-agentlemon/accounts:query' -d '{}'
```

**The public catalog** in this mode is still `public/catalog.json` built from
seeds. To see approved agents flow into it, run the exporter against the
emulator: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GOOGLE_CLOUD_PROJECT=demo-agentlemon npm run build:catalog`.
