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
2. Run `supabase/migrations/001_initial_schema.sql` in the SQL editor
3. Copy the project URL and anon key into `.env`

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

## What's not built yet (Phase 2+)
- In-app VoIP calling (Twilio)
- Stripe Connect payout integration
- Push notifications (Expo Notifications)
- Photo upload to Supabase Storage (UI hooks exist, upload logic TBD)
- Change order UI (data model + RLS in DB, screens not yet built)
- Rating flow post-completion
- Admin dashboard

## Conventions
- All Supabase queries use the anon client — RLS enforces access
- Never surface `homeowner_phone` or `homeowner_email` in sub-facing screens
- All communication features (messaging, future VoIP) are per-job — no direct contact info
- Use `getUserRole()` from `lib/auth.ts` for role checks, not raw `user_metadata`
- Theme constants live in `lib/theme.ts` — no hardcoded color strings in components
