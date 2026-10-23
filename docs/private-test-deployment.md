# Private-test deployment

## Before the first deployment

1. In Supabase SQL Editor, run `supabase/app-config.sql` once.
2. Push the repository to GitHub, GitLab, or Bitbucket.
3. In Vercel, choose **Add New → Project**, import the repository, and leave the
   detected framework as **Next.js**.
4. Keep the repository root as the Root Directory, the install command as
   `npm install`, and the build command as `npm run build`. No output-directory
   override is needed.
5. Add these server-only variables to both **Production** and **Preview**:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `NOINDEX=1`
   - `ALLOW_DAY_OVERRIDE=0`
6. Optional fallback: add `CURRENT_DAY=day1` to Production and Preview. Supabase
   `app_config.current_day` wins whenever it is readable.
7. Do not add `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MAX_ATTEMPTS`, or
   `GEMINI_RETRY_BASE_MS` to Vercel. They belong to the local generation scripts.
8. Deploy. Give testers the domain labeled **Production** in Vercel, not a URL
   from a Preview deployment or pull request.

## Publishing content

Add `stories/dayN/`, with the same category subfolders used by earlier days. Each
input story JSON must have its paired `_output.json`. Add reviewed Fact or Opinion
rounds to `game-content/fact-opinion.json` when applicable. Commit and deploy these
files; they are bundled into the deployment and cannot be added to a running
deployment.

After the deployment succeeds, publish it by changing the database setting:

```sql
update public.app_config
set value = 'day2', updated_at = now()
where key = 'current_day';
```

Allow about 60 seconds for every server instance to refresh the value. The
production `?day=` override remains disabled unless `ALLOW_DAY_OVERRIDE=1` was
explicitly set before that deployment.

## Verification and rollback

- Open the production domain in a private window and complete onboarding.
- Confirm `/robots.txt` contains `Disallow: /` and an HTTP response includes
  `X-Robots-Tag: noindex, nofollow, noarchive` while `NOINDEX=1`.
- Open a digest, a story, both games, comments, and the caught-up page.
- Install the PWA on one iPhone and one Android device and verify an online reload
  after changing `current_day`.
- If a deployment is bad, open **Deployments**, select the previous production
  deployment, and use **Rollback**. A rollback restores that deployment's code and
  environment snapshot; it does not undo the `app_config` database value, so set
  `current_day` back separately if needed.

## Daily-drop reminders

Run `supabase/reminders.sql` once. Generate one long-lived VAPID key pair:

```powershell
npx web-push generate-vapid-keys --json
```

Changing that pair later invalidates existing browser subscriptions. Add these to
both Vercel **Production** and **Preview** if reminder testing is needed in both:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public; bundled into client JavaScript)
- `VAPID_PRIVATE_KEY` (server only)
- `VAPID_SUBJECT=mailto:YOUR_REAL_EMAIL` (server only)
- `CRON_SECRET` (server only; use a long random value)

The production Supabase cron must call only the Vercel domain labeled Production.
Create `candor_production_url` and `candor_cron_secret` directly in Supabase Vault
using the temporary SQL Editor snippet in `docs/daily-reminders.md`. Then run
`supabase/reminders-cron.sql` unchanged and inspect `cron.job` to confirm both jobs
are active. The tracked cron file contains no URL or secret value. Preview
deployments do not get their own scheduled job.

Environment exposure summary:

- Server/runtime: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or legacy
  `SUPABASE_SERVICE_ROLE_KEY`), `CURRENT_DAY`, `ALLOW_DAY_OVERRIDE`, `NOINDEX`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`.
- Client bundle: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the generated
  `NEXT_PUBLIC_CANDOR_SW_VERSION` only.

NEXT_PUBLIC_VAPID_PUBLIC_KEY is captured at build time for the browser toggle, so
changing it requires a redeploy. VAPID_PRIVATE_KEY, VAPID_SUBJECT, and
CRON_SECRET are read only by the server route at invocation time; Vercel still
attaches environment values to deployments, so redeploy after changing them.
- Local generation only: `GEMINI_API_KEY`, `GEMINI_MODEL`,
  `GEMINI_MAX_ATTEMPTS`, `GEMINI_RETRY_BASE_MS`.
- Platform-provided: `NODE_ENV`, `NEXT_RUNTIME`, and `VERCEL_DEPLOYMENT_ID`.

`CRON_SECRET` and `VAPID_PRIVATE_KEY` are referenced only by Node.js route code;
Next.js exposes only variables prefixed with `NEXT_PUBLIC_` to client bundles.
