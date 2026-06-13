# SubHub

**Two-sided marketplace for fencing franchise operators and subcontractors.**
Contractors post fully scoped, pre-sold jobs. Subcontractors browse, claim, complete, and get paid — all inside the app.

## Concept
- **Beachhead**: Fencing franchise brands (Stand Strong Fence, Top Rail Fence, etc.) that scale entirely on subs but have no structured platform to find or manage them
- **Core loop**: Job sold → material staged → contractor posts job card → sub claims → sub completes + photos + customer sign-off → money moves
- **Platform moat**: Every communication, payment, and rating lives in the app — neither side has reason to go direct

## Two Sides

### Contractor / Franchise side (supply)
- Business profile: license, insurance, scope of work, service area, billing info, contacts
- Post jobs via job card builder
- Manage active / completed / in-review jobs
- Rate subcontractors (5-star + comment + repeat-hire toggle)
- Agreed to fee schedule at onboarding — no surprise change order negotiations

### Subcontractor side (demand)
- Pro profile: license, insurance, tax ID, skills, service area, payout method
- Visual job board: sort by pay, duration, or trade
- Full job card visible on tap — no phone call needed to decide
- Claim job → connect with contractor → complete → collect sign-off → get paid
- Rate contractors (5-star + comment + rehire preference)

## Full Job Card (required fields on every listing)

**Scope and materials**
- Written scope of work
- Full material list
- Material supplier + location
- Material status (on-site / local / distant)
- Site layout / diagram

**Job logistics**
- Job address + access notes
- Estimated days to complete
- Start window
- Final agreed install price
- Sub payout amount

**People and closeout**
- Homeowner contact info (masked — routed through app)
- Contractor direct contact (masked)
- Required photos (before / during / after)
- Customer digital sign-off
- Job marked complete

## Communication Rules
All communication flows through the app — no personal numbers, emails, or off-platform calls ever surface between parties.

- **In-app messaging**: text thread per job
- **In-app calling**: VoIP only, no number shared
- **Job notifications**: push alerts for status, updates, claims
- **Photo uploads**: before, during, after
- **Digital sign-off**: customer closes the job in-app
- **Dispute channel**: issues flagged in-platform

**Three enforcement mechanisms against going direct:**
1. **Payment lock** — sub only gets paid through the app; off-platform = no guarantee, no instant pay, no record
2. **Rating dependency** — reputation lives only here; going direct means starting at zero on the next job
3. **Terms of service** — off-platform contact = account suspension (stated clearly at onboarding)

## Change Order Flow
Change orders are the #1 point of failure in field jobs. The platform owns this moment.

When a layout change, material change, add-on, or scope shift is identified on site:

1. Either party initiates a **change card** in-app — job cannot sit in limbo
2. Contractor fills out: type of change, material status, adjusted payout (auto-populated from pre-agreed fee schedule)
3. **Material location branch**:
   - Within ~20–25 mile radius → sub picks up or franchise owner delivers → job resumes same day or next morning start; delay pay kicks in if wait exceeds threshold
   - Outside radius → delivery timeline set in-app → sub commits to return date → job slot held; standby pay applies
4. Both parties confirm → change card locked → pay updated → job continues

**Pre-set change order pay schedule (agreed at contractor onboarding):**
- **Delay pay**: flat rate per hour held, kicks in after wait threshold
- **Add-on pay**: per linear foot or unit, tied to scope added
- **Return trip pay**: flat fee for second mobilization on distant-material jobs

**Contractor fee structure (pre-agreed, no negotiation on site):**
- Change order fee: flat per change card filed
- Delay liability cap: max exposure per job (protects contractor from open-ended risk)
- Scope change markup: platform takes % of delta

**Change frequency flag**: if a contractor files change cards on a high % of jobs, the platform surfaces that pattern — signals poor job prep or bad-faith use of the process.

## Payment Flow

```
Homeowner → Contractor → SubHub (takes % both sides) → Subcontractor
```

- Contractor pays listing fee or % when sub claims the job
- Subcontractor pays % of payout when paid out
- Platform holds payment and releases it

## Feature Roadmap

### Phase 1 — MVP
- Profiles (both sides) with real business credentials
- Job card builder
- Job board with sort/filter (pay, duration, trade)
- In-app messaging
- 5-star rating system
- Basic payment processing
- iOS + Android + Web

### Phase 2 — Monetization
- Instant pay to subs (platform earns the float + small fee)
- Guaranteed payment rails
- 10–14 day contractor payment terms
- Featured job placement
- Verified badge for subs
- Job history and analytics
- Subscription tiers

### Phase 3 — Scale
- Multi-trade expansion (landscaping, flooring, painting)
- Insurance marketplace
- Material ordering integration
- Franchise tools (bulk job posting)
- API for franchise systems
- Sub crew management
- White-label option

## Tech Considerations (TBD)
Stack not decided. Key constraints:
- Must run on iOS, Android, and web
- Payment processing needs to hold funds (Stripe Connect is the obvious choice)
- VoIP calling in-app (Twilio or similar)
- Real-time job status updates (WebSocket or push)
- Photo upload with job record attachment
- Digital signature capture

## Revenue Model
- **Contractors**: listing fee or % per job claimed by a sub
- **Subcontractors**: % of payout when paid out
- **Phase 2 upside**: float on instant pay, fees on guaranteed payment terms

## Key Risks
- **Disintermediation**: mitigated by payment lock + rating dependency + ToS
- **Cold start**: need supply (jobs) and demand (subs) simultaneously — fencing franchise network solves the supply side at launch
- **Payment regulation**: holding funds requires proper money-transmitter licensing or a licensed partner (Stripe Treasury, etc.)
- **Change order disputes**: pre-agreed fee schedule eliminates negotiation but disputes still possible — need an arbitration path

## Notes
- Source: dictated brief + AI-assisted blueprint session (June 2026)
- Original document: `SubHub.pdf` in conversation history
