# Everything for OneDrive

A personal, mobile-first Android PWA that indexes only the OneDrive folders you choose and searches file/folder names plus metadata from a backend database.

## What Is Built

- Next.js App Router, TypeScript, Tailwind CSS v4
- Microsoft OAuth login for personal Microsoft accounts
- Microsoft Graph read-only access with these scopes:
  `openid profile email offline_access User.Read Files.Read`
- OneDrive folder browser
- Selected folder management
- Resumable selected-folder sync using Microsoft Graph delta where available
- Fast online metadata search from Postgres
- Search filters:
  `ext:pdf`, `ext:docx`, `type:file`, `type:folder`, `path:keyword`
- Search sorting by relevance, newest modified, name, or largest size
- Recent search history stored locally in the browser
- Sync all button for selected folders
- Per-folder sync batch/page/item progress
- Large-folder warnings after indexing
- Android-friendly PWA manifest and service worker
- Offline app shell plus cached recent search API responses

## Architecture Review

This MVP is realistic, with a few important boundaries.

1. Do not index all OneDrive by default.
   The app only indexes folders you explicitly add. Removing a folder deletes its indexed metadata.

2. Initial sync can still be large.
   A selected folder can contain thousands of descendants. The sync API processes a few Graph pages per request and stores a cursor so it can resume.

3. Delta sync is feasible, but not magic.
   Microsoft Graph delta returns next links and delta links. This project stores both. If Microsoft invalidates an old delta token, a fresh enumeration may be required.

4. Free-tier serverless is not a background worker.
   This MVP syncs when the app is opened or when you tap Sync now. For very large libraries, a paid queue/cron/worker setup would be better.

5. Offline search is intentionally limited.
   The service worker caches the app shell and recent `/api/search` responses. It does not copy your whole metadata database to the phone.

6. Secrets stay server-side.
   `MICROSOFT_CLIENT_SECRET`, `AUTH_SECRET`, and token encryption happen only in server routes. The frontend never receives Microsoft tokens.

7. File contents are not stored.
   The database stores only metadata: name, normalized name, path, type, extension, size, modified time, IDs, and `webUrl`.

## Recommendation: Vercel vs Cloudflare

Use Vercel for this selected-folder MVP.

Why:

- This is a normal full-stack Next.js app with Node.js API routes.
- Microsoft OAuth with a client secret is simpler on Vercel's Node runtime.
- A hosted Postgres database such as Neon or Supabase works well with the `DATABASE_URL` model.
- Vercel function durations are enough for batched sync requests when each request processes only a few Graph pages.

Cloudflare can work, but I would treat it as a later port:

- Full-stack Next.js on Cloudflare uses the OpenNext adapter.
- Database choices and Node compatibility need more care.
- It is excellent for edge workloads, but this MVP benefits more from simple Node APIs plus Postgres.

## Folder Structure

```text
everything-for-onedrive/
  db/
    schema.sql                     # Postgres tables and search indexes
  public/
    manifest.webmanifest           # PWA install metadata
    sw.js                          # App shell + recent search cache
    icons/icon.svg                 # PWA icon
  scripts/
    setup-db.mjs                   # Applies db/schema.sql to DATABASE_URL
  src/
    app/
      api/
        auth/microsoft/login/route.ts
        auth/microsoft/callback/route.ts
        auth/logout/route.ts
        session/route.ts
        onedrive/folders/route.ts
        indexed-folders/route.ts
        indexed-folders/[id]/route.ts
        sync/folders/[id]/route.ts
        search/route.ts
      globals.css
      layout.tsx
      page.tsx
    components/
      app-shell.tsx                # Mobile-first PWA UI
      pwa-register.tsx             # Registers service worker in production
    lib/
      auth.ts                      # Cookies, session lookup, token refresh
      config.ts                    # Microsoft endpoints and env helpers
      crypto.ts                    # AES-GCM token encryption
      db.ts                        # Lazy Postgres client
      graph.ts                     # Microsoft Graph helpers and retry handling
      http.ts
      pkce.ts
      search.ts                    # Query/filter parser
```

## Database Schema

The main schema is in `db/schema.sql`.

Core tables:

- `indexed_folders`
- `drive_items`

Support table:

- `app_sessions`, used to store encrypted Microsoft access and refresh tokens server-side.

Extra fields added beyond your requested schema:

- `account_id`, so every row is tied to the signed-in Microsoft account.
- `sync_cursor`, so interrupted sync can resume from `@odata.nextLink`.
- timestamps on `indexed_folders`, useful for debugging and deployment.

