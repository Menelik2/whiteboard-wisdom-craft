# Vercel Deployment Guide for TanStack Start

## Overview
This project is configured to deploy on Vercel with TanStack Start SSR support and Vercel preset.

## Prerequisites
- Node.js 18+ or Bun runtime
- Vercel account
- GitHub repository connected to Vercel

## Deployment Steps

### 1. Set Environment Variables in Vercel Dashboard

Go to your Vercel project settings and add these environment variables:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_SUPABASE_PROJECT_ID=your_project_id
NODE_ENV=production
```

### 2. Build Output Structure

The build process creates:
- `.output/public/` - Static assets (HTML, CSS, JS)
- `.output/server/` - Nitro/H3 server runtime
- `.output/server/index.mjs` - ESM server entry point

### 3. Vercel Configuration

The `vercel.json` file is configured with:
- **outputDirectory**: `.output/public` (static assets)
- **framework**: `other` (manual control)
- **buildCommand**: `bun run build` (uses Bun for faster builds)
- **rewrites**: Routes to correct destinations
- **headers**: Security headers for all responses
- **Cache-Control**: Static assets cached permanently, with revalidation

### 4. Server-Side Rendering (SSR)

TanStack Start uses Nitro for SSR:
- Dynamic routes are handled by `.output/server`
- Static files are served from `.output/public`
- Environment variables prefixed with `VITE_` are injected at build time

### 5. Local Testing

```bash
# Build locally
bun run build

# Preview the build
bun run preview

# Or start the server directly
node .output/server/index.mjs
```

### 6. Security Features

- **X-Content-Type-Options**: nosniff
- **X-Frame-Options**: DENY (prevents clickjacking)
- **X-XSS-Protection**: 1; mode=block
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Permissions-Policy**: Disables camera, microphone, geolocation

### 7. Troubleshooting

#### Build fails with module errors
- Ensure `bun.lock` is committed
- Check Node version compatibility
- Run `bun install` locally first

#### 404 errors on routes
- Check `rewrites` in `vercel.json`
- Verify `.output/public` contains built assets
- Check server logs in Vercel dashboard

#### Environment variables not loading
- Verify variable names in Vercel dashboard match `.env` file
- Remember to use `VITE_` prefix for client-accessible variables
- Redeploy after adding new variables

### 8. Performance Optimization

- Static assets are cached at edge (31536000 seconds = 1 year)
- Dynamic content uses stale-while-revalidate
- Vercel automatically compresses responses
- Regional deployment in San Francisco (sfo1)

## Additional Resources

- [TanStack Start Docs](https://tanstack.com/start)
- [Vercel Docs](https://vercel.com/docs)
- [Nitro Documentation](https://nitro.unjs.io/)
- [Supabase Setup](https://supabase.com/docs)
