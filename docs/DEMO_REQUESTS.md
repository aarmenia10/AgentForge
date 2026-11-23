# Enterprise demo requests

The public Enterprise page has a separate Request a Demo dialog. It uses the
Firebase callable function `requestDemo` without requiring authentication.
The existing Enterprise Demo and production registration paths are unchanged.

## Required operator setup before publishing

Enable Firebase Cloud Functions (Blaze plan), Firestore, and Secret Manager
on the correct project. Ensure the deploy operator has Functions, Eventarc,
Cloud Build, and Secret Manager permissions.

Create a Resend API key with sending permission and verify a sending domain.
Set the Firebase function secret using:

```sh
npx firebase functions:secrets:set DEMO_EMAIL_CONFIG --project PROJECT_ID
```

At the secret prompt, enter JSON of this shape (replace placeholders locally):

```json
{
  "key": "<API key>",
  "from": "<verified sender>",
  "recipients": ["<founder one>", "<founder two>"]
}
```

Use both founders' designated addresses as the recipients. Never put the
actual configuration in version control or frontend environment variables.

From the feature branch, deploy the functions to a staging Firebase project:

```sh
npx firebase deploy --only functions:requestDemo,functions:notifyDemoRequest --project PROJECT_ID
```

Deploy the Firestore rules to that same project. Verify a real test submission
produces a Firestore request and one email to both founders with the correct
reply-to. Test mobile and desktop, errors, rate limits, and anonymous access.
Repeat with production configuration before publishing the frontend; existing
CI deploys Hosting and rules only.

Configure Firestore TTL on `enterprise_demo_rate_limits.expiresAt` and monitor
the functions and requests with failed or pending delivery status.

Requests are persisted before the email notification, with a server timestamp.
The notification function retries delivery failures, and the email provider
uses an idempotency key. The same normalized form contents are stored only
once. Rate limits use transactional hourly counters (global, client IP, and
email), and a honeypot rejects basic automated submissions. Review abuse
monitoring and consider an additional managed CAPTCHA as traffic grows.

Only existing AgentForce platform administrators can read these request
documents in Firestore. Clients cannot write them or access rate counters.
Project IAM operators also have privileged access. Establish a retention
policy and restrict production project access. Failed requests remain
available for authorized operators to follow up manually.

Run `npx tsx --test tests/demo-request.test.ts` for validation and mocked
email delivery tests; run the normal repository CI for build and lint.
