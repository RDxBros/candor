# Candor story generation

This repository contains the Candor Next.js app and its story-generation pipeline.
Check out the mvp: https://candor-one.vercel.app/

## Supabase backend

1. Create a Supabase project, open **SQL Editor**, and run
   [`supabase/schema.sql`](supabase/schema.sql).
   If this project was created before badges and permanent source IDs were added,
   run [`supabase/badges-and-source-ids.sql`](supabase/badges-and-source-ids.sql)
   once afterward. Its final result lists legacy attempts that could not be mapped;
   it does not delete them.
   For an existing project, also run
   [`supabase/practice-mode.sql`](supabase/practice-mode.sql) once before testing
   practice mode. It adds the practice round grouping field and keeps uniqueness
   limited to scored attempts.
2. Copy `.env.example` to `.env.local`.
3. In Supabase’s **Connect** dialog or **Settings → API Keys**, add the project URL
   and a server-side secret key to `.env.local`. Never commit or expose that key.
4. Restart `npm run dev` after changing environment variables.
5. Run [`supabase/app-config.sql`](supabase/app-config.sql) once. This creates the
   server-only content-day setting. To publish day 2 without changing code, run:

```sql
update public.app_config
set value = 'day2', updated_at = now()
where key = 'current_day';
```

The app refreshes this setting within about 60 seconds. The `CURRENT_DAY`
environment variable and the built-in `day1` value are fallbacks only.

The browser stores one random anonymous UUID. The Next.js API uses that UUID to
upsert reading/game stats and attach comments to the corresponding database user.
Comments are limited to 500 characters, shown newest first, and hidden once they
reach three reports. Supabase credentials are used only by server routes.

The user record also stores lifetime game accuracy and streak-freeze usage. A new
freeze is earned for each completed 90-day period since `created_at`, with at most
three available at once. Individual game attempts and one-per-user comment reports
are stored separately. After pulling schema changes, run `supabase/schema.sql`
again in the Supabase SQL Editor. The migration statements are safe to rerun and
add missing tables, columns, and functions without deleting existing data.

For Vercel, follow [`docs/private-test-deployment.md`](docs/private-test-deployment.md).

## Batch generation (Step 2)

Pass one day folder to `generate.js`. Category subfolders are scanned recursively:

```powershell
$env:GEMINI_API_KEY = "your-api-key"
node .\generate.js .\stories\day1\
```

For each input such as `news_&_society\001.json`, the script writes
`news_&_society\001_output.json` beside it. An existing paired output is skipped
only when it contains `"reviewed_by_human": true`; otherwise it is regenerated.
Malformed inputs and individual API errors are reported without stopping the
remaining stories. The final summary reports generated, skipped, and failed counts.

Temporary API failures (`408`, `429`, and `5xx`) are retried automatically with
exponential backoff. The default is five total attempts per story. These optional
environment variables tune that behavior:

```powershell
$env:GEMINI_MAX_ATTEMPTS = "7"
$env:GEMINI_RETRY_BASE_MS = "3000"
node .\generate.js .\stories\day1\
```

Batch generation defaults to the stable `gemini-3.8-flash` model. Both Gemini
entry points read this shared default from `gemini-config.js`. Override it for
one PowerShell session without changing the code:

```powershell
$env:GEMINI_MODEL = "another-supported-model-id"
node .\generate.js .\stories\day1\
```

Remove a previous session override to return to Candor's shared default:

```powershell
Remove-Item Env:GEMINI_MODEL -ErrorAction SilentlyContinue
```

Inputs must contain a headline, one folder-matching topic, a boolean
`lean_comparison`, and two or three sources. Each source needs an `outlet` (or
`source_name`) and an `excerpt`. When `lean_comparison` is `true`, the story must
contain exactly three sources: one with each `bias_label` of `left`, `center`, and
`right`. Those stories receive the full neutral-summary, source-comparison, and
keywords output. When it is `false`, `bias_label` is optional, two or three sources
are allowed, and the output contains only `generated.what_happened`. Those stories
also stay out of the lean game and Explorer badge tracking.

The generator assigns a permanent UUID `source_id` to any source that does not
already have one before it checks whether the paired output is reviewed. Existing
IDs are never regenerated, so renaming an outlet does not break game or badge
history.

## Original single-story spike

## Requirements

- Node.js 18 or newer
- A Gemini API key

## Run

In PowerShell:

```powershell
$env:GEMINI_API_KEY = "your-api-key"
node .\step1-gemini.mjs
```

The result is printed and saved to `output/latest.txt`. Review that file manually
before proceeding beyond Step 1.

The default model is `gemini-3.8-flash`. To use another available model:

```powershell
$env:GEMINI_MODEL = "your-model-name"
node .\step1-gemini.mjs
```

To inspect the complete request without calling Gemini:

```powershell
node .\step1-gemini.mjs --dry-run
```

Before evaluating quality, replace the clearly marked synthetic `STORY` excerpts
in `step1-gemini.mjs` with excerpts from a single real story.

## A 403 permission error

`403 PERMISSION_DENIED` means Google received the key but does not authorize it
for this API resource. In Google AI Studio's API Keys page, check the key type and
project. The simplest fix is normally to create a new authorization key there,
copy it into a fresh PowerShell session, and retry:

```powershell
Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
$env:GEMINI_API_KEY = "new-key-copied-from-google-ai-studio"
node .\step1-gemini.mjs
```

For a legacy standard key, ensure it is explicitly restricted to the Gemini API;
unrestricted standard keys are rejected. Also confirm the associated project has
the Generative Language API enabled, your account has project access, the Gemini
terms have been accepted, and you are calling from a supported region.
