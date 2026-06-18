# SubHub

**Two-sided marketplace for fencing franchise operators and subcontractors.**
Contractors post fully scoped, pre-sold jobs. Subcontractors browse, claim, complete, and get paid — all inside the app.

## Stack
- **Framework**: Expo (SDK 51) + Expo Router — iOS, Android, and Web from one codebase
- **Database**: Supabase (Postgres + RLS)
- **Auth**: Supabase Auth (email/password, role stored in `user_metadata.role`)
- **Payments**: Stripe Connect (Phase 2 — placeholder in `.env.example`)
- **VoIP**: Twilio (Phase 2 — in-app calling with no number shared)
- **File storage**: Supabase Storage (job photos)

## Running the app
```bash
cd subhub
npm install
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start
```

Press `i` for iOS simulator, `a` for Android emulator, `w` for web.

## Supabase setup
1. Create a new Supabase project
2. Run all migrations in order in the SQL editor (`supabase/migrations/001` through `029`)
3. Enable the `pg_trgm` extension: Dashboard → Database → Extensions → search "pg_trgm" → enable
4. Copy the project URL and anon key into `.env`
5. **Server-side push (migration 016)** needs the `pg_net` extension (the migration enables it) plus two Vault secrets so the DB trigger can call the edge function. In the SQL editor, run once with your real values:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<service-role-key>', 'service_role_key');
   ```
   These are NOT committed to git. Until they exist, the message trigger no-ops (no push) but messaging still works.

## Deploying Edge Functions
```bash
cd subhub
supabase login
supabase link --project-ref <your-project-ref>

# Set secrets (run once)
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...   # from Stripe dashboard after creating endpoint

# Deploy all functions
supabase functions deploy create-payment-intent
supabase functions deploy payout-sub
supabase functions deploy connect-stripe
supabase functions deploy setup-payment-method
supabase functions deploy send-notification
supabase functions deploy stripe-webhook
supabase functions deploy hold-payment          # $1k posting authorization hold
supabase functions deploy release-hold
supabase functions deploy analyze-job           # AI job analysis (sub side)
supabase functions deploy admin-action          # admin portal actions + PIN gate
supabase functions deploy compute-job-success   # recompute sub reputation
supabase functions deploy match-saved-searches  # push alerts on matching jobs
supabase functions deploy management-api        # franchise management-system REST API
```

## Project structure
```
subhub/
├── app/
│   ├── _layout.tsx               # Root — auth check, role-based redirect
│   ├── (auth)/                   # Login, signup, onboarding
│   │   ├── login.tsx
│   │   ├── signup.tsx            # Role selection (contractor / subcontractor)
│   │   ├── onboard-contractor.tsx
│   │   └── onboard-sub.tsx
│   ├── (contractor)/             # Contractor tab stack
│   │   ├── index.tsx             # My jobs dashboard (filter by status)
│   │   ├── post-job.tsx          # 3-step job card builder
│   │   ├── jobs/[id].tsx         # Job detail + messaging + cancel
│   │   └── profile.tsx
│   └── (sub)/                    # Subcontractor tab stack
│       ├── index.tsx             # Job board (sort by pay / duration / newest)
│       ├── my-jobs.tsx           # Active + completed jobs
│       ├── jobs/[id].tsx         # Job detail + claim
│       └── profile.tsx
├── components/
│   ├── JobCard.tsx               # Visual tile (board + manage variants)
│   └── RatingStars.tsx
├── lib/
│   ├── supabase.ts               # Supabase client (SecureStore session)
│   ├── auth.ts                   # signIn / signUp / signOut / getUserRole
│   ├── types.ts                  # Core TypeScript types
│   └── theme.ts                  # Colors, spacing, radius, fontSize
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

## Two user roles
User role is stored in `user_metadata.role` at signup and drives all routing.

| Role | DB profile table | Entry point |
|------|-----------------|-------------|
| `contractor` | `contractor_profiles` | `/(contractor)/` |
| `subcontractor` | `sub_profiles` | `/(sub)/` |

## Core data model
- **`jobs`** — the central entity. Has full job card fields + status lifecycle.
- **`contractor_profiles`** / **`sub_profiles`** — one per user, created at onboarding.
- **`change_orders`** — structured change card with pre-agreed pay schedule.
- **`messages`** — in-app only, per job, both parties.
- **`ratings`** — post-completion, both directions. Aggregate trigger updates profile.
- **`job_media`** — before/during/after photos linked to job.

## Job lifecycle
```
draft → posted → claimed → in_progress → pending_review → complete
                                       ↘ disputed
```

