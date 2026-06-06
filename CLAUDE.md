# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TransWordly (internal package name `translingua_temp`, README title "TransLingua") — an AI-powered document translation, document Q&A, and study-notes web app. UI and code comments are in **Turkish**; match that language when adding user-facing strings and inline docs.

## Commands

```bash
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # tsc -b && vite build  (type-check is part of the build)
npm run lint       # eslint .
npm run preview    # serve the production build
```

- Node `>=22.12.0` required.
- **There is no test runner configured.** "Verify" means `npm run build` (type-check) + `npm run lint`, plus manual in-app testing.
- TypeScript is strict-ish: `noUnusedLocals`/`noUnusedParameters` are on, so unused imports/vars break the build.

## Critical operational constraints

These are non-obvious and have caused problems before:

- **The live Supabase DB is hand-managed and has drifted from the repo.** `supabase/migrations/` is stale. Do **NOT** run `supabase db push`. New schema changes are written as dated files in `supabase/manual/*.sql` and applied to prod manually (often already applied — check before re-running, the SQL is generally idempotent-aware but verify).
- **Edge Functions are deployed manually by the user**, not by automation. After editing anything in `supabase/functions/`, the change is inert until the user runs `supabase functions deploy <name>`. Auto-mode deploys have failed here — surface the deploy command, don't assume it ran.
- Commits/pushes are done by the user unless explicitly asked. Don't push.

## Architecture

### App shell (`src/App.tsx`)
Provider nesting order matters: `ErrorBoundary > BrowserRouter > ThemeProvider > AuthProvider > CartProvider > TranslationProvider`. All page routes are `React.lazy` + `Suspense`. `ProtectedRoute` gates on auth; `AdminRoute` additionally requires `profile.role === 'admin'`. `checkEnv()` short-circuits to `EnvErrorPage` when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing.

### AI layer — everything routes through the proxy
- **`src/lib/ai.ts`** is the only client-side AI module. It never holds an API key. All Gemini calls go to the Supabase Edge Function **`ai-proxy`** (`supabase/functions/ai-proxy/index.ts`), which holds `AI_API_KEY` server-side and proxies to Google's Generative Language API.
- Only model in use is **`gemini-3.1-flash-lite`**. `MODEL_PRO` is deliberately aliased to Flash-Lite for cost; the proxy enforces a `MODEL_WHITELIST`. Default `thinkingLevel` is `'minimal'` (Gemini 3.x) — changing this risks empty `MAX_TOKENS` responses.
- Streaming uses SSE with a non-streaming fallback (`streamOrFallback`) because QUIC/HTTP3 connections drop on long streams. Network errors (TypeError from fetch) are retried; user aborts and SAFETY/RECITATION filter errors are never retried.
- PDF translation auto-selects a mode: small/image-heavy PDFs go multimodal (file sent directly to Gemini); large/text-heavy PDFs are chunked (`CHUNK_SIZE`, `CONCURRENCY=4` parallel workers). There's also a page-image vision path for in-figure text.

### Credit system — server-authoritative, do not bypass
Credits are enforced on the server; the client cannot spend AI without paying. The flow:
1. Client calls `begin_ai_operation` RPC → returns an `operationId` (credits debited atomically, with a call budget).
2. Every `ai-proxy` request must carry that `operationId`; the proxy calls `claim_ai_call` (service-role) to atomically consume one call from the budget. No token / expired / exhausted → Gemini is never called (HTTP 402).
3. On failure the client calls `refund_ai_operation` (only refunds if no AI call was actually made).

- **Always go through `src/lib/aiOperation.ts` (primitives) and the `useAiOperation` hook (`src/hooks/useAiOperation.ts`).** Never inline `supabase.rpc('begin_ai_operation')` in a page or component.
- Credit **costs** are read live from the `app_config` table (`category = 'credit_cost'`, admin-managed) via `src/lib/creditConfig.ts`. The constants in `src/lib/constants.ts` (`CREDIT_COSTS`) are fail-safe fallbacks only — they are display/amount values, never the source of truth for actual deduction.

### Auth & profiles (`src/context/AuthContext.tsx`)
Wraps Supabase Auth. Loads a `profiles` row into `profile`; self-heals a missing profile by inserting one. Enforces bans in the UI (`isBanActive` on `banned_until` → sign out), but server-side `begin_ai_operation` is the real ban gate. `isAdmin` derives from `profile.role`.

### Feature/tools registry
`src/lib/upcomingFeatures.ts` is the **single source of truth** for tool metadata (ready vs. under-construction). `src/lib/navItems.ts` derives navbar links from it; the navbar middle row is user-pinnable favorites (see `useToolPrefs`). Under-construction routes render `UnderConstructionPage` with a `slug`. Don't duplicate tool metadata elsewhere.

### Other Edge Functions
- `paytr-init` / `paytr-callback` — PayTR payment integration.
- `shared-access` — public document sharing (deployed with `--no-verify-jwt`; all control responses return HTTP 200 so the client doesn't treat non-2xx as a hard error).

### Database
Tables (RLS-protected, owner-scoped): `profiles`, `documents`, `translations`, `chat_messages`, `credit_transactions`, `study_sessions`, `study_sources`, plus `app_config`. Private storage buckets: `originals`, `study-sources`. Admin checks use `app_private.is_admin()`.

## Environment variables

Frontend (`.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Never put the AI key in a `VITE_` var — it lives only in Edge Function secrets (`AI_API_KEY`, `AI_BASE_URL`, `ALLOWED_ORIGIN`, service-role key).
