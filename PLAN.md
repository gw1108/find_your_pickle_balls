# Pickup Sports App — Product & Technical Plan

*Prepared 2026-07-04. Modeled on [Nomad Table](https://nomadtable.app/); first iteration targets pickleball, basketball, running, and tennis meetups on a live map. All load-bearing facts below were researched against July-2026 primary sources and adversarially fact-checked (40 of 43 critical claims confirmed; the 3 corrections are incorporated).*

*Revised 2026-07-06: chat pivoted from Stream Chat (Maker plan) to an MVP-scoped build on Supabase Realtime after Stream's Maker signup rejected free-email domains — see §5 for the new plan and the schedule cost.*

---

## 1. Key decisions at a glance

| Question | Decision | Why (short) |
|---|---|---|
| "Flutter or Go?" | **Both layers needed — they're not alternatives.** Flutter/React Native = frontend frameworks; Go/Rust = backend languages. | Category clarification — see §4. |
| Mobile frontend | **React Native + Expo (SDK 57, RN 0.86, TypeScript)** | Only stack with a complete iOS story from a Windows PC (EAS cloud build/sign/submit, no Mac ever). DOM web output for SEO. Largest AI-codegen + hiring pool. |
| Backend | **Supabase** (Postgres + PostGIS + Auth + Realtime + Storage + Edge Functions) | $0 dev / ~$25–45/mo prod. PostGIS = exact "events near me" in one SQL call. Not Go/Rust at MVP (see §4.2). |
| Go | Adopt **later, only if needed** (~50–100k MAU) for hot paths (chat gateway, feed fanout). Already installed on this machine. | Schema carries over; Supabase remains the system of record. |
| Rust | **No** for this product's foreseeable lifecycle. | Velocity tax on a 1–2 person team; no CPU-bound workload in sight. |
| Chat | **Build MVP-scoped chat on Supabase Realtime** (`channels`/`messages` tables + Broadcast, RLS-gated — §5). Pivoted 2026-07-06 from Stream's Maker plan, whose signup rejects free-email domains. | Zero new vendors, $0 — reuses the backend we already run, and Supabase Pro's 500-concurrent soft quota beats Maker's 100-concurrent hard cap. Cost is time, not money: est. 3–5 dev-weeks by cutting scope (no offline sync/read receipts at MVP), roadmap slips ~2 wks (§12). Buy option (Stream Start $399/mo) stays open if polish eats map runway. |
| Maps | **MapLibre Native** (`maplibre-react-native`) + **Stadia Maps Starter ($20/mo) at launch**; migrate tiles to self-hosted Protomaps PMTiles on Cloudflare R2 (~$0–5/mo) when tile cost matters | $0 SDK, no MAU cliff. Stadia first = zero tile-pipeline work at MVP; swapping tile source later is a one-line style-URL change, whereas swapping map SDKs is a rewrite of the core screen. Fallback for max speed: `react-native-maps` + Google's now-unlimited-free mobile SDK. |
| Instagram | **Optional, connect-later profile add-on — users can attach an IG handle to their profile any time after signup. NOT OAuth, never required at onboarding.** Consumer "Log in with Instagram" no longer exists (API killed Dec 4 2024). | See §3. No-OAuth is a hard external constraint; keeping the handle out of the signup path is our decision — it protects the sub-10-second join wedge, and research found a required field adds friction without verifiability. |
| Auth | **Sign in with Apple + Google via Supabase Auth** (phone/OTP optional later) | What Nomad Table actually does. Apple Guideline 4.8 requires Sign in with Apple alongside any Google login. |
| Website | **Static site (Astro) served as Cloudflare Workers static assets** (marketing + `/delete-account` + policies) **+ one small Hono Worker** for server-rendered `/e/[eventId]` OG pages and the admin moderation page | The site is 90% static pages + one dynamic route — a full Next.js/OpenNext deployment is over-built for that (Nomad Table ships one static HTML file). Per-event OG invite pages still beat Nomad Table. Cloudflare free tier suffices. Adopt Next.js later only if the site grows into a content/SEO play. |
| Deep links | **Self-hosted** AASA + assetlinks.json + Smart App Banner + Play Install Referrer. No Branch ($199–499+/mo). | Copy Nomad Table's approach; Firebase Dynamic Links is dead (Aug 2025). |
| Entity | **Form an LLC ~9 weeks before launch**; org accounts on both stores | Skips Google's 12-tester/14-day gate; keeps personal name/address off stores; same entity later satisfies Meta Business Verification for IG embeds. |
| Age / region | **18+ gate, US-only at launch** | Meetup precedent; sidesteps COPPA and EU DSA trader publication; Texas app-store age law is live — consume Apple/Google age-signal APIs. |
| First sport / market | **Pickleball-first, one sunbelt metro (Austin or Phoenix), basketball second** | 24.3M US players +22.8% YoY; proven scheduling demand (Playtime Scheduler: 530k players on a dated web tool); GoodRec charges $10–25/game → "free, one-tap join" is open positioning. |
| Live court occupancy | **Yes — opt-in, geofenced check-ins render live "who's playing right now" state on venue pins** (§6.1) | No competitor answers "is anyone there *now*?" Serves walk-up culture (fixes the basketball wedge), fills the map without manufactured events, and the historical popularity data becomes a proprietary moat. ~Free on the existing stack. |
| Can AI agents play Nomad Table on this PC? | **Android: YES, locally** (emulator + Play Store image + mobile-mcp/Maestro MCP). **iOS: not locally on Windows** — BrowserStack App Live is the one cloud option for public App Store apps. | See §9 for the exact setup; this machine is capable. |
| How is our own app developed/tested? | **Agentic dev + E2E testing is Android-only** (the §9 emulator rig is the daily driver). **iOS is a separate track:** EAS cloud builds at milestones → TestFlight on a physical iPhone → human checklist. | See §9.1 — agents never drive iOS; iOS bugs batch to milestone boundaries. |

**Running cost at MVP scale (<10k users):** ~$0 during development; ~$25–70/month in production + $99/yr Apple + $25 one-time Google Play + LLC/registered agent + optional ~$500/yr general liability insurance.

---

## 2. Product definition (from the Nomad Table teardown)

Nomad Table ("nomadtable: travel friends", solo founder Jay Raavi, launched Nov 2024): 1M+ downloads, ~$65k/mo revenue by early 2026, iOS 4.7★ (17k ratings), Android 4.4★ (72k reviews). Stack (verified via compiled-binary SDK analysis): **React Native + Expo, Firebase (Auth/DB/Functions/Storage/FCM), Stream Chat, RevenueCat, OpenAI (suggestions + moderation), AWS Rekognition (selfie verification), Realm, AppsFlyer**. Website is a single hand-coded static HTML page behind Cloudflare with self-hosted universal links.

### Core loop to copy
1. **Home = map of activities** (list-view toggle). Cards: emoji, title, host name/photo, time, attendee count, stacked avatars ("+12 going").
2. **One-tap "I'm interested"** — no host approval — instantly joins the event **group chat** and reveals who's going. Open-app → in-the-chat in under 10 seconds.
3. Profiles are light: name, age, sports, photos, IG handle.

### Sports-specific adaptations (our differentiators vs. their "women-only filter" insight)
- **Skill-level filters** (pickleball DUPR-style 3.0/3.5/4.0+) — table stakes, must exist.
- **Player-count caps + "need N more"** ("need 2 more for doubles") — fits pickup sports perfectly.
- **Recurring event templates** for organizers (weekly run club, Tuesday open play) — targets Meetup organizers fleeing price hikes.
- **Venue-anchored events** — events attach to a court/park from our venue layer (§6).
- **Live court occupancy** (§6.1) — venue pins show who's checked in *right now*, courts open vs. full, skill mix, and an estimated wait. Nomad Table has nothing like it; neither does any sports competitor. This is the headline differentiator layered on top of the copied core loop.

### What to avoid (their 1-star review clusters)
- **Performance**: "every action takes minutes" — budget real time for list virtualization, image thumbnails, optimistic UI.
- **Ghost notification badges** that never clear; wrong-direction navigation animations.
- **Opaque moderation**: auto-bans with no stated reason and no appeal path. Always show reason + human appeal route.
- **Safety culture**: ship block/report + safety controls at launch, not after the first bad reviews.

### Monetization roadmap (validated by them at ~$65k/mo solo; defer 6–12 months)
- Keep join/create/chat **free forever** (this is also our wedge vs. GoodRec's $10–25/game).
- Later: consumer subscription (~$15/mo / ~$70/yr via RevenueCat) gating discovery extras — full nearby-players list, who-viewed-you, boosts, unlimited AI suggestions.
- Then: self-serve **sponsored map pins** for courts/clubs/leagues/gear shops (their ads portal: $49–$500+/mo by city tier, Stripe-billed) — maps one-to-one onto local sports facilities.

---

## 3. Instagram — an optional, connect-later integration (reality check)

**You cannot build "Log in with Instagram."** Verified against Meta primary sources:

- Meta shut down the **Instagram Basic Display API on Dec 4, 2024** — their announcement: after this date "there will no longer be a set of Instagram APIs for consumer developer apps." Tinder, Hinge, Discord, Day One all lost IG integrations then; none has them back.
- The two replacement APIs ("Instagram API with Instagram Login" / "with Facebook Login") authenticate **only professional (business/creator) accounts**, with business-only scopes. Meta docs verbatim: the Facebook-Login variant "cannot access Instagram consumer accounts."
- Even Nomad Table — the model app — **does not use Instagram at all**: signup is Apple/Google only (per their ToS + binary analysis: no Meta SDK present).
- Apple **Guideline 4.8** would additionally reject an Instagram-only login design (equivalent-privacy login required alongside any third-party login).

**Implementation (the 2025–26 industry pattern, minus the gate):**
1. Auth = **Sign in with Apple + Google** (Supabase Auth).
2. **Instagram is an optional, connect-later profile add-on — it is never asked for during signup.** Onboarding stays IG-free to protect the sub-10-second open-app-to-in-the-chat flow. Profile edit (plus a low-key post-signup "complete your profile" nudge) offers an "Add your Instagram" field: format-validated, deduped across users, rendered as a "View on Instagram" deep link on profiles. Users who connect it get social proof and accountability signal; nothing in the app is gated on having it.
3. Optional verification (later): one-time code the user places in their IG bio, checked during beta. **Do not** build "DM a code" (messaging scopes are business-only) and **do not** scrape IG (ToS violation, ban risk).
4. Richer IG embeds on profiles (later): apply for Meta's App-Review-gated **oEmbed Read** feature (1,000 req/hr, public accounts, display-only) — requires **Meta Business Verification**, which requires the LLC (§10).
5. Trust/anti-catfish: **selfie verification** (AWS Rekognition or Persona) as the trust badge. Note: Nomad Table's terms make biometric-selfie consent an account *eligibility condition* (not optional) and reserve the right to run background/sex-offender screenings — copy their explicit biometric-consent language (BIPA exposure).

**Decision (July 2026): Instagram is optional social proof, not vetting and not a gate.** Every research angle independently concluded a *required* handle adds signup friction without verifiability (one Nomad Table 5-star review even praises the app for *replacing* "the awkward Instagram DM"), so the handle is something users connect to their profile later, whenever they like. If beta data shows IG-linked profiles get materially more joins, strengthen the nudge (e.g. a "linked" profile badge) — never reintroduce the requirement.

---

## 4. Stack evaluation

### 4.1 The category clarification
**Flutter vs. Go is not a choice** — you need both layers regardless:
- **Frontend (the mobile app UI):** Flutter, React Native, Kotlin Multiplatform, or native Swift/Kotlin.
- **Backend (API/data):** Go, Rust, TypeScript/Node, or a Backend-as-a-Service (Supabase/Firebase/Convex).

### 4.2 Mobile frontend (developer machine = Windows 11 — this dominates the decision)

| | React Native + Expo ✅ | Flutter | Kotlin/Compose Multiplatform | Native Swift+Kotlin |
|---|---|---|---|---|
| Current state (7/2026) | RN 0.86, Expo SDK 57, New-Arch only | 3.44, Impeller-only iOS, Wasm web coming | CMP 1.11, iOS stable since 5/2025 | — |
| **iOS from Windows** | **Full: EAS Build+Submit, zero Mac ever** (15 free iOS builds/mo; Starter $19/mo) | Build via cloud CI only (Codemagic 500 free M2 min/mo); **no local iOS debug** | **Officially requires a macOS host** — disqualified | Swift impossible on Windows |
| Maps | react-native-maps, @rnmapbox/maps, **maplibre-react-native**; expo-maps still alpha | Tidiest first-party story (google_maps_flutter, mapbox, maplibre, flutter_map) | **No first-party cross-platform map** — hand-rolled interop | Best, at 2× cost |
| Web output | **Real DOM** (react-native-web) → SEO-able | Canvas → poor SEO (official docs say not for content sites) | Canvas, Beta | n/a |
| Social-app ecosystem | Strongest: expo-auth-session, Expo Router universal links, expo-notifications + free push | Close second (FlutterFire) | Weakest | Best |
| AI-codegen / hiring | **Largest corpus by far (TS/React)** | Second (+ official Dart MCP server) | Distant third | Split |

**Winner: React Native + Expo.** Flutter is a legitimate second (best raw rendering, cleanest map plugins) but every iOS build/debug cycle from Windows goes through cloud CI, its web output can't serve SEO event pages, and Dart's AI/hiring pool is smaller. Choose Flutter only if you already know Dart. KMP and native are non-starters on Windows.

### 4.3 Backend: Go vs Rust vs TypeScript vs BaaS

- **Go** — excellent runtime, mature frameworks (chi/echo/fiber), single-binary deploys… and none of it ships auth, realtime, storage, or push. You'd hand-build what Supabase gives you on day one. **Verdict: the right *second* language.** Adopt when extracting hot paths (WebSocket chat gateway, geo-matching/feed-fanout workers) at ~50–100k MAU or when Realtime limits/egress bite. Go is already installed on this machine.
- **Rust** — axum is the 2026 community default; actix only ~1–15% faster in benchmarks. Compile times + learning curve are a pure velocity tax for a social CRUD app. **Verdict: effectively never for this product**, unless a CPU-bound workload appears (media processing, ML ranking).
- **TypeScript/Node** — the strongest "own backend" option (Hono + tRPC v11 for end-to-end types with the RN app; NestJS is enterprise-weight). **Verdict: the escape hatch** — add a thin Hono+tRPC service only when logic outgrows PostgREST/Edge Functions.
- **BaaS — Supabase wins:**
  - **Supabase**: Postgres + **PostGIS** (officially documented KNN `<->` + `ST_DWithin` patterns), Auth (100k MAU on Pro), Realtime (load-tested at 250k concurrent), Storage, Edge Functions. Free tier covers all of dev; **Pro $25/mo** (verified: 8GB DB, 100k MAU, 250GB egress, 500 realtime conns/5M msgs, 2M function invocations).
  - **Firebase** (Nomad Table's choice): fine, but correction from fact-check — Firestore *did* gain native geo queries (April 2026 Pipelines `geoDistance()`), **but only in Enterprise edition, in preview**; Standard still requires the geohash workaround. Relational events/RSVPs/venues fit SQL+RLS better anyway.
  - **Convex**: best realtime DX, but its geospatial index is officially **Beta** — wrong risk when the map *is* the product.
  - **PocketBase**: pre-1.0, SQLite, single-server — prototype-only.

### 4.4 Reconciled architecture (one road, no contradictions)

```
Mobile app (Expo SDK 57 / RN 0.86 / TypeScript)
 ├─ Map: maplibre-react-native ← Stadia tiles at launch (→ self-hosted PMTiles on R2 later)
 ├─ Auth: Supabase Auth (Sign in with Apple + Google)
 ├─ Chat: Supabase Realtime chat (§5) — channels/messages tables, Broadcast delivery,
 │        event channel auto-created on join
 ├─ Live UI: Supabase Realtime — new pins appear, attendee counts / "need N more" tick live,
 │           venue pins flip live-occupancy state as check-ins arrive/expire (§6.1)
 ├─ Push: Expo Push (free, wraps FCM+APNs) ← triggered by Supabase Edge Functions / DB webhooks
 └─ OTA updates: EAS Update

Supabase (source of truth — also the scheduler and queue)
 ├─ Postgres + PostGIS: users, profiles(ig_handle nullable — optional connect-later, §3), venues, events(geography Point, GiST), rsvps,
 │                      checkins(venue_id, user_id, sport, expires_at), reports, blocks,
 │                      channels, channel_members(last_read_at), messages (§5)
 ├─ RLS everywhere; block = mutual invisibility enforced in RLS (applies to check-in visibility too)
 ├─ RPC: events_near(lat, lng, radius, sport, skill) via ST_DWithin / KNN; venue_occupancy(venue_id)
 ├─ Realtime: postgres_changes on events/rsvps/checkins for the live-map features above;
 │            Broadcast-from-Database (trigger → realtime.broadcast_changes) for chat delivery (§5)
 ├─ pg_cron + pgmq: event reminders, moderation-SLA timers, RSVP/push fanout queues, check-in TTL expiry — no external scheduler
 ├─ Storage: profile + event photos
 └─ Edge Functions: push dispatch, moderation queue, account deletion cascade

Website (static Astro site as Workers static assets + one Hono Worker)
 ├─ Marketing + compliance pages (static): /delete-account (Google Play requirement), privacy, terms, guidelines
 ├─ Hono Worker: /e/[eventId] — server-rendered per-event OG pages from a Supabase query
 │  (Nomad Table doesn't do this; our invite links unfurl properly) + /admin moderation queue page
 └─ /.well-known/apple-app-site-association + assetlinks.json (self-hosted universal links)
    + apple-itunes-app Smart App Banner; Play Install Referrer for Android deferred deep links
```

Everything — including chat — now lives in Supabase. The channels/messages tables are keyed by our own event/user ids with no vendor concepts baked in, so if chat is ever bought later (§5 pressure valve), only those tables migrate out.

---

## 5. Chat: build MVP-scoped on Supabase Realtime (pivoted 2026-07-06)

**What changed.** The original decision was "buy, don't build" via Stream's free Maker plan (2,000 MAU / 100 peak concurrent, hard caps). At signup time Stream's Maker program rejected our email — *free email domains are not accepted* — and the Maker page warns "availability is limited." Rather than buy the project domain early and re-apply for a hard-capped third-party dependency, chat moves onto the backend we already run: **an MVP-scoped chat built on Supabase Realtime.** New vendors: zero. New accounts: zero. Infra cost: $0 in dev; inside the already-budgeted Pro plan quota in production.

**Scope honesty — this works only because we cut scope.** The original research costed *full table-stakes parity* (offline sync, read receipts, typing, attachments, polished badge logic) at an honest **10–14 dev-weeks**; that estimate still stands and we are **not** signing up for it. We ship a deliberately minimal chat and defer the rest:

| In MVP (est. 3–5 dev-weeks total, absorbed into Phases 1–2) | Deferred until users ask |
|---|---|
| `channels` / `channel_members` / `messages` tables; event channel auto-created on first join | Offline outbox (MVP is online-only; history cached read-only) |
| RLS: only attendees read/write an event channel; block = mutual invisibility (same RLS pattern as events) | Read receipts |
| Delivery via **Broadcast-from-Database** (postgres trigger → `realtime.broadcast_changes` — Supabase's documented chat pattern) | Typing indicators (cheap later via Broadcast) |
| Unread counts from `channel_members.last_read_at`; app-icon badge hygiene (a top Nomad-Table complaint) | Attachments beyond photos; reactions |
| Photo messages via Supabase Storage (bucket + RLS already planned) | Message editing/deletion UX beyond a simple delete |
| Push through the existing Expo Push + Edge Function pipeline, deep-linking into the thread | Multi-device read-state sync |
| Keyset pagination on `created_at` + FlashList virtualization | |

- **UI:** Supabase's official realtime-chat UI component is React/Next.js — web-only, so it's *reference code*, not a dependency (its channel/broadcast wiring is liftable for the §7 admin page if chat visibility is ever wanted there). The RN thread screen starts as `react-native-gifted-chat` (MIT) for speed; if its aging internals fight the New Architecture, swap to a custom FlashList thread — budget for that swap, don't pre-build it.
- **Capacity (already verified in §4.3):** Supabase Pro ($25/mo, already budgeted) includes **500 concurrent Realtime connections and 5M messages/mo** — 5× the concurrent ceiling that was the binding constraint on Stream Maker, and it's a soft, upgradable quota rather than a hard cap that refuses connections at Saturday-morning peak. The same lazy-connect discipline still applies (subscribe when a chat surface opens, unsubscribe on background) because Realtime connections are shared with the live-map features (§6.1).
- **Moderation is now fully in-house (§8):** message reports land in the same Supabase moderation queue; the event-title keyword filter runs on messages too; if that proves too weak, OpenAI's moderation endpoint is free. This replaces Stream's AI-moderation credit — the cost is review-queue volume, not dollars.
- **Schedule impact (§12):** Phase 1 grows ~1 week (channel + message basics behind the one-tap join), Phase 2 grows ~1–2 weeks (DMs, unread/badges, push deep-links, moderation hooks). **Net: MVP slips ~2–3 weeks.** That is the one-time price of the pivot; it buys out the 2,000-MAU/100-concurrent cliff, the Maker-availability risk, the custom-domain-email prerequisite, and the future migration §4.4 was already hedging against.
- **The buy option stays open.** The Nomad Table lesson — they use Stream and *still* get chat complaints — cuts both ways: the pain lives in integration polish either way. If chat polish starts eating the map runway (the actual differentiator), Stream Start at $399/mo (10k MAU / 500 concurrent, soft overages) is the pressure valve, and the SaaS field re-ranks then (Sendbird $349/mo, TalkJS $569/mo for RN, Ably/PubNub primitives-only — all worse as of July 2026). The schema keeps that door open: channels/messages are keyed by our own event/user ids, no vendor concepts baked in.

---

## 6. Maps, geo, and the venue layer

- **Rendering** (all verified): Google's *mobile* Maps SDK is now **unlimited & free** (the $200 credit died March 1 2025; per-SKU allowances now, mobile Dynamic Maps listed "Unlimited"). Mapbox mobile: 25k MAU free. **MapLibre: $0 forever, any tile source** — chosen for zero lock-in and web parity. Verified July 2026: `maplibre-react-native` **v11 (released ~May 2026) is New-Architecture-only** — matches Expo SDK 57 / RN 0.86 exactly; it is **not Expo Go-compatible**, so use a dev build (the Android rig, §9.1, produces one anyway). It's a young major release: give it the same 1-day pin-and-verify spike as Stream before committing the core screen.
- **Tiles**: **Stadia Maps Starter ($20/mo commercial) at launch** — zero tile-pipeline work; migrating later to self-hosted Protomaps PMTiles on Cloudflare R2 (~$0–5/mo, zero egress) is a one-line style-URL swap once tile spend justifies owning the build/update pipeline. Note: MapTiler and Stadia **free tiers are non-commercial only**. (Don't host PMTiles on Supabase Storage: tiles are egress-heavy and Pro caps egress at 250GB; R2 egress is free.)
- **Avoid per-call venue APIs**: Google Places Text/Nearby Search is $32–35/1,000 after tiny free tiers, with ToS limits on storing results. Foursquare's API free tier collapsed June 2026 (500 calls/mo).
- **Venue layer (2–3 weeks, launch-metro scoped):** seed a PostGIS `venues` table from a one-time **OSM extract** (`leisure=pitch` + `sport=tennis|basketball|pickleball`) merged with **FSQ OS Places** (100M+ POIs, Apache 2.0, free download) → manually verify the top ~100 courts/parks in the launch metro → in-app **user submissions** fill the gap (OSM pickleball coverage is thin: ~29k objects globally; tennis 592k and basketball 338k are strong). Pickleheads' 25k-court database is the incumbent moat and has **no API** — we must own our venue data.
- **Server queries**: `geography(Point,4326)` + GiST + `ST_DWithin` / KNN — the map screen renders *our own data*, so $0 in per-query API fees regardless of scale.
- Geocoding (rare; events are pin-drops): Mapbox temporary geocoding 100k/mo free, or Stadia credits.

### 6.1 Live court occupancy — the "who's playing right now" layer

Every competitor answers "where can I play?" (Pickleheads' directory) or "when is a game scheduled?" (Playtime Scheduler, our own event pins). **Nobody answers the question pickup players actually ask before leaving the house: "is anyone there right now, and how long is the wait?"** This is the Waze-vs-paper-map gap, and it's open across the entire landscape.

**What it is:** venue pins on the map carry a live state — players currently checked in, courts open vs. full, average skill level present, and a rough wait estimate ("~2 game wait"). Signal sources, cheapest first:

1. **Geofenced opt-in check-in** — user arrives within ~75m of a venue in the `venues` table → one-tap prompt: "At Dove Springs — playing open play?" Check-ins auto-expire (2h TTL via pg_cron); manual check-out optional. No background location tracking — the geofence prompt fires from a foreground location read when the app opens, plus OS-level region-entry notifications where cheap.
2. **RSVP inference** — the events layer already knows 12 people are due at a court at 6pm; render that as expected occupancy for free.
3. **Historical popularity model (the moat)** — after a few months of check-ins, render Google-Popular-Times-style "usually busy Tue 6–8pm" bars per court from our own history. Pickleheads cannot copy this without an app people open daily; the data compounds and is proprietary. This is also the eventual seed for court-level sponsored placement (§2 monetization).

**Why it's load-bearing for this plan specifically:**
- **It fixes our own stated weak point.** §11 concedes basketball's walk-up culture makes it a hard first wedge — walk-up culture is exactly what live occupancy serves. It converts sport #2 from a liability into the headline demo. Pickleball open play (show up, stack paddles) is also fundamentally walk-up; scheduled events only cover half that market.
- **It solves the empty-map cold start.** The GTM plan hand-seeds 15–25 events/week so the map never looks empty; a presence layer makes the map show life with *zero* scheduled events — every check-in is content. Ambient activity is a cheaper liquidity engine than manufactured events.
- **It deepens the north-star metric.** Median time-to-first-join drops when users can join *courts*, not just events — "3 players at Mueller now" is a sub-10-second join with no host required.
- **It's nearly free on the chosen stack**: `checkins` table + PostGIS geofence check + Supabase Realtime (already streaming pin/RSVP updates) + one RLS policy + a pg_cron TTL sweep. No new vendors, no new infra line item. Est. 2–3 weeks (§12 Phase 2).

**Privacy rules (non-negotiable — this feature is a stalking vector if done carelessly):** opt-in only; presence always snapped to the venue centroid, never raw coordinates; auto-expiring; counts + skill mix shown by default, individual names visible only to mutuals or fellow attendees; blocked users mutually invisible via the same RLS pattern as events; check-in history never public. Precise location is CCPA-sensitive (§8) — these rules apply doubly here.

**Fast-follow (not MVP):** a lightweight **digital paddle-stack queue** for busy open-play courts — the physical paddle rack, in-app, attached to a venue's live state. Beloved, unsolved pain at packed pickleball venues, but it needs density at a specific court to matter; build it once occupancy proves out at the flagship courts.

## 7. Website (static Astro + one Hono Worker on Cloudflare)

Four jobs: marketing; **server-rendered `/e/[eventId]` pages with per-event Open Graph tags** (events are user-created — SSG can't do this); compliance pages (`/delete-account`, privacy, terms, guidelines); the admin moderation-queue page (§8).

That workload is 90% static pages plus two dynamic routes — a full Next.js 16 + OpenNext deployment was evaluated and rejected as over-built for it (two frameworks' worth of upgrade treadmill; Nomad Table ships a single static HTML file). Instead: **static Astro site served as Cloudflare Workers static assets** for marketing/compliance (planned as Pages, but Cloudflare steers new projects to Workers — shipped that way 2026-07-07, functionally identical here), plus **one small Hono Worker** that queries Supabase and renders the `/e/[eventId]` OG page and serves `/admin`. Simpler to debug, near-zero maintenance; adopt Next.js later only if the site grows into a content/SEO play. (Expo Router web SSR is still alpha, so the site stays a separate app either way — share types/zod schemas in the pnpm/Turborepo monorepo, don't share UI.)

Hosting: **Cloudflare free tier** (Workers: static asset requests free + 100k dynamic req/day, no egress fees). Vercel Hobby prohibits commercial use ($20/mo Pro otherwise); Netlify's 300-credit free cap rules it out.

Deep links: self-host AASA + assetlinks.json (exactly like Nomad Table), Smart App Banner meta tag, store-fallback page with OG tags; Play Install Referrer for Android deferred context. **Firebase Dynamic Links is dead** (Aug 2025); skip Branch (free tier gone, ~$199–499+/mo); add AppsFlyer Zero (free, 12k conversions, OneLink) only if iOS deferred deep linking proves to matter.

---

## 8. Compliance & safety (launch-blocking — build into the MVP)

**Moderation kit (Apple 1.2 + Google Play UGC — reviewers reject v1 social apps missing any):**
- Report event/user/photo/message → Supabase moderation queue, 24h review SLA
- Block user (mutual invisibility via RLS) — also required by both stores
- Content filter on event titles/descriptions **and chat messages** (keyword list + cheap image-moderation API; chat moderation is in-house post-pivot — same keyword filter, message reports into the same queue, OpenAI's free moderation endpoint if the keyword list proves weak — §5)
- EULA/community-guidelines acceptance at signup; support email visible in-app; admin queue page (route on the §7 Hono Worker, backed by the Supabase moderation tables)
- Show moderation reasons + appeal path (Nomad Table's #1 trust complaint)

**Accounts:** in-app account deletion (Apple 5.1.1(v)) + web `/delete-account` URL declared in Play Data Safety (enforced since May 2024). Demo account + live backend for Apple review (2.1). Sign in with Apple because Google login is offered (4.8).

**Age:** 18+ neutral DOB gate (Meetup precedent: all members 18+). Rate 18+ under Apple's new 4+/9+/13+/16+/18+ system. Sidesteps COPPA (amended rule fully in force Apr 2026). Texas's app-store age law is **in effect** (Fifth Circuit stayed the injunction May 2026; SCOTUS pending) — integrate **Apple Declared Age Range API** and **Google Play Age Signals API** behind a feature flag. No teen mode until the litigation settles (Utah slipped to 2027).

**Liability posture — platform, not organizer:** ToS with assumption-of-risk, waiver/release, "we do not screen users or organize/supervise events," limitation of liability, arbitration (Meetup/Skillshare templates). **Never charge for or host events at launch** (that moves us into sports-organizer insurance territory, ~$6.60–11/player/yr). LLC + ~$1M general liability (~$500/yr); defer E&O/cyber.

**Location privacy:** precise geolocation is CCPA "sensitive personal information" (CA AG ran a 2025 sweep). Fuzz event pins (snap to venue/park centroid) until RSVP; reveal exact court post-RSVP; never collect/display home locations; accurate Apple nutrition labels (Precise Location, linked, App Functionality only); never sell/share location. **Live check-ins (§6.1) get the strictest treatment:** opt-in, venue-snapped, auto-expiring, names gated to mutuals/attendees, block = mutual presence invisibility, no public check-in history.

**Region:** US-only at launch on both stores → defers EU DSA trader publication (Apple has removed non-compliant apps since Feb 2025) and GDPR work.

---

## 9. Can AI agents view/play Nomad Table on this Windows PC? ✅/❌

**Android — YES, locally, on this machine.** Verified chain: Android Studio AVD "Google Play" system images ship the real Play Store → sign in with a Google account → install any public app; Nomad Table is live on Play (`jayraavi.SoloMatch`). This PC qualifies: i5-11600KF (6 cores), 16GB RAM, hypervisor already active (WHPX path; Windows 11 Home is fine — full Hyper-V manager is Pro-only but the Windows Hypervisor Platform feature is not).

Setup:
1. Enable the **Windows Hypervisor Platform** optional feature; reboot. (Skip AEHD — sunset Dec 31 2026; HAXM is dead. Run the emulator on the bare host — Google explicitly doesn't support it inside another VM.)
2. Install **Android Studio** → Pixel-class AVD, x86_64 **Google Play** (store-logo) image, API 31–34 (Maestro-compatible).
3. Sign into Play Store with a dedicated Google account → install "NomadTable". (Its signup is Apple/Google — **no Instagram needed**, contrary to early assumptions.)
4. Wire up Claude Code: `claude mcp add mobile-mcp -- npx -y @mobilenext/mobile-mcp` (Node 22+, platform-tools on PATH) — screenshots, accessibility tree, tap/swipe/type over adb. Optionally `claude mcp add maestro -- maestro mcp` (Java 17+) for view-hierarchy inspection + YAML flows + embedded viewer.
5. If Play Integrity blocks the emulator (unlikely for a consumer social app; their binary does include Play Integrity — test day one): fall back to a physical Android phone over USB + adb + scrcpy 4.0; identical agent tooling.
6. Keep exploration human-scale on test accounts (their ToS prohibits scraping/bulk automation).

**iOS — NO local option on Windows** (Simulator ships only with Xcode; Apple's SLA licenses macOS/Xcode to Apple hardware only — no legal VM route). Cloud caveat: Appetize/Device Farm/App Automate all require *your own* binary. **The one clean option: BrowserStack App Live's "Install via App Store"** — a real cloud iPhone, your Apple ID, any public App Store app (paid plans; trial allows 3 iOS store-install sessions). It's an interactive human session — treat iOS as manual spot-checks; do agent-driven exploration on Android.

**WSA is dead** — Microsoft removed Windows Subsystem for Android March 5, 2025 (and it never had Google Play).

### 9.1 Policy for *our* app: agentic development and testing is Android-only

The same rig (Play-image emulator + mobile-mcp/Maestro) is the daily driver for building *our* app: agents build, install, drive, screenshot, and E2E-test the Expo dev build locally on Android, every day. **iOS is deliberately excluded from the agentic loop** and is developed on a separate, lower-frequency track:

- **EAS cloud builds at milestone boundaries** (not per-change — 15 free iOS builds/mo is the budget), installed via TestFlight on a physical iPhone.
- **A short human verification checklist per milestone**: map gestures/rendering, Sign in with Apple, push notifications, universal links, chat cold-open. BrowserStack App Live covers occasional cloud spot-checks when no device is at hand.
- Cross-platform parity comes from React Native itself plus these periodic human checkpoints — agent time is never spent trying to drive iOS, and iOS-specific bugs are batched to milestone boundaries instead of interrupting the daily loop.

---

## 10. Entity & store-launch gates (start ~9 weeks before launch)

| When | Action |
|---|---|
| L-9wk | **Form LLC** (registered-agent address, not home — stores publish it), EIN same day, business bank account, domain + corporate email, site up |
| L-8wk | **Request D-U-N-S** (free; ~5 biz days via Apple's fast path, Google warns up to 30 — longest pole, do first) |
| L-7wk | **Apple Developer as Organization** ($99/yr) + **Google Play Console Organization** ($25 once). Org account **skips Google's 12-tester/14-day closed-test gate** entirely (verified: personal accounts created after Nov 2023 must run 12 testers × 14 continuous days + ~7-day production-access review) |
| L-6→4wk | Build the §8 moderation kit before first submission; seed a reviewer demo account |
| L-4wk | TestFlight internal (no review) → first external build (Beta App Review ~1 day). Run a Play closed track for QA anyway |
| L-3wk | Listings, privacy labels, Data Safety form; **deselect EU/EEA countries** |
| L-2wk | Submit both stores; budget 2–3 Apple rejection cycles (~24h each) on 1.2/2.1 |
| L-0 | Phased release (Apple) + managed publishing (Play) |
| L+1–2mo | **Meta Business Verification** (LLC docs; up to ~14 biz days) → unlocks oEmbed Read for IG profile embeds |

End-to-end from code-complete: **~3–5 weeks with org accounts** (vs. a hard 4–5 week floor on a personal Google account — and your legal name published).

---

## 11. Competition & go-to-market

**Landscape (July 2026, verified):** Pickleheads (court directory, 25k+ places, USA Pickleball official, $2.5M seed, **no API**) is directory-first, not meetup-first. Playtime Scheduler (530k+ players, 2.4M sessions on a dated web tool) proves pickleball players schedule via software. GoodRec (1M+ players) and Plei are *operated* marketplaces charging ~$10–25/game. TeamReach/OpenSports serve pre-existing groups. Meetup post-Bending Spoons raised organizer prices (~$175→$299+/yr) and is bleeding sports organizers — our ambassador recruiting pool. **Nobody is a free, map-first, one-tap-join + instant-group-chat consumer app — and nobody anywhere shows live court occupancy (§6.1).** Skill filters and player caps are table stakes; the wedge is the sub-10-second join flow, free-forever for players, multi-sport single map, live "who's playing right now" pins, optional IG-handle social proof, and recurring events for Meetup refugees.

**Sport pick:** pickleball first (24.3M US players, +22.8% YoY, most app-native scheduling demand), basketball second (biggest whitespace, ~28–30M players, no dominant app — but walk-up culture makes it a hard *first* wedge), running as a content/partnership channel (Strava clubs ~1M, but coordination lives free in Strava/IG), skip tennis at launch (USTA-served).

**First 90 days (Nomad Table playbook, verified):** Days 1–30: verify venue data; recruit 15–25 organizer-ambassadors from price-hiked Meetup groups + Facebook pickleball groups (free-forever + featured placement); build a 2–5k local waitlist via founder build-in-public TikTok/IG (Nomad Table converted ~40% of a 15k waitlist on day one). Days 31–60: launch; seed 15–25 recurring events/week at 3–5 flagship courts so the map never looks empty; daily founder hook-demo shorts (3-second pain hook; kill formats under ~75% 3-sec retention); one paddle-shop/club co-host per week. Days 61–90: 10–20 local micro-creators at $1–2 CPM performance-based (their playbook: 60+ creators → ~44M views/mo). **North-star liquidity metrics: % of events reaching minimum players within 24h (target 70%+) and median time-to-first-join (<2h).** Turn on basketball when a venue cluster sustains ~100 weekly actives.

---

## 12. Build roadmap

- **Phase 0 — Rig & scaffolding (wk 1):** Android emulator rig (§9) + drive Nomad Table for UX study; monorepo (pnpm/Turborepo: `apps/mobile` Expo, `apps/web` Astro static + Hono Worker, `packages/shared` types+zod); Supabase project; EAS configured; CI.
- **Phase 1 — Core loop (wk 2–6):** schema + RLS + `events_near` RPC; map screen (MapLibre) + list toggle + event cards; create-event (venue picker, sport, skill, player cap); one-tap join → event group chat (channels/messages tables + Realtime Broadcast, §5 MVP scope); profiles (IG handle = optional connect-later add-on, §3); venue layer import for launch metro. Dev loop runs on the Android rig (§9.1). **Done 2026-07-06** (status block below); the end-of-phase iOS milestone moved into Phase 2.
- **Phase 2 — Social & safety (wk 7–10):** DMs (on the same chat tables), unread counts + badge hygiene, push (Expo Push + Edge Functions) deep-linking into threads, block/report/moderation queue + admin page (now covering chat messages, §5/§8), account deletion (in-app + web), 18+ gate, age-signal APIs behind a flag; **live court occupancy (§6.1)**: `checkins` table + geofenced check-in prompt + live venue-pin state + privacy controls (opt-in, ghost mode, TTL expiry). Historical popularity bars and the paddle-stack queue are post-launch fast-follows. **End of phase: first milestone EAS iOS build → TestFlight on a physical iPhone + the §9.1 human checklist** (moved from Phase 1; Apple Developer account in hand since 2026-07-06 — push and deep links land in this phase, so the checklist exercises them too). **Code-complete 2026-07-07** (status block below); live verification + the iOS milestone wait on YOUR-TODO 0a–0d.
- **Phase 3 — Website & links (wk 10–11):** Astro marketing + compliance pages; Hono Worker for `/e/[eventId]` OG pages + `/admin`; AASA/assetlinks + Smart App Banner; waitlist page live from Phase 0 (needed early for GTM). **Plus the iOS TestFlight milestone inherited from Phase 2** (0d — runs whenever Apple activates the pending Developer Program enrollment; independent of the website work). **Website & links done and deployed 2026-07-07** (status blocks below) — the phase stays open only for 0d; deep-link placeholder values (0e-4) fill in whenever they exist.
- **Phase 4 — Polish & beta (wk 12–14):** the Nomad-Table-complaint list (perf, badges, navigation); TestFlight/closed-track beta with ambassadors; store submissions (§10 must have started ~L-9wk in parallel).

*(The roadmap runs ~2 weeks longer than the pre-pivot plan — the §5 chat build is absorbed into Phases 1–2.)*

### Phase 1 status (2026-07-06) — core loop built and verified

Everything in the Phase 1 bullet is implemented and was driven end-to-end on
the Android rig against the live Supabase project: sign-up → 18+ onboarding →
map (MapLibre v11 + Stadia tiles, event pins with going-counts, list toggle,
sport/skill filters) → create-event (venue picker over the imported Austin
layer, 1,210 OSM venues) → auto host-RSVP + channel creation → group-chat
send/persist/render + inbox with unread counts → profile edit (optional
IG handle). Notable decisions made during the build:
chat thread is a custom FlashList-style FlatList (gifted-chat never needed);
`react-native-keyboard-controller` handles the SDK 57 edge-to-edge keyboard;
pnpm runs `nodeLinker: hoisted` (Windows CMake builds); migration
`…000004_restore_default_grants.sql` restores API-role grants that db-push
tables were missing.

**Phase 1 closed 2026-07-06 — scorecard:**
1. ~~Two-account realtime chat test~~ — **done 2026-07-06**: two emulators
   (second AVD cloned at 2.5GB RAM), George on one, fresh sign-up "Player B"
   on the other; one-tap join → chat, live Broadcast delivery verified in
   *both* directions with screenshots. Rig note: the emulator wedges at boot
   when launched from an agent shell with default GPU — launch with
   `-no-window -gpu swiftshader_indirect`.
2. **First milestone EAS iOS build + TestFlight human check** (§9.1) —
   **moved to the end of Phase 2** (see §12). The Apple Developer account was
   signed up 2026-07-06 so it's no longer blocked; batching it with Phase 2's
   push-notification and deep-link work gives the human checklist more to
   verify in one TestFlight pass.
3. ~~Polish~~ — **done 2026-07-06**: `expo lint` bootstrapped and clean
   (fixed 3 `set-state-in-effect` errors + duplicate imports); 661 unnamed
   OSM courts renamed from their containing park/school. Rename + top-up
   **applied to the live DB and verified via REST**: 1,220 venues, generic
   names down from ~1,200 to ~540 (courts with no named parent area in OSM).
4. New polish items found during the chat test (non-blocking, fold into
   Phase 4's Nomad-complaint pass): chat list renders blank while the
   keyboard is open (inverted-FlatList inset quirk); broadcast-delivered
   messages show the "Player" placeholder name until a refetch.

### Phase 2 status (2026-07-07) — built and verified end-to-end on the two-emulator rig

Everything in the Phase 2 bullet is implemented; typecheck + lint clean across
the monorepo. What shipped:

- **DMs** on the same chat tables (`dm_key` pair channels, `get_or_create_dm`
  RPC with block check, inbox/thread render partner names) — start a DM from
  any attendee row (tap → Message/Report/Block sheet).
- **Live court occupancy (§6.1)**: `check_in` RPC (server-enforced 150m
  geofence, 2h TTL upsert), `venues_near` now returns `live_count`,
  venue pins glow green with the count, venue sheet shows
  aggregate occupancy + expected-from-RSVPs, geofenced one-tap check-in
  prompt at ~75m, a checked-in banner, and live pin refresh via a
  `realtime.send` trigger on the shared private `occupancy` topic.
- **Unread + badge hygiene**: single `UnreadProvider` source of truth — Chats
  tab badge and app-icon badge recomputed from the real total on every
  refresh (never incremented blindly).
- **Push**: `push_tokens` table, Expo Push registration (graceful no-op until
  FCM credentials exist — YOUR-TODO 0b), `notify-message` Edge Function
  (sender-verified fan-out, block-aware), notification taps deep-link into
  the thread, Android `chat` notification channel.
- **Safety (§8)**: message long-press → delete own / report / block sender;
  soft deletes propagate live via UPDATE broadcasts; blocked-players list
  with unblock in Profile; keyword-filter triggers on messages + events
  auto-file system reports (nullable `reporter_id`); the admin moderation
  queue is now a real page on the worker (cookie/token auth, service role,
  hydrated report context, action/dismiss with resolution notes, optional
  delete-message / cancel-event enforcement).
- **Account deletion**: in-app danger-zone flow → `delete-account` Edge
  Function (`auth.admin.deleteUser`, FK cascades) → sign-out. Web
  `/delete-account` page existed since Phase 1.
- **Age-signal APIs**: `AGE_SIGNAL_APIS_ENABLED` flag stubbed off (§8) — the
  DB 18+ constraint remains the floor.

**Verified live 2026-07-07** (migration + Edge Functions deployed by owner;
two emulators, George + Player B, GPS-fixed to the Shoal Beach courts):
geofenced check-in prompt → server geofence accepted → banner + green pin;
**cross-device realtime occupancy** (B's check-in ticked George's untouched
map 🟢1→🟢2); DM from attendee sheet with partner-named inbox/thread, live
delivery both directions, tab + row unread badges; report message (24h-SLA
confirmation); soft delete propagated live via UPDATE broadcast; block =
event/DM vanish for the blocker, unblock restores; check-out reverts the pin.
Verification found and fixed live: `venue_occupancy` counted distinct sports
as `checkin_count`, and the blocked-players list couldn't name RLS-invisible
profiles (new `my_blocked_players()` RPC) — both in migration
`20260707000001` (**owner: one more `db push`, YOUR-TODO 0a½**). Also fixed:
map location read upgraded Balanced→High accuracy (Balanced is too coarse for
a 75m geofence and never engages GNSS). Polish notes for Phase 4: overlapping
venue/event pins contest taps at low zoom; the geofence prompt re-offers the
neighboring court right after a voluntary check-out; first-launch geofence
prompt can be swallowed by the notification-permission dialog.
**Remaining Phase 2 exit items:** FCM service-account upload (0b, in
progress) for real pushes, then the **iOS TestFlight milestone** (0d).
*Update 2026-07-07 (later):* 0a½ pushed and verified live. **0b is fully
done and push is verified end-to-end on the rig**: FCM service-account key
uploaded/assigned on EAS → message sent as Player B through the real
`notify-message` fan-out → FCM delivered to the backgrounded app
("Pickup · Sunset · Player: …") → tap deep-linked into the correct thread.
Two findings for later: (1) `notify-message` sends to every stored token
and dead ones accumulate — prune tokens on `DeviceNotRegistered` receipts
(Phase 4 polish); (2) rig gotcha: an emulator booted `-no-snapshot-save`
discards in-session app installs on exit. *Final update 2026-07-07:*
the Apple Developer enrollment payment is still pending ("no team
associated with your Apple account" at EAS build time), so the iOS
TestFlight milestone (0d) moves into Phase 3 rather than holding this
phase open. **Phase 2 is closed — Android-complete, all §12 Phase 2
scope built and verified live.**

### Phase 3 status (2026-07-07) — built and verified; deploys are owner steps

Everything in the Phase 3 bullet is code-complete; typecheck + lint clean.
What shipped / was verified:

- **Marketing site (Astro)**: real landing copy (live-courts headline, one-tap
  join, free-forever), waitlist form (honeypot + `?waitlist=` error states),
  `/thanks` page; compliance pages already existed from Phases 1–2.
  `public/_headers` added so Pages serves the extensionless AASA file as
  `application/json`.
- **Waitlist backend**: `waitlist` table migration (`20260707000002`,
  insert-only RLS, unique email) + `POST /waitlist` on the worker (anon key,
  `resolution=ignore-duplicates`, redirects back to the site). Verified via
  `wrangler dev`: honeypot, invalid-email, and error paths all redirect
  correctly; the 201 path needs the owner's `db push` (YOUR-TODO 0e-1).
- **/e/[eventId] OG page**: verified against the live DB ("Sunset" event
  unfurls with going-count/cap). Fixed a latent Phase 2 bug found by this
  test: `event_public` RETURNS TABLE, so PostgREST sends an array — the page
  now requests `application/vnd.pgrst.object+json` (single object, clean 406
  → 404 on unknown ids). Page also gained og:site_name/twitter tags, a
  commented Smart-App-Banner meta (needs App Store id), and a
  waitlist-fallback CTA (swaps to store links + Play Install Referrer at
  launch).
- **Deep links, app side**: `associatedDomains` (iOS) + `autoVerify`
  intentFilters (Android) for `pickupsports.app/e/*` in app.json;
  new `e/[eventId]` route redirects into `event/[id]`, declared inside the
  root layout's `ready` guard — verified on the rig: signed-out deep link
  falls back to sign-in (was a blank screen before the guard fix), signed-in
  `pickup://e/<id>` cold/warm opens land on the event screen with the
  "I'm interested" CTA.
- **Owner queue (YOUR-TODO 0e)**: push waitlist migration → `wrangler deploy`
  + secrets (0c) → Cloudflare Pages project with `PUBLIC_WAITLIST_ENDPOINT`.
  Universal-link placeholders (Apple TEAMID, Play signing SHA-256, App Store
  id) stay dormant until those values exist (0e-4) — Apple Team ID filled in
  2026-07-13 (`NL489DLC24`, enrollment activated); Play SHA-256 and App Store
  id still pending. **iOS TestFlight milestone (0d) is now unblocked** — it
  rides with this phase per §12 but is independent of the website work.
- Rig note for the daily loop: "Cannot find native module X" after an
  emulator boot = the snapshot restored a stale APK — fix is
  `adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
  (rebuilding is unnecessary).

**Deploy update (2026-07-07, later):** 0e-1 and 0e-2 are done. The waitlist
migration is on the live DB (verified: anon zero-row probe returns 200 `[]`).
The worker is live at `https://pickup-worker.pickupsports.workers.dev`
(workers.dev subdomain `pickupsports` registered account-wide); both secrets
set; event OG page returns 200 against the live DB; `/admin` fails closed
(401 on no/wrong token). During the deploy Claude found and fixed an
admin-auth hole — with `ADMIN_TOKEN` unset, `isAdmin` compared
`undefined === undefined` and admitted everyone; `isAdmin` now returns false
when the secret is missing (fix deployed by the owner). Remaining owner
steps: Pages site (0e-3), deep-link placeholders (0e-4), iOS milestone (0d).

**Deploy update (2026-07-07, evening): 0e-3 done — Phase 3 deploys complete.**
The site shipped as a git-connected **Workers static assets** deploy, not
Pages (Cloudflare now steers new projects to Workers; Pages is legacy):
Worker `find-your-pickle-balls` at
`https://find-your-pickle-balls.pickupsports.workers.dev`, rebuilding on
every push to `main` (build `pnpm --filter web build`, deploy
`npx wrangler deploy --config apps/web/wrangler.toml`,
`PUBLIC_WAITLIST_ENDPOINT` as a dashboard build variable; assets-only
`apps/web/wrangler.toml`, no `main`). `_headers` works on Workers static
assets too — both `.well-known` files serve as `application/json`. Live
round-trip testing caught two bugs, both fixed + redeployed (worker deploy
by owner): (1) the PostgREST upsert (`on_conflict` +
`ignore-duplicates`) is rejected by RLS on tables with no select policy —
despite the with-check-true insert policy — so `/waitlist` now does a plain
insert and treats 409/duplicate as success; (2) `SITE_ORIGIN` pointed at
the unregistered `pickupsports.app`, stranding every redirect — it
temporarily points at the live site URL (`TODO(domain)` in
`apps/worker/wrangler.toml`). Verified live: new email → 302 `/thanks`,
duplicate → `/thanks`, invalid → `/?waitlist=invalid#waitlist`, and the
row lands in `waitlist` (201). Remaining owner steps: deep-link
placeholders (0e-4), iOS milestone (0d), waitlist test-row cleanup (0e).

### Phase 4 status (2026-07-07) — polish pass 1: the accumulated bug list, cleared

The six polish items carried in the Phase 1–3 status blocks are fixed;
typecheck + lint clean. Verified on the single-emulator rig (fresh event
"Evening" at the Shoal Beach pickleball court):

- **Chat blank under keyboard** (Phase 1 note): RN's
  `automaticallyAdjustKeyboardInsets` applies the inset to the wrong edge of
  an *inverted* FlatList — replaced with a Reanimated spacer
  (`useReanimatedKeyboardAnimation`) as the inverted list's
  `ListHeaderComponent` (renders at the visual bottom), minus `insets.bottom`
  to match the composer's StickyView offset. **Rig-verified**: messages sit
  directly above the composer with the keyboard open.
- **"Player" placeholder on broadcast messages** (Phase 1 note):
  `mergeMessages` now resolves a missing `sender` from any already-loaded
  message by the same `sender_id` (broadcast payloads carry no profile join).
  First-ever message from a sender still back-fills via the head refetch —
  by design. Code-verified (typecheck); needs the two-emulator rig for a
  live pass, batch with the next chat session.
- **Pin tap contention at low zoom** (Phase 2 note): idle venue dots only
  render at zoom ≥ 13 (`VENUE_DOTS_MIN_ZOOM`); live venues always render.
  Also declutters the metro view. **Rig-verified**: no dots downtown at
  zoom 12, live 🟢 pin still renders; `onRegionDidChange` delivers numeric
  zoom (checked via debug log). Dots-at-14 not visually confirmed — adb
  can't produce a double-tap-zoom gesture; follows from the verified parts.
- **Check-in re-offer after check-out** (Phase 2 note): 15-min prompt
  cooldown (`CHECKOUT_PROMPT_COOLDOWN_MS`) starts on any checked-in → null
  transition (voluntary or TTL); the checked-in venue also joins the
  session's prompted set. **Rig-verified** at Shoal Beach, whose pickleball
  and basketball courts are 49m apart — the exact pair from the original
  report: check-in → check-out → no re-prompt.
- **First-launch prompt swallowed** (Phase 2 note): the geofence Alert now
  awaits `pushRegistrationSettled()` (exposed from notifications.ts) so it
  can't render under the OS notification-permission dialog. Granted-path
  rig-verified (prompt still fires); the true first-launch race needs a
  wiped install — spot-check during the next fresh-account session.
- **Dead push tokens** (Phase 2 finding): `notify-message` now parses Expo
  tickets and deletes `push_tokens` rows on `DeviceNotRegistered`
  (ticket-level; receipt polling stays a §4.4-style upgrade if ever needed).
  Deploy is owner-gated → YOUR-TODO 0f.

### Phase 4 status (2026-07-09) — polish pass 2: verifications + UX friction

The two verifications deferred from pass 1 both passed on the rig, and the
pass fixed four new UX/polish items; typecheck + lint clean. Verified on the
two-emulator rig (fresh event "Polish pass 2" at Shoal Beach, new fresh-install
account "Player C"):

- **Sender-name fix rig-verified** (pass 1 item): broadcast-delivered
  messages render the real sender name immediately in both directions —
  no "Player" placeholder (screenshots ~1s after each send).
- **First-launch prompt race rig-verified** (pass 1 item): on a wiped
  install + fresh sign-up at the courts, the geofence check-in Alert
  appeared *after* the OS notification-permission dialog settled instead
  of being swallowed under it.
- **New: check-in chain-prompt fix** — the prompt-cooldown now also starts
  when a prompt is shown/declined (was: only on check-out). Found live:
  declining the pickleball-court prompt immediately stacked the
  basketball-court prompt on top (Shoal Beach's courts are 49m apart, both
  inside the 75m geofence).
- **New: chat send flicker** — the optimistic bubble was removed before the
  head refetch resolved, blinking the message out for a network round-trip;
  now the real row is fetched first and swapped in one batch. Rig-verified.
- **New: one-tap join latency** — join waited for a full event-detail
  refetch before pushing the chat screen; it now navigates as soon as the
  channel id is known (§2 sub-10s wedge) and refreshes behind. Rig-verified:
  fresh account joined and landed in the chat instantly.
- **New: same-thread push suppression** — the notification handler drops a
  push whose `channelId` matches the thread currently on screen (the message
  is already visible; the banner was pure noise / Nomad badge-complaint
  territory).
- **New: pull-to-refresh** on the Chats inbox and the map's list view.

Remaining Phase 4 scope: the broader Nomad-complaint pass (perf profiling,
navigation feel — no known bugs left on the list), ambassador beta, store
submissions (§10 gates), and the 0d iOS milestone still waiting on Apple.

### Phase 4 status (2026-07-13) — pass 3: Apple unblock, SDK alignment, rebrand

Apple Developer membership activated (Team `NL489DLC24`): AASA `appIDs`
filled in and verified live (`application/json`, correct team+bundle), 0d
preflighted end-to-end (EAS CLI logged in as `gw1108`, expo-doctor 20/20,
typecheck clean) and rewritten in YOUR-TODO as ready-to-run. Work done and
rig-verified this pass (fresh `expo prebuild -p android` + `assembleDebug`,
two-court GPS fix at Shoal Beach):

- **SDK 57 version alignment** (`expo install --fix`): expo/expo-router/
  expo-linking/@expo/ui to expected patches and
  `react-native-keyboard-controller` 1.21.13 → Expo's pinned 1.21.9 (a
  *native* downgrade — was the main regression risk). Verified: chat
  keyboard spacer still correct (messages sit on the composer, keyboard
  open), send has no flicker, history + sender names render.
- **Rebrand off the Expo template** (was: Expo "A" logo as app icon,
  splash, and in-app splash overlay). New mark: white map pin with
  pickleball holes on the brand blue gradient (SVG source in the render
  script; assets via sharp). Regenerated `icon.png`, `splash-icon.png`,
  the Android adaptive set, favicon; dropped the `ios.icon` .icon-composer
  dir (plain PNG is the reliable path for the first TestFlight build);
  animated splash overlay now renders the mark. Rig-verified: launcher
  icon, native splash → animated overlay, no template art anywhere.
- **Regression spot-checks still green:** chain-prompt cooldown (decline
  basketball → no stacked pickleball prompt), venue-dot declutter at low
  zoom, tab navigation, Chats inbox.
- **Perf profiling scoped out of the rig:** SwiftShader software GL +
  dev-mode Metro bundles make emulator numbers meaningless (MapLibre draws
  outside HWUI — gfxinfo reports 0 frames; dev cold start is dominated by
  the bundle fetch). Real perf/navigation-feel data comes from the 0d
  TestFlight checklist on the physical iPhone and ambassador-beta Androids;
  revisit only if those surface complaints.
- Rig gotchas learned: the first Metro bundle after a `pnpm install` can
  take 10–15 min (cache invalidated; black screen is *waiting*, not hung —
  watch for `Android Bundled` in the metro log), and gradle needs
  `JAVA_HOME` = Android Studio's `jbr` from an agent shell; stop gradle
  daemons before driving the emulator (RAM pressure).

### Phase 4 status (2026-07-14) — 0f deployed: push pruning live, rig re-verified

Owner deployed the `notify-message` token-pruning build (YOUR-TODO 0f,
section since deleted per its rules). Rig re-verification end-to-end:
message inserted as Player B via PostgREST → function invoked with B's JWT
→ `{"sent":2}` → FCM banner on the backgrounded dev build ("Sunset /
Player: Post-redeploy push check", `chat` channel) → tap deep-linked into
the Sunset thread. Auth rejection, block filtering, and recipient math all
exercised by the same path. Two findings:

- **Bug (open): sign-out never removes the device push token.**
  `removePushToken()` exists in queries.ts but has no caller. Consequences
  on a shared device: (1) the signed-out account keeps receiving that
  device's pushes (privacy); (2) the next account's `savePushToken` upsert
  hits the token-PK row owned by the previous user and RLS rejects the
  UPDATE (42501, swallowed by the best-effort catch), so the new account
  silently never registers. Hit live on the rig switching phase3-smoke →
  pushtest; unblocked by deleting the stale row as its owner. Fix shape:
  call `removePushToken(token)` before `supabase.auth.signOut()` (needs the
  current token cached), or make `savePushToken` delete-then-insert.
- Receipt-level `DeviceNotRegistered` (dead FCM binding behind a live-looking
  Expo ticket) is invisible to the new ticket-level pruning — tickets came
  back `ok` for a token the receipts endpoint then reported dead. Known
  §4.4-style upgrade, just now observed in the wild.

2026-07-21: profile per-sport skill levels and ghost mode removed end-to-end
(tag-a05d4c) — `profiles.skill_levels`/`ghost_mode` columns dropped, RPC
ghost filtering removed from `venue_occupancy`/`venues_near`, profile-screen
skill picker + Ghost mode row deleted. Event skill ranges are untouched.
Earlier feature descriptions above predate this removal.

**Definition of done for MVP:** a stranger in the launch metro can open the app, see which courts are live right now, and be in a pickleball game's group chat within 10 seconds, safely (block/report/18+), with invite links that unfurl properly — for ~$25–70/mo in infra.

---

## 13. Sources & verification

Two multi-agent research rounds (11 web researchers, 40 adversarial fact-checks, all against primary sources — Meta/Apple/Google/Supabase/Stream/Mapbox/etc. docs and pricing pages, July 2026). Three claims were refuted and corrected herein: (1) Firestore now *does* have native geo queries — Enterprise edition, preview, April 2026; (2) Nomad Table's selfie-verification consent is mandatory-at-eligibility, not optional, and their ToS reserves background-check rights; (3) nomadtable.app carries no Cloudflare Insights beacon (otherwise the static-HTML teardown stands). Full research JSON: session scratchpad `research_*.md` / `r2_*.md`.