Search indexes:

- `pg_trgm` GIN index on `normalized_name`
- `pg_trgm` GIN index on `lower(path)`
- B-tree indexes for extension, type, folder, and deleted status

## Local Setup

### 1. Install Node.js

Install Node.js 20.9 or newer.

Check it:

```powershell
node --version
npm --version
```

### 2. Install dependencies

From this folder:

```powershell
cd C:\Users\luank\Videos\ToolLu2\EverythingOnedrive\everything-for-onedrive
npm install
```

### 3. Create a Postgres database

Use one of these:

- Neon free Postgres
- Supabase free Postgres
- Local Postgres

Create a database named something like:

```text
everything_for_onedrive
```

### 4. Create `.env.local`

Copy the example:

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL=postgres://...
AUTH_SECRET=use-a-long-random-string-at-least-32-characters
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
APP_BASE_URL=http://localhost:3000
```

Generate a random `AUTH_SECRET` in PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 5. Create the Microsoft app registration

In Microsoft Entra admin center:

1. Go to App registrations.
2. Create a new registration.
3. Name it `Everything for OneDrive`.
4. Supported account types: personal Microsoft accounts only.
5. Redirect URI type: Web.
6. Redirect URI:

```text
http://localhost:3000/api/auth/microsoft/callback
```

Then:

1. Copy Application client ID into `MICROSOFT_CLIENT_ID`.
2. Create a client secret.
3. Copy the secret value into `MICROSOFT_CLIENT_SECRET`.
4. In API permissions, add delegated Microsoft Graph permissions:
   `openid`, `profile`, `email`, `offline_access`, `User.Read`, `Files.Read`.

### 6. Apply the database schema

```powershell
npm run db:setup
```

### 7. Run the app

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

## How To Use

1. Sign in with Microsoft.
2. Open the Folders tab.
3. Browse OneDrive folders.
4. Tap the add button on folders you want to index.
5. The app syncs the selected folder and descendants.
6. Open the Search tab.
7. Search by name or use filters:

```text
invoice ext:pdf
type:folder path:archive
budget ext:xlsx
```

Results are capped at 50 by default.

Use the sort control to switch between relevance, modified time, name, and size. Recent searches are saved only in your browser storage.

In the Sync tab:

- **Sync all** runs selected folders one-by-one.
- **Sync now** updates one folder.
- **Full** forces a fresh full re-enumeration for that folder.
- Progress shows batches, Graph pages, and items processed in the latest sync run.
- Large indexes show a warning so you know sync may take longer or hit Microsoft throttling.

## Deployment On Vercel

1. Push this folder to GitHub.
2. Create a Vercel project from the repo.
3. Add a Postgres database. Neon or Supabase are good free options.
4. Set Vercel environment variables:

```env
DATABASE_URL=...
AUTH_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
APP_BASE_URL=https://your-project.vercel.app
```

5. In the Microsoft app registration, add this redirect URI:

```text
https://your-project.vercel.app/api/auth/microsoft/callback
```

6. Deploy.
7. Run the schema once against the production database:

```powershell
$env:DATABASE_URL="your-production-database-url"
npm run db:setup
```

## Cloudflare Notes

Cloudflare is possible, but this code is currently written for Next.js Node API routes. To deploy on Cloudflare Workers, expect to:

- add the OpenNext Cloudflare adapter,
- test `postgres` compatibility or switch database access strategy,
- re-check route runtime assumptions,
- re-test OAuth callback and encrypted cookie behavior,
- adapt deployment scripts to Wrangler.

For this MVP, Vercel is the lower-friction path.

## Files Created Or Edited

Created:

- `.env.example`
- `db/schema.sql`
- `scripts/setup-db.mjs`
- `public/manifest.webmanifest`
- `public/sw.js`
- `public/icons/icon.svg`
- `src/components/app-shell.tsx`
- `src/components/pwa-register.tsx`
- `src/lib/*`
- all `src/app/api/*/route.ts` routes listed in the folder structure

Edited:

- `package.json`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/globals.css`
- `README.md`

## Verification

Run:

```powershell
npm run lint
npm run build
```

Current status:

- Lint passes.
- Production build passes.
- `npm audit --omit=dev` reports a moderate PostCSS advisory inside the current Next.js dependency tree. The suggested automatic fix would downgrade Next.js, so do not run `npm audit fix --force` for this project unless you intentionally plan a framework version change.
