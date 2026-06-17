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
2. Run all migrations in order in the SQL editor (`supabase/migrations/001` through `005`)
3. Enable the `pg_trgm` extension: Dashboard → Database → Extensions → search "pg_trgm" → enable
4. Copy the project URL and anon key into `.env`

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
- **Sub profiles** — bio, jobs-completed, portfolio support

### Not yet built
- In-app text messaging UI (DB schema exists, basic chat screens present)
- Push notification delivery from DB triggers (currently client-side initiated)
- Portfolio photo upload UI (table exists: `portfolio_photos`)

## Conventions
- All Supabase queries use the anon client — RLS enforces access
- Never surface `homeowner_phone` or `homeowner_email` in sub-facing screens
- All communication features (messaging, future VoIP) are per-job — no direct contact info
- Use `getUserRole()` from `lib/auth.ts` for role checks, not raw `user_metadata`
- Theme constants live in `lib/theme.ts` — no hardcoded color strings in components