## Platform rules (enforced in RLS + UX)
- Homeowner phone/email never exposed to sub — all contact through the app
- Payment only flows through SubHub — off-platform = no guarantee
- Rating history lives only in the platform
- Change orders auto-apply pre-agreed fee schedule — no on-site negotiation

## Design
- **Primary**: `#1a3c5e` (deep navy — contractor / trust)
- **Accent**: `#22c55e` (green — money / sub side)
- **Background**: white with `#f8fafc` surfaces
- **Job cards**: white tiles, shadow, payout in large green type
- Sub-side accent is green throughout; contractor-side accent is navy

## Feature status

### Built
- Full auth flow (login, signup with role, onboarding)
- Job card builder (3-step: scope → logistics → closeout)
- Job board with sort/filter/search
- Job claim, start, complete, pending review lifecycle
- **Change orders** — either party files; pre-agreed rate schedule auto-applies; both parties approve; `ChangeOrderCard` component with approve/dispute
- **Photo upload** — before/during/after phases; Supabase Storage; `PhotoUpload` component; required before job close
- **Push notifications** — Expo push tokens registered on login; `lib/notifications.ts` helpers for all key events; `send-notification` Edge Function
- **Stripe Connect** — sub payout account onboarding via Connect Express; contractor payment method via PaymentSheet; `create-payment-intent`, `payout-sub`, `connect-stripe`, `setup-payment-method`, and `stripe-webhook` Edge Functions. Webhook handles `payment_intent.succeeded` (processing → held), `payment_intent.payment_failed`, and `account.updated` (marks sub verified)
- Customer digital sign-off before job close
- 5-star ratings (both directions, post-completion)
- Profile screens with payment status + action CTAs
- `PaymentStatus` and `ChangeOrderCard` shared components
- **$1,000 posting hold** — authorization hold on contractor card at post time (`hold-payment`/`release-hold`)
- **Instant pay** — sub-selectable bank vs. instant payout (1.5% fee) in `payout-sub`
- **AI job analysis** — Claude Haiku scores a job for the sub (`analyze-job`)
- **Admin portal** — dashboard, jobs, users, disputes, payments; PIN-gated (`admin-action`, `ADMIN_PIN` secret)
- **In-app VoIP calling** — Twilio click-to-call, numbers masked (`call-connect`/`call-twiml`)
- **Reputation** — Job Success Score, tier badges (New/Rising/Top Rated/Elite), response rate, profile-completion meter (`lib/reputation.ts`, `compute-job-success`)
- **Availability toggle** — subs mark available/busy
- **Invite-to-job + favorites** — contractors invite specific subs and favorite them (`job_invites`, `favorites`)
- **Saved-search alerts** — subs save searches, get push alerts on matching jobs (`saved_searches`, `match-saved-searches`)
- **Earnings dashboard** — sub earnings totals, monthly breakdown, 1099 export
- **Pre-claim Q&A** — subs ask questions on a job before claiming (`job_questions`)
- **Structured disputes** — evidence threads + admin resolution (pay/split/cancel) (`disputes`, `dispute_evidence`)
- **Sub profiles** — bio, jobs-completed, portfolio
- **Portfolio photo upload UI** — subs add/remove work photos on their profile; uploads to `job-media/portfolio/`, stored in `portfolio_photos`
- **Home splash** — both roles land on a full-bleed logo splash after login (`(sub)/home.tsx`, `(contractor)/home.tsx`) with live platform tallies (Jobs Completed, Paid to Crews) via the `get_platform_stats()` RPC. Navigation is via the tab bar / sidebar, not buttons.
- **In-app messaging** — per-job threads with realtime updates, **unread badges** (Messages tab + per-thread counts), **read receipts** ("Read"/"Sent" under your last message), and a **typing indicator** (Realtime broadcast on the chat channel)
- **Server-side message push** — `messages` INSERT fires the `on_message_insert` trigger (migration 016) → `send-notification` edge function via `pg_net`, so delivery no longer depends on the sender's app staying open. Recipient is resolved as the other job party; sender name + job title fill the notification
- **Build Your Crew** (migration 019) — the contractor retention mechanic. A sub becomes crew-eligible after a threshold of completed jobs **and** total payout together (placeholder: 3 jobs, $5,000). Contractors add eligible subs to their crew (slot-limited via `contractor_profiles.crew_slots`, default 3). Crew gets a priority window on new posts: `jobs.crew_priority_until` makes a job visible/claimable only to the contractor's active crew until it expires, then it opens to the board. Eligibility + slot limits enforced server-side via SECURITY DEFINER RPCs (`add_to_crew`, `remove_from_crew`, `crew_candidates`) so crew status can't be faked client-side. Stats refresh via `trg_refresh_crew_stats` on job completion; `flag_stale_crew()` marks 90-day-idle pairs `at_risk` (cron-ready). UI: `/(contractor)/crew.tsx` (slot meter, eligible candidates, current crew), crew-priority toggle on the post-job review step, `👷 Crew priority` badge on the sub job board. Lib: `lib/crew.ts`.

