# RCCG Victory Temple — Dynamic QR file sharing

Responsive React + TypeScript website. Upload PDFs/images, generate a QR code, and replace the underlying file using a secret management URL. No visitor login.

## How it works

- Public URL: `https://rccgvictorytemple.vercel.app/f/<uuid>` — always resolves to the **current** file.
- Private edit URL: `https://rccgvictorytemple.vercel.app/manage/<uuid>?token=<secret>` — can replace the file without changing the QR.
- Storage is a **private** Supabase bucket. Visitors receive temporary signed URLs. QR codes point to the stable `/f/<uuid>` page, not a signed URL.
- Management tokens are generated randomly and stored as SHA-256 hashes in the database. The secret is returned only once, on initial creation. Save it securely.

## Prerequisites

Node.js 20+, a Supabase project, a GitHub account, and a Vercel account.

## 1. Set up Supabase

1. Create a project at https://supabase.com/dashboard.
2. Open **SQL Editor**, paste and run `supabase/migrations/202610310001_create_files.sql`.
3. Install the Supabase CLI (see https://supabase.com/docs/guides/local-development/cli/getting-started).
4. Log in and link your project:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

5. Deploy the server function (it is public because visitors do not authenticate; it uses a private edit token for replacements):

   ```bash
   npx supabase functions deploy files --no-verify-jwt
   ```

   The function automatically uses Supabase-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side. **Never put the service-role key into Vercel frontend variables.**

6. From **Project Settings → API Keys**, obtain your Supabase project URL and the publishable key (or legacy anon key).

## 2. Run locally

```bash
npm install
cp .env.example .env.local
```

On Windows PowerShell use `Copy-Item .env.example .env.local`.

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Then run:

```bash
npm run dev
```

Open the localhost address displayed by Vite.

## 3. Deploy on Vercel

1. Create a new GitHub repository, e.g. `rccgvictorytemple`, and push the project files (do **not** commit `.env.local`).
2. Visit https://vercel.com/new and **Import Git Repository**.
3. Set **Project Name** to `rccgvictorytemple` (if available).
4. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
5. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the values from your Supabase project.
6. Click **Deploy**. Expected domain, subject to availability: `https://rccgvictorytemple.vercel.app`.
7. Test uploading a file, scanning the downloaded QR on a second device, and replacing the file through its private management link.

### Optional command-line deployment

```bash
npm install
npm run build
npx vercel login
npx vercel --prod
```

Set the same two environment variables in Vercel before production deployment.

## Important security and operational notes

- Uploads are limited to 10 MB, with an allowed MIME list and file-signature checks. Supabase storage is private; database RLS is enabled with no public table policies.
- **Before publicly advertising this service**, add abuse controls: IP-based rate limiting (e.g. Cloudflare Turnstile with server-side verification and an upload quota), CAPTCHA/bot protections, storage quotas and moderation/virus scanning. No-login public uploads can otherwise be abused and run up storage bills. The included starter does **not** implement these protections.
- There is **no automatic expiration**: records remain until removed by the administrator. Supabase/Vercel free-tier limits and project inactivity policies may affect availability. The QR is permanent as an identifier, not a guarantee of indefinite hosting.
- Treat the management URL as a password. Whoever has it can replace the file. If lost, the starter has no self-service recovery. Don't include private edit URLs in public QR codes.
- Supabase Edge Functions have request/body/runtime limits. This starter sends base64 through the function, so large uploads near 10 MB should be tested on your plan. For heavier usage, switch to authenticated short-lived signed upload URLs issued by the Edge Function.
- PDF content is opened through Supabase signed URLs. Browser behavior determines whether it previews or downloads.
- The file view page provides a new signed URL on each load, avoiding stale QR targets.

## Files

- `src/App.tsx`: user interface, QR generation and upload flow.
- `src/style.css`: responsive design.
- `supabase/functions/files/index.ts`: secure create/view/manage/replace API.
- `supabase/migrations/...sql`: database table and private storage bucket.
- `vercel.json`: SPA route rewrites.
