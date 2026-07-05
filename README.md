# Pickup Sports App

Map-first pickup-sports meetup app (pickleball first). See [PLAN.md](./PLAN.md) for the full product & technical plan.

## Layout

| Path | What |
|---|---|
| `apps/mobile` | Expo (React Native, TypeScript) app — map, events, chat |
| `apps/web` | Astro static site — marketing + compliance pages |
| `apps/worker` | Hono Cloudflare Worker — `/e/:eventId` OG pages + `/admin` moderation queue |
| `packages/shared` | Shared TypeScript types + zod schemas |
| `supabase` | Database migrations (PostGIS schema, RLS, RPCs) |

## Prereqs

- Node ≥ 22, pnpm ≥ 11 (`npm i -g pnpm`)
- Android Studio + a Google Play AVD for the dev loop (PLAN.md §9)
- Supabase CLI for local DB work (`pnpm dlx supabase`)

## Commands

```sh
pnpm install
pnpm dev          # turbo dev across workspaces
pnpm typecheck
pnpm --filter mobile start   # Expo dev server
```

## Environment

Copy `.env.example` files in each app and fill in Supabase / Stream / Stadia keys.