- **Projects** (migration 022) — a coordination layer over multiple Jobs for one customer engagement. `projects` table; `jobs.project_id/sequence_order/depends_on_job_id`; `project_progress()` rollup RPC. Contractor `/(contractor)/projects` (list + create) and `/(contractor)/projects/[id]` (progress, sequenced jobs, attach via post-job `projectId` param). Projects tab in the contractor layout.
- **Saved Jobs** (migration 021) — persistent per-sub shortlist (`saved_jobs` + RLS). Double-tap a card to save (heart pulse) or swipe right; saved-only filter on the board. `lib/savedJobs.ts`.
- **Crew v2** (migration 020) — three-part eligibility (jobs **+** dollars **+** mutual star rating ≥4.0), rolling 3-month maintenance (`maintain_crew_status()`), subscription tiers → crew slots (`set_subscription_tier`, Starter/Pro/Crew Builder = 3/7/15), and crew-aware overflow (`overflow_until` + `sub_is_overflow_eligible` second priority tier in the RLS). AI crew-match score defaults the post-job priority toggle. `SubscriptionTierCard`.
- **Fee waiver** (migration 023) — new users get a fixed number of fee-free jobs (`contractor_profiles.free_posts_remaining`, `sub_profiles.free_payouts_remaining`, default 3). Banner on post-job; consumed on post and (server-side) in `payout-sub`. `lib/fees.ts`.
- **Referrals + earned visibility** (migration 023) — per-user `referral_code`, `referrals` ledger, `visibility_boosts` (Tier-3, always below Crew). `claim_referral`/`grant_referral_reward` (auto on referred user's first completed job), `grant_new_user_boost` at onboarding. `ReferralCard`, `lib/referrals.ts`.
- **Backed By vouching** (migration 024) — capped (5) peer endorsements with reputational cost (`vouch_events` logged on ≤2-star ratings to a vouchee). `add_vouch`/`remove_vouch`/`vouches_for`. Surfaced on the sub-side contractor detail. `lib/vouches.ts`.
- **Diversification Score** (migration 024) — anti-concentration metric (Herfindahl-based breadth+balance over trailing 6 months), `diversification_score()` RPC. `DiversificationBadge` on the sub profile.
- **Reviews discovery** (migration 026) — public ratings read + `contractor_reviews()` RPC. Scrollable, trade-filterable Reviews feed (`/(sub)/reviews`) → sub-side contractor detail (`/(sub)/contractors/[id]`: profile, open jobs, reviews, Backed By, change-order health flag).
- **Change-order safeguards + scope markup** (migration 025) — `change_orders.value_delta/platform_markup` stamped server-side (10% of the change delta); `contractor_change_metrics()` flags chronic frequency or underscoping. Markup shown on `ChangeOrderCard`; flag banner on contractor detail.
- **Sponsored partners** (migration 028) — curated, clearly-labeled "Recommended Tools" (one per category) shown on profile/dashboard surfaces ONLY, never in the core post/board/claim/message/closeout flow. `recommended_partners()` RPC, `RecommendedTools` component, `lib/partners.ts`.
- **Volume discount / loyalty fee** (migration 029) — Tier-0 incentive: a contractor↔sub PAIR earns a decreasing sub-side platform fee as they complete more jobs together (10% base → 8% at 3 jobs → 6% at 6 → 5% floor at 10). Rate is authoritative server-side (`pair_fee_rate`, SECURITY DEFINER) and read by `create-payment-intent` when stamping `platform_fee_sub`. `pair_discount_status` / `my_pair_discounts` RPCs surface it. Shown on the claim-confirm breakdown (discounted-fee line + nudge) and the sub-side contractor detail. `lib/fees.ts` (`getPairDiscount`, `pairDiscountMessage`).
- **Claim Confirmation screen** (`/(sub)/claim-confirm/[id]`) — full-screen claim review (was an Alert): payout breakdown with loyalty/waiver-aware fee, availability + terms checkboxes, "what happens next" steps. Writes the claim only after both boxes are checked.
- **Payout Status screen** (`/(sub)/payout-status/[jobId]`) — 4-step payment pipeline (Claimed → Work Started → Awaiting Release → Released), fee breakdown, instant-pay info. Linked from job detail (pending review) and the earnings "Pending Payouts" list.
- **Contractor Payment Dashboard** (`/(contractor)/payments`) — Payments tab: Outstanding / Paid tabs, period-spend stats, per-job rows with status badges, tap-through to job detail.
- **Contractor Fee Agreement** — onboarding step 2 now includes a platform-fee disclosure table (10% sub fee, $75 CO admin, $500 delay cap) and an expanded digital sign-off referencing SubHub platform terms.
- **Graduated posting hold** (migration 030) — `posting_hold_amount()` SECURITY DEFINER RPC returns $1,000 cents for the first concurrent hold, $250 for each additional. `hold-payment` edge function calls it instead of hardcoding; `post-job.tsx` shows the actual hold amount in the success alert. Unblocks franchise bulk-posting.
- **Cron schedules** (migration 027) — `maintain_crew_status()` daily at 08:00 UTC, `recompute_diversification()` daily at 08:30 UTC via pg_cron (idempotently scheduled; wrapped so a missing pg_cron extension doesn't fail the migration).
- **Franchise bulk-posting** (`/(contractor)/bulk-post.tsx`, migration 032) — Contractors fill a shared template (trade, material info, start window) then add per-job rows (title, address, payout, optional scope override). Jobs post sequentially so the graduated hold applies correctly: first job in the batch $1,000, each additional $250. Per-row status indicators (idle / posting / done / error); stops on the first failure. New "📦 Bulk Post" tab in the contractor layout.
- **Management-system API** (migration 031, `management-api` edge function) — External REST API for franchise field-management software (e.g. ServiceTitan). Auth via `sk_subhub_…` bearer tokens stored as SHA-256 hashes in `api_keys` table. Supported actions: `create_job` (inserts + places hold), `list_jobs`, `cancel_job` (releases hold + cancels). Optional `external_ref` field (migration 032) stores the franchise system's work-order ID. API key management UI (generate/revoke) in the contractor profile under "Developer / API Access".
- **DB-trigger push for all key events** (migration 033) — Server-side push triggers for every remaining lifecycle event: job claimed (→ contractor), job marked complete / pending_review (→ contractor), change order filed (→ other party), change order approved (→ both parties), job invite (→ sub), dispute opened (→ other party). All follow the same pg_net + Vault pattern as the message trigger (migration 016). Client-side helpers in `lib/notifications.ts` remain as fallbacks but the triggers are now the authoritative delivery path.
- **Native deep-link capture** (`lib/pendingLink.ts`, `app/_layout.tsx`) — `captureNativeLinkParams(url)` parses `?ref` / `?job` from a `subhub://` URI via `expo-linking` and stashes them in AsyncStorage. Called both on cold start (`Linking.getInitialURL()`) and via a `Linking.addEventListener('url', …)` listener while the app is running. If the user is already signed in and a `?job` arrives, they're navigated directly. Web capture (`captureEntryParams()`) unchanged.
- **Market intelligence** (migration 034, `/(contractor)/market.tsx`, `/(sub)/market.tsx`) — Aggregate stats powered by three SECURITY DEFINER RPCs (`market_summary`, `market_stats_by_state`, `market_stats_by_industry`). Contractor side: "Market Pulse" — fill rates, time-to-claim, avg payout by state and trade. Sub side: "Where's the Work" — open jobs and highest-paying trades/states. Period selector (7d / 30d / 90d). Both screens show graceful empty states when data is sparse. 📊 Market tab added to both contractor and sub layouts.

### Not yet built
- (All planned features are now built)

## Conventions
- All Supabase queries use the anon client — RLS enforces access
- Never surface `homeowner_phone` or `homeowner_email` in sub-facing screens
- All communication features (messaging, VoIP) are per-job — no direct contact info shared between parties
- Use `getUserRole()` from `lib/auth.ts` for role checks, not raw `user_metadata`
- Theme constants live in `lib/theme.ts` — no hardcoded color strings in components (the dark splash background `#0d1117` is the one intentional exception)
- Secrets the DB needs (service role key, project URL for `pg_net` calls) live in Supabase Vault, never in committed migrations
- Unread message count comes from `useUnreadMessages()` (`lib/`) — messages addressed to me with `read_at is null`
