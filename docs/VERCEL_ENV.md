# Vercel environment variable checklist

Set every variable below in **Vercel → Project → Settings → Environment Variables**
for the `Production`, `Preview`, and `Development` environments (unless noted).

> Rule of thumb: `VITE_*` variables are inlined into the browser bundle and must be
> publishable. Everything without the `VITE_` prefix is server-only and must never be
> referenced from client components.

## 1. Supabase — client-visible (browser bundle)

| Variable | Example / shape | Where it is used |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | `src/integrations/supabase/client.ts` — browser Supabase client used by components, hooks and realtime. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJhbGciOi...` (anon/publishable key) | Same browser client; authenticates anonymous + signed-in requests under RLS. |
| `VITE_SUPABASE_PROJECT_ID` | `pgelbkqvifkacbnzzmmv` | Project reference used by generated integration helpers/types. |

## 2. Supabase — server-only

| Variable | Example / shape | Where it is used |
| --- | --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | SSR fallback for the Supabase client and the server publishable client inside server functions / `src/routes/api/*`. |
| `SUPABASE_PUBLISHABLE_KEY` | `eyJhbGciOi...` | Server publishable client (public reads) and `src/integrations/supabase/auth-middleware.ts`, which validates the request bearer token. |
| `SUPABASE_PROJECT_ID` | `pgelbkqvifkacbnzzmmv` | Server-side project reference. |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` / `sb_secret_...` | **Secret.** `src/integrations/supabase/client.server.ts` (`supabaseAdmin`) — bypasses RLS. Only add it if privileged server work is used. Never expose to the browser and never prefix with `VITE_`. |

## 3. Auth

| Variable | Example / shape | Where it is used |
| --- | --- | --- |
| `SUPABASE_JWT_SECRET` | opaque string | Only required if you verify Supabase JWTs manually; the auth middleware normally validates via Supabase. |
| Google provider client ID / secret | configured in Supabase Auth, **not** in Vercel | Google sign-in goes through the Supabase Auth provider config; no Vercel variable needed. |
| OAuth redirect URLs | `https://<your-domain>/`, `https://<your-domain>/auth/callback` | Add to Supabase Auth → URL configuration. `redirect_uri` passed from the client must be a same-origin public URL. |

Also set the Supabase **Site URL** to your production Vercel domain, and add every
preview domain pattern to **Additional redirect URLs**, otherwise sign-in bounces back.

## 4. App / AI

| Variable | Example / shape | Where it is used |
| --- | --- | --- |
| `LOVABLE_API_KEY` | secret | `src/routes/api/generate-whiteboard.ts` and `src/routes/api/summarize.ts` — authenticates AI Gateway calls for image generation and document summarisation. Required, server-only. |

## 5. GitHub Actions secrets (for the CI workflow)

`.github/workflows/ci.yml` expects these repository secrets:

- `VERCEL_TOKEN` — Vercel account token (Account Settings → Tokens)
- `VERCEL_ORG_ID` — from `.vercel/project.json` after `vercel link`
- `VERCEL_PROJECT_ID` — same file
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`
- `LOVABLE_API_KEY`

## 6. Verification

```bash
npm run test           # unit tests
npm run validate:build # typecheck + both server entries + production build
```

Both run automatically in CI before any deployment step.
