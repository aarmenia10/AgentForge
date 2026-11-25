# AgentLemon Enterprise

The /enterprise route uses existing Firebase Authentication. A verified employee registers a domain or requests access to an existing organization. The first administrator must prove control of the organization's DNS. An administrator approves subsequent verified employees and can disable or promote accounts. An admin cannot change their own membership; disabled users cannot request a new membership.

## Operator configuration

Deploy the updated Firestore rules to the same Firebase project as the website before publishing the frontend. No public catalog, exporter, or hosting data changes are required.

For each new organization, the registration form produces a DNS TXT challenge. An authorized operator should confirm the organization is legitimate, the applicant is authorized to administer it, and the domain is not a shared consumer email provider. The applicant adds the TXT record and supplies their registration reference. Using a trusted environment with Firebase Admin application default credentials for the correct project, run:

```sh
npx tsx scripts/verify-enterprise-domain.ts PROJECT_ID REGISTRATION_UID
```

The script validates the verified Firebase email, DNS proof, and unchanged registration, then atomically creates the organization and its administrator. The domain can only be registered once. Do not expose admin credentials or deploy this script to the browser. Configure your enterprise support channel and communicate its contact details before launch.

## Data and access

Enterprise data resides in enterprise_orgs/{domain}/items, never in public agent or skill collections. Firestore stores file bytes privately with a 256 KiB per-file limit. Files are downloaded through authenticated Firestore reads, never public URLs. Members can edit/delete their own items; admins can manage all items and employee access. Firebase rules enforce access on all operations and require a verified email matching the tenant domain. Downloads are inert attachments: files are not executed or rendered.

The dashboard reads the library and employee lists in bounded pages of 50. Larger packages require private object storage with equivalent tenant checks. Previously downloaded files cannot be recalled. As with the existing Firebase architecture, trusted project operators have privileged access; this is not end-to-end encryption. Review security, retention, audit logging, domain ownership renewal, quotas, and organizational offboarding policies before production use.

## Verification

Run npm run typecheck, npm run lint, npm test and npm run test:firestore. Verify registration with a real DNS domain in a staging project before deployment.

## Enterprise Demo

The Enterprise Demo button opens an independent, owner-scoped workspace after corporate email verification. It does not claim ownership of a domain or provide production Enterprise access. Common consumer email domains are blocked; email-only verification cannot prove company ownership or authorization. Use sample data unless your organization authorizes confidential uploads.

The demo owner can invite an exact coworker email on the same domain and share the workspace code. The coworker verifies their email, enters the code, and requests access. The owner must approve before access is granted. Matching domains alone confer no repository access. Demo members can be disabled by the owner.

Demo data is stored exclusively under `enterprise_demos/{ownerUid}`, with separate rules and no public export integration. The same 256 KiB package limit applies. Demo registration does not change production DNS verification.
