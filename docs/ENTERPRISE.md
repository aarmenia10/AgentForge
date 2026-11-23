# AgentForce Enterprise

## Company registration

Sign in with a verified corporate email. The site detects its domain. If the organization is new, enter its name and generate a DNS challenge. Add the displayed TXT record to your company's DNS settings, wait for propagation, and select **Verify Company**. The server verifies the current Firebase identity, resolves the TXT record, and atomically creates the workspace and its initial administrator. Challenges expire after seven days.

Existing organizations are discovered by verified employees of the same domain. Employees request access; the administrator approves, declines, or revokes access in the company library. Employees do not need to establish DNS ownership.

Personal email accounts can use the isolated demo repository with sample files. Demo files never enter the public catalog or a company's workspace.

## Deployment

The verification endpoint is a Firebase HTTPS function behind the Hosting rewrite at /api/enterprise/verify. Deploy the function before deploying the updated Hosting configuration and Firestore rules. The Firebase project must support Cloud Functions deployment, and its deploy identity must have appropriate permissions. Verify the endpoint in a staging project before publishing. The former manual verification script is retired.

## Data and access

Company data remains in enterprise_orgs/{domain}/items. Demo data resides in enterprise_demos/{uid}/items. Firestore rules enforce identity, active membership, and tenant isolation; client writes cannot issue challenges or establish company ownership. Public marketplace collections remain separate. Files are inert downloads with a 256 KiB limit, and cannot be recalled once downloaded.

## Verification

Run npm run typecheck, npm run lint, npm run format:check, npm run build, npm test, and npm run test:firestore. Confirm DNS verification in staging using a domain you control.
