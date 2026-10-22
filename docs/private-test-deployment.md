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
