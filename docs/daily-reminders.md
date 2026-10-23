# Daily-drop web push

## Runtime behavior

Candor sends at most one reminder per user per New York local date. The two UTC cron calls run every day. The endpoint sends only during the 11:00 hour in `America/New_York`, so 15:00 UTC is active while New York is on daylight time and 16:00 UTC is active while it is on standard time. There is no day-of-week exclusion.

The recipient query uses the latest `story_completed` event emitted by the existing read-completion path. A user needs an active subscription, at least one recorded read, and a latest read whose `content_day` is earlier than `app_config.current_day`.

`web-push` uses `TTL: 10800` (three hours). Delivery runs ten subscriptions at a time, stops claiming new work after 45 seconds, and this route explicitly caps itself at 60 seconds. The route therefore has a 60-second effective limit even when Vercel Fluid Compute would allow a longer Hobby limit.

## Initial setup

1. Run `supabase/reminders.sql` in the Supabase SQL Editor.
2. Generate one VAPID pair locally:

   ```powershell
   npx web-push generate-vapid-keys --json
   ```

3. Add the four reminder environment variables listed in `.env.example` to Vercel.
4. Redeploy so the public key is built into the client JavaScript.
5. In a new, temporary Supabase SQL Editor tab, replace the two values below and run it. Do not save this snippet in the repository:

   ```sql
   select vault.create_secret(
     'https://REPLACE-WITH-YOUR-VERCEL-PRODUCTION-DOMAIN',
     'candor_production_url',
     'Candor production URL for reminder cron'
   );

   select vault.create_secret(
     'REPLACE-WITH-THE-SAME-CRON-SECRET-AS-VERCEL',
     'candor_cron_secret',
     'Authorization secret for Candor reminder cron'
   );
   ```

6. Close the SQL Editor tab containing the real values. Then run the tracked `supabase/reminders-cron.sql` unchanged. It contains only Vault secret names and refuses to schedule jobs when either Vault entry is missing.
7. Rerun `supabase/analytics-views.sql` to add the reminder-only external view.

Do not rotate the VAPID pair unless you intend to invalidate every existing subscription. Vault encrypts values at rest. Supabase documents that a decrypted Authorization header is briefly present in pg_net's internal request queue while it is dispatched; database roles with direct pg_net queue access remain a platform-level trust boundary.

## Protected PowerShell checks

Replace every value inside angle brackets. `$domain` must be the Vercel Production URL and `$secret` must equal the Vercel `CRON_SECRET` and the Vault value.

```powershell
$domain = "https://<YOUR-PRODUCTION-DOMAIN>"
$secret = "<YOUR-CRON-SECRET>"
$anonymousId = "<YOUR-ANONYMOUS-UUID>"
$headers = @{ Authorization = "Bearer $secret"; "Content-Type" = "application/json" }

# Dry run: ignores the 11:00 window, applies the real recipient rule and today's
# one-per-local-date ledger, and returns counts without sending or writing rows.
Invoke-RestMethod -Method Post -Uri "$domain/api/cron/reminders" `
  -Headers $headers -Body '{"dry_run":true}'

# Force one subscribed tester. This bypasses time and recipient eligibility,
# but still honors the one-per-local-date ledger.
$body = @{ only_anonymous_id = $anonymousId; force = $true } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$domain/api/cron/reminders" -Headers $headers -Body $body

# Delete today's ledger row for that tester and force-send again.
$body = @{ only_anonymous_id = $anonymousId; force = $true; reset = $true } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$domain/api/cron/reminders" -Headers $headers -Body $body
```

`only_anonymous_id` is client-supplied, matching Candor's existing anonymous identity model. It is not an authentication credential.

## Supabase inspection queries

### Eligible recipients right now

This applies the actual read/content-day rule. It intentionally selects no endpoint keys:

```sql
select eligible.anonymous_id, eligible.created_at as subscription_created_at
from public.eligible_reminder_subscriptions(
  (select value from public.app_config where key = 'current_day'),
  null
) as eligible
where not exists (
  select 1
  from public.reminders_sent sent
  where sent.anonymous_id = eligible.anonymous_id
    and sent.local_date = timezone('America/New_York', now())::date
)
order by eligible.created_at desc;
```

This matches the protected HTTP dry run by subtracting users already present in today's New York-local `reminders_sent` ledger.

### Find the newest internal tester identities

Open the relevant device once with `?internal=1`, then run:

```sql
select
  u.anonymous_id,
  max(e.created_at) as last_event_at,
  count(*) as event_count
from public.users u
join public.events e on e.anonymous_id = u.anonymous_id
where u.is_internal = true
group by u.anonymous_id
order by last_event_at desc
limit 20;
```

### Active subscriptions and reminder ledger

```sql
select id, anonymous_id, created_at, last_success_at, last_failure_at, failure_count
from public.push_subscriptions
order by created_at desc;

select anonymous_id, local_date, content_day, sent_at, result
from public.reminders_sent
order by sent_at desc;
```

### Cron jobs, run history and recent HTTP responses

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname like 'candor-daily-reminder-%'
order by jobname;

select
  j.jobname,
  d.status,
  d.start_time,
  d.end_time,
  d.return_message
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname like 'candor-daily-reminder-%'
order by d.start_time desc
limit 20;

select id, status_code, timed_out, error_msg, created, content
from net._http_response
order by created desc
limit 20;
```

`net._http_response` is retained for roughly six hours by default and does not include the request URL. If the project uses pg_net for other jobs, the final query shows all recent pg_net responses, so correlate it by time and response body.

## Real-device checklist

### Android Chrome

- Open onboarding over HTTPS without installing the PWA.
- Confirm the reminder switch begins off and no prompt appears by itself.
- Tap it once, allow notifications, and confirm the switch reports subscribed.
- Confirm one `push_subscriptions` row exists, then use the forced test command.
- Receive the notification, tap it, and confirm Candor focuses or opens at the digest.
- Confirm `src=reminder` disappears and both open events exist.
- Turn the switch off and confirm the browser subscription and server row are gone.
- Block notifications in Android settings and confirm the denied guidance appears without another prompt.

### Installed iPhone or iPad (iOS/iPadOS 16.4 or later)

- In Safari browser mode, confirm the switch stays off and asks for Home Screen installation.
- Add Candor to the Home Screen and launch the installed app.
- Tap the switch, allow notifications, and run the forced test command.
- Confirm receipt, notification click focus/navigation, and analytics.
- Disable the reminder and confirm the server row is removed.

Real push delivery, OS permission-settings wording, background delivery, focus of an already-open app, and scheduled 11:00 delivery must be verified on physical devices.
