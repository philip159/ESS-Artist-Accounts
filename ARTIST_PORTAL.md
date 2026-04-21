# East Side Studio — Artist Portal

Technical reference covering how artists are invited, how they log in, how they upload artwork, and how each piece connects to the rest of the system.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Artist Invitation & Signup](#2-artist-invitation--signup)
3. [Login & Authentication](#3-login--authentication)
4. [Session Flow (Client → Server)](#4-session-flow-client--server)
5. [Artwork Upload](#5-artwork-upload)
6. [How Everything Connects](#6-how-everything-connects)
7. [Key Files](#7-key-files)

---

## 1. System Overview

The artist portal is a private, invite-only web application at `account.eastsidestudiolondon`. Artists cannot self-register. Every account is created by an admin, linked to a Shopify vendor name, and activated via an invitation email.

Authentication is handled entirely by **Supabase Auth** — the app uses Supabase JWTs for all artist API requests. The admin system uses a separate session mechanism (Replit Auth + an admin password).

```
Artist Browser ──► Supabase Auth ──► Supabase JWT
                                          │
                                          ▼
                              Express API (requireArtistAuth)
                                          │
                                          ▼
                              Neon PostgreSQL (artist data)
                                          │
                                          ▼
                              Shopify (products, orders, sales)
```

---

## 2. Artist Invitation & Signup

### Who can invite artists?

Only admins. The invite flow is triggered from `/admin/artists` in the admin dashboard. There is no public signup page.

### Step-by-step

**Step 1 — Admin creates the artist account**

Admin calls `POST /api/admin/artists/create-and-invite` with the artist's name, email, and commission rate. The server:

1. Creates a record in the `artist_accounts` table with `onboardingStatus = "invited"`.
2. Sets `vendorName` (first + last name joined) — this is the exact string that must match the vendor field on Shopify products.
3. Calls `supabaseAdmin.auth.admin.inviteUserByEmail` to send the invitation email via Supabase.

**Step 2 — Artist receives the invitation email**

Supabase sends an email with a link pointing to `/artist/setup#access_token=...`. The access token in the URL fragment is a short-lived Supabase session token.

**Step 3 — Artist sets their password**

The `/artist/setup` page (`client/src/pages/artist/Setup.tsx`) reads the token from the URL fragment, calls `supabase.auth.updateUser({ password: "..." })`, and marks the account as active.

**Step 4 — First login auto-links the Supabase user**

On the artist's first authenticated API request, `requireArtistAuth` middleware looks up the artist record by email and writes the Supabase `user.id` (UUID) into `artist_accounts.supabaseUserId`. All subsequent lookups use this UUID directly — no email lookup needed.

### Onboarding statuses

| Status | Meaning |
|--------|---------|
| `pending` | Account created (often auto-created from a Shopify webhook) but no invite sent |
| `invited` | Invitation email sent by admin |
| `active` | Artist has set their password and logged in |

### Shopify setup (optional admin step)

After an artist is active, admins can run `/api/admin/artist-accounts/:id/setup-shopify` which:

- Creates a Shopify **smart collection** (`VENDOR = vendorName`)
- Creates a Shopify **Artists metaobject** with name, bio, and photo
- Adds the artist to the storefront "Artists" navigation menu
- Sets `shopifySetupComplete = true` on the artist account

---

## 3. Login & Authentication

### Login page — `client/src/pages/artist/Login.tsx`

Artists land on a split-screen page (form left, studio photos right). Three authentication modes are available:

#### Password login
```
supabase.auth.signInWithPassword({ email, password })
```

#### Magic link (passwordless)
```
supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: "/artist/login" } })
```
Supabase sends an email; clicking it redirects back to `/artist/login` with a session token in the URL. The `onAuthStateChange` listener picks up the `SIGNED_IN` event and redirects to the dashboard.

#### TOTP two-factor authentication
If an artist has enrolled 2FA (via Settings), the login page switches to an MFA challenge mode after password verification:

```
supabase.auth.mfa.challenge({ factorId })
supabase.auth.mfa.verify({ factorId, challengeId, code })
```

The MFA challenge upgrades the session's AAL (Authenticator Assurance Level) from `aal1` to `aal2`.

### 2FA Enrollment (Settings page)

Artists can enrol/remove TOTP from the Security tab in Settings:

- **Enrol**: `supabase.auth.mfa.enroll({ factorType: "totp" })` → returns a QR code + manual secret
- **Confirm**: `supabase.auth.mfa.challengeAndVerify({ factorId, code })`
- **Remove**: `supabase.auth.mfa.unenroll({ factorId })`

### ArtistAuthContext — `client/src/contexts/ArtistAuthContext.tsx`

Wraps the entire artist-facing app. Provides:

- `session` — current Supabase session
- `user` — Supabase user object (email, metadata, id)
- `isLoading` — whether the initial session check is in progress
- `signOut()` — calls `supabase.auth.signOut()` and clears state
- `getAccessToken()` — returns the JWT for use in API requests

All artist pages read from this context. Routes check `user` to decide whether to render content or redirect to `/artist/login`.

---

## 4. Session Flow (Client → Server)

### Making authenticated API requests

Two helpers in `client/src/lib/artistApiRequest.ts` attach the JWT automatically:

```ts
// For mutations (POST, PATCH, DELETE)
artistApiRequest("PATCH", "/api/artist/profile", data)

// For React Query reads
artistQueryFn<ArtistAccount>("/api/artist/profile")
```

Both read the current Supabase session, extract the JWT, and send it as:

```
Authorization: Bearer <supabase-jwt>
```

### Server middleware — `server/middleware/artistAuth.ts`

Every protected artist route runs through `requireArtistAuth`:

```
Request
  │
  ├── Extract Bearer token from Authorization header
  │
  ├── supabaseAdmin.auth.getUser(token)   ← verifies signature, expiry
  │       │
  │       ▼
  ├── Look up artist_accounts by supabaseUserId
  │       │
  │       ├── Found → attach req.artistId, call next()
  │       │
  │       ├── Not found, but email matches → auto-link UUID, call next()
  │       │
  │       └── Not found → 403 Forbidden
```

`req.artistId` is then used by every route handler to scope data to that artist:

```ts
app.get("/api/artist/sales", requireArtistAuth, async (req, res) => {
  const account = await storage.getArtistAccount(req.artistId);
  const sales = await storage.getArtistSales(account.id);
  res.json(sales);
});
```

### Admin impersonation

Admins can view any artist's portal via `/admin/view-artist/:id`. The `ImpersonationContext` (`client/src/contexts/ImpersonationContext.tsx`) switches API calls to use `/api/admin/impersonate/:artistId/...` endpoints — these are protected by admin session auth, not the artist JWT.

---

## 5. Artwork Upload

### Upload page — `client/src/pages/artist/Upload.tsx`

Before sending anything to the server, the file is analysed locally:

1. **Image analysis** (`useImageProcessor.ts`) — reads pixel dimensions, calculates DPI, determines which print sizes are achievable at 150 DPI minimum.
2. **Artist fills in title** and reviews the calculated sizes.
3. **Submit** → `POST /api/artist/upload` with the file + metadata.

### Server processing

1. **Sharp** generates a low-resolution JPEG preview.
2. Both the original high-res file and the preview are stored in **object storage** (Supabase Storage) under `.private/artist-uploads/`.
3. A row is inserted into the `artworks` table with status `pending`.

### Artwork statuses

| Status | Meaning |
|--------|---------|
| `pending` | Uploaded by artist, awaiting admin review |
| `analyzed` | Image specs verified, print sizes confirmed |
| `mockups_generated` | Framed/lifestyle mockup images created |
| `exported` | Included in a Matrixify CSV batch for Shopify import |

### Admin review & Shopify pipeline

Once an artwork is `pending`, it appears in the admin dashboard. The admin workflow is:

1. **Review** — check image quality, dimensions, and title.
2. **Generate mockups** — server composites the artwork onto lifestyle/frame templates (`server/mockupGenerator.ts`). Optionally uses OpenAI to generate product descriptions and alt text.
3. **Create export batch** — admin selects artworks and generates a Matrixify-format CSV (`server/matrixifyExporter.ts`). This CSV contains all Shopify product rows including size/frame variants and pricing from `variant_configs`.
4. **Import to Shopify** — the CSV is uploaded to Matrixify in the Shopify admin. Products go live with the artist's vendor name attached.

---

## 6. How Everything Connects

```
Admin Dashboard
      │
      ├── Creates artist account ──────────────────► artist_accounts table
      │         │                                          │
      │    Supabase invite email                    vendorName (e.g. "Philip Jobling")
      │         │                                          │
      │         ▼                                          │
      │    /artist/setup (artist sets password)            │
      │         │                                          │
      │         ▼                                          │
      │    First login → auto-links supabaseUserId         │
      │                                                    │
      ├── Artist logs in ──────────────────────────────────┤
      │         │                                          │
      │    Supabase JWT in every request                   │
      │         │                                          │
      │    requireArtistAuth middleware                     │
      │         │                                          │
      │    req.artistId flows to all routes                │
      │                                                    │
      │                                    Shopify orders (webhook)
      │                                          │
      │                                    Vendor name matched
      │                                          │
      │                                    artist_sales table
      │                                          │
      ├── Artist views dashboard ◄─────────────────────────┤
      │    (net revenue, units, chart)                     │
      │                                                    │
      ├── Artist uploads artwork ──────────────────────────┤
      │         │                                    artworks table
      │    Object storage (high-res + preview)             │
      │                                                    │
      │    Admin generates mockups                         │
      │         │                                          │
      │    Admin exports Matrixify CSV                     │
      │         │                                          │
      │    Shopify products created ◄──────────────────────┘
      │    (vendor = vendorName)
      │
      └── Sales recorded → commissions calculated → shown to artist
```

### The vendorName is the central link

Everything ties back to `artist_accounts.vendorName`:

- Shopify products have a `Vendor` field — must exactly match `vendorName`.
- The sales sync script filters Shopify orders by vendor to calculate each artist's revenue.
- The commission system uses `netRevenue` stored per artist per month in `artist_sales`.
- The Shopify collection and metaobject use `vendorName` as the filter rule.

---

## 7. Key Files

| File | Purpose |
|------|---------|
| `client/src/pages/artist/Login.tsx` | Password, magic link, and 2FA login |
| `client/src/pages/artist/Setup.tsx` | Invited artist sets their password |
| `client/src/pages/artist/Upload.tsx` | Artwork upload form and image analysis |
| `client/src/pages/artist/Dashboard.tsx` | Sales chart, KPIs, portfolio overview |
| `client/src/pages/artist/Commissions.tsx` | Per-artwork earnings breakdown |
| `client/src/pages/artist/Settings.tsx` | Profile, payout details, 2FA management |
| `client/src/contexts/ArtistAuthContext.tsx` | Global Supabase session state |
| `client/src/contexts/ImpersonationContext.tsx` | Admin view-as-artist mode |
| `client/src/lib/artistApiRequest.ts` | Authenticated API request helpers |
| `client/src/lib/supabase.ts` | Supabase client (anon key, browser) |
| `server/middleware/artistAuth.ts` | JWT verification + artistId injection |
| `server/supabaseAdmin.ts` | Supabase admin client (service role key) |
| `server/routes.ts` | All API routes (`/api/artist/*`, `/api/admin/*`) |
| `server/scripts/syncSales.ts` | Shopify order sync → artist_sales table |
| `server/mockupGenerator.ts` | Artwork mockup image generation |
| `server/matrixifyExporter.ts` | Shopify CSV export for Matrixify |
| `server/shopifyArtistSetup.ts` | Shopify collection + metaobject creation |
| `shared/schema.ts` | All database table definitions |
