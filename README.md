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

This is a monorepo — the mobile app, the marketing website, the backend worker, and the shared code all live in this one repository (see the [Layout](#layout) table above). `pnpm` is the tool that manages that repo, and `turbo` is what lets one command act on every part of it at once. Here is what each command actually does, in plain terms:

### `pnpm install`

Downloads and sets up every third-party building block the project depends on (the map library, the database client, React Native, and ~1,000 others). Think of it as unpacking all the pre-made parts before you can assemble the furniture. You run it once after cloning the project, and again whenever those parts change. Nothing about the app runs yet — this just gets the workbench stocked.

### `pnpm dev`

Starts the app running locally on your own machine so you can see and click through your changes live. As you edit code, the screen updates almost instantly — no waiting for a "build." The `turbo` part means it starts **all** parts of the project at the same time (mobile app, website, backend) with one command, and it's smart enough to skip anything that hasn't changed. This is the command you leave running all day while building.

### `pnpm typecheck`

A safety inspection that reads the code and flags mismatches *before* anyone runs the app — for example, code that expects an event's date but is accidentally handed its name. ("Types" are the rules about what shape each piece of data should be.) It doesn't change anything or launch anything; it just reports problems. Catching these here is far cheaper than discovering them as a crash in a user's hands, which is why it runs automatically on every code change submitted for review.

### `pnpm --filter mobile start`

Same idea as `pnpm dev`, but narrowed to **just the mobile app** instead of the whole project. `--filter mobile` is the "only do this one piece" instruction, and `start` launches Expo — the tool that runs the phone app. It opens a control panel (with a QR code) so you can load the app onto a real phone or a simulated one to test it. Use this when you only care about the phone experience and don't need the website or backend running too.

## Environment

Copy `.env.example` files in each app and fill in Supabase / Stream / Stadia keys.
