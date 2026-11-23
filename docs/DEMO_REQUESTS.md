# Private enterprise demo requests

The public Enterprise page saves inquiries directly to Firestore without
requiring an account or a callable function. New inquiries go to
`enterprise_demo_inbox` to avoid triggering the former email notification.
Historical inquiries in `enterprise_demo_requests` are included in the inbox.

Both verified founder accounts can open Demo Requests from the account
dropdown. Firestore rules deny all other visitors and platform administrators
read, list, update, and delete access. Public creates must match an exact
schema with a server timestamp, New status, and empty honeypot. Only founders
can edit status and internal notes. Firebase project IAM operators retain
privileged access.

## Deployment and limits

Deploy Hosting and Firestore rules together using the normal CI workflow.
No new Firebase plan, email service, or Cloud Function is needed. If the
previous email functions were already deployed, the project operator should
retire them after the new form is live. Do not delete historical records.

The form uses a honeypot, field length validation, a disabled submit button,
and a deterministic document ID derived from normalized contents to prevent
ordinary repeat submissions. Firestore rejects overwriting existing inquiries.
These measures do not provide robust rate limiting or bot protection: rules
cannot enforce a hash or request rate for unauthenticated visitors. Monitor
usage and consider App Check or a managed anti-abuse endpoint if abuse occurs.
Realtime inbox listeners consume Firestore reads; free-tier quotas still apply.

Run the normal CI tests, including the Firestore emulator tests, before
publishing. Verify both founder accounts on the deployed website.
