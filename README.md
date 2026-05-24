# Allo Inventory — Reservation System

A full-stack inventory reservation platform built for the Allo Engineering take-home exercise. When a customer reaches checkout, stock is temporarily held for 10 minutes — preventing overselling while not permanently depleting inventory for abandoned carts.

**Live demo:** _(deploy and add your URL here)_

---

## Table of Contents

1. [Architecture overview](#architecture-overview)
2. [Concurrency handling](#concurrency-handling)
3. [Reservation expiry](#reservation-expiry)
4. [Idempotency](#idempotency)
5. [Local setup (VS Code)](#local-setup)
6. [Database setup (Supabase / Neon)](#database-setup)
7. [Redis setup (Upstash)](#redis-setup)
8. [Running locally](#running-locally)
9. [Deploying to Vercel](#deploying-to-vercel)
10. [API reference](#api-reference)
11. [Trade-offs and future work](#trade-offs-and-future-work)

---

## Architecture overview

```
src/
├── app/
│   ├── api/
│   │   ├── products/route.ts          # GET /api/products
│   │   ├── warehouses/route.ts        # GET /api/warehouses
│   │   └── reservations/
│   │       ├── route.ts               # POST /api/reservations
│   │       └── [id]/
│   │           ├── route.ts           # GET /api/reservations/:id
│   │           ├── confirm/route.ts   # POST /api/reservations/:id/confirm
│   │           └── release/route.ts   # POST /api/reservations/:id/release
│   ├── products/page.tsx              # Product listing (server component)
│   └── reservations/[id]/page.tsx    # Checkout (server + client)
├── components/
│   ├── ui/                            # shadcn/ui primitives
│   └── shared/                        # Feature components
├── lib/
│   ├── prisma.ts                      # Singleton DB client
│   ├── redis.ts                       # Upstash client + lock helpers
│   ├── idempotency.ts                 # Idempotency key handling
│   ├── validations.ts                 # Zod schemas
│   └── utils.ts                       # Shared helpers
└── types/index.ts                     # TypeScript interfaces
```

**Stack:** Next.js 15 App Router · TypeScript · Prisma · PostgreSQL · Upstash Redis · Tailwind · shadcn/ui · Zod

---

## Concurrency handling

This is the core of the exercise. The problem: if two users simultaneously try to reserve the last unit of a SKU, both requests could read `availableStock = 1`, both decide "yes, stock exists," and both decrement — resulting in `availableStock = -1` (overselling).

### Solution: two-layer locking

**Layer 1 — Redis distributed lock (per inventory slot):**

```
POST /api/reservations
  │
  ├── SET lock:inventory:{productId}:{warehouseId} {token} NX PX 5000
  │     ↑ atomic: only one holder possible at a time
  │
  ├── if lock acquired → proceed to DB transaction
  └── if lock NOT acquired → return 409 immediately
```

The lock key is scoped to `productId + warehouseId` so reservations for different products/warehouses are never blocked by each other. TTL of 5 seconds ensures the lock is auto-released if the server crashes mid-transaction.

**Layer 2 — PostgreSQL SELECT FOR UPDATE:**

Inside the Prisma interactive transaction we issue:

```sql
SELECT id, "totalStock", "reservedStock"
FROM inventory
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```

`FOR UPDATE` acquires a row-level exclusive lock in Postgres. Even if Redis is briefly unavailable (and both requests slip through to the DB), exactly one of them will acquire the row lock first. The other waits until the first commits, then re-reads the inventory and finds insufficient stock — returning 409.

**Result:** belt-and-suspenders safety. Redis stops the thundering herd at the application layer; Postgres guarantees correctness at the DB layer regardless.

### Race condition example

```
User A:  GET lock → acquired         DB: reservedStock 0→1  Lock released
User B:  GET lock → WAITING...  →  gets lock → reads reservedStock=1, totalStock=1 → 0 available → 409
```

---

## Reservation expiry

Reservations expire 10 minutes after creation (`expiresAt` field).

### Strategy: lazy expiration on read

Rather than running a background cron job (which would require a separate process or Vercel Cron), we use **lazy expiration**: expired reservations are cleaned up the next time someone reads inventory.

`GET /api/products` runs this before fetching:

```typescript
const expired = await prisma.reservation.findMany({
  where: { status: "PENDING", expiresAt: { lt: new Date() } },
});
// → update inventory.reservedStock (decrement)
// → update reservation.status = "RELEASED"
```

`POST /api/reservations/:id/confirm` also checks `expiresAt` before confirming:

```typescript
if (new Date() > reservation.expiresAt) {
  // Release stock, return 410 Gone
}
```

**Trade-off:** In a high-traffic system with very precise stock counts, you'd want a dedicated worker (e.g., Vercel Cron calling `GET /api/products` every 2 minutes, or a BullMQ job). Lazy cleanup is acceptable for this exercise and Vercel's serverless model, but means stock numbers could be slightly stale between product page loads.

**In production I would add:** A Vercel Cron Job at `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/expire-reservations", "schedule": "*/2 * * * *" }]
}
```

---

## Idempotency

The `POST /api/reservations` and `POST /api/reservations/:id/confirm` endpoints accept an `Idempotency-Key` header.

**How it works:**

1. Client sends `Idempotency-Key: <uuid>` with the request.
2. Server checks `idempotency_records` table for this key.
3. If found → return the stored response. **No side effects.**
4. If not found → execute the handler, store the `(key, statusCode, response)` tuple, return the response.

Records expire after 24 hours. Clients should not retry with the same key beyond that window.

**Why this matters:** Payment flows often have retry logic (network timeouts, etc.). Without idempotency, retrying a successful reserve request could double-hold stock.

---

## Local setup

### Prerequisites

- Node.js 20+
- npm 10+
- A PostgreSQL database (see [Database setup](#database-setup))
- An Upstash Redis instance (see [Redis setup](#redis-setup))

### Step-by-step in VS Code

**1. Clone and open**

```bash
git clone https://github.com/YOUR_USERNAME/allo-inventory.git
cd allo-inventory
code .
```

**2. Install dependencies**

```bash
npm install
```

**3. Set up environment variables**

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:
- `DATABASE_URL` — your PostgreSQL connection string
- `UPSTASH_REDIS_REST_URL` — from Upstash console
- `UPSTASH_REDIS_REST_TOKEN` — from Upstash console

**4. Generate Prisma client**

```bash
npx prisma generate
```

**5. Run database migrations**

```bash
npx prisma migrate dev --name init
```

**6. Seed the database**

```bash
npm run seed
```

This creates 3 warehouses, 6 products, and 15 inventory records. Some items are deliberately scarce to demonstrate the concurrency feature (e.g. AirPods Pro in Delhi: 1 unit).

**7. Start the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to the product listing.

---

## Database setup

### Option A: Supabase (recommended)

1. Go to [supabase.com](https://supabase.com) → New project
2. Wait for the project to provision (~2 min)
3. Go to **Settings → Database → Connection string → URI**
4. Copy the **Connection pooling** URL (for serverless) and set it as `DATABASE_URL`
5. For migrations, also copy the **Direct connection** URL as `DIRECT_URL`

   Add to `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")
   }
   ```

### Option B: Neon

1. Go to [neon.tech](https://neon.tech) → New project
2. Choose a region close to your Vercel deployment
3. Copy the **Prisma** connection string from the dashboard
4. Set as `DATABASE_URL` in `.env.local`

---

## Redis setup

1. Go to [upstash.com](https://upstash.com) → Create database
2. Choose **Regional** → pick the same region as your Vercel deployment
3. After creation, go to **REST API** tab
4. Copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**
5. Add both to `.env.local`

Upstash is HTTP-based and works natively in Vercel serverless functions — no TCP connection management required.

---

## Running locally

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run seed         # Re-seed database
npx prisma studio    # Open DB GUI at http://localhost:5555
```

### Testing the concurrency protection

Open two browser tabs simultaneously on the product listing. Find **AirPods Pro in Delhi (1 unit)**. Click Reserve in both tabs as quickly as possible — exactly one should succeed and redirect to checkout; the other should show a "Out of stock" toast.

---

## Deploying to Vercel

**1. Push to GitHub**

```bash
git init
git add .
git commit -m "feat: initial implementation"
git remote add origin https://github.com/YOUR_USERNAME/allo-inventory.git
git push -u origin main
```

**2. Import to Vercel**

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select your repository
3. Vercel auto-detects Next.js — no framework config needed

**3. Add environment variables**

In Vercel project → **Settings → Environment Variables**, add:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your Supabase/Neon connection string |
| `UPSTASH_REDIS_REST_URL` | From Upstash console |
| `UPSTASH_REDIS_REST_TOKEN` | From Upstash console |

**4. Deploy**

Click Deploy. After the build completes, your app is live.

**5. Run migrations on production DB**

```bash
DATABASE_URL="your-production-url" npx prisma migrate deploy
DATABASE_URL="your-production-url" npm run seed
```

Or use Vercel's CLI:
```bash
npx vercel env pull .env.production.local
npx prisma migrate deploy
npm run seed
```

---

## API reference

### `GET /api/products`

Returns all products with per-warehouse inventory. Lazily expires stale reservations before responding.

**Response:** `Product[]` (see `src/types/index.ts`)

---

### `GET /api/warehouses`

Returns all warehouses.

---

### `POST /api/reservations`

Creates a reservation. Atomically checks and holds stock.

**Headers:**
- `Idempotency-Key: <uuid>` (optional)

**Body:**
```json
{
  "productId": "clx...",
  "warehouseId": "clx...",
  "quantity": 1
}
```

**Responses:**
- `201` — reservation created
- `400` — validation error
- `409` — insufficient stock or lock contention

---

### `POST /api/reservations/:id/confirm`

Confirms a reservation (payment succeeded). Permanently decrements stock.

**Headers:**
- `Idempotency-Key: <uuid>` (optional)

**Responses:**
- `200` — confirmed
- `409` — already confirmed/released
- `410` — reservation expired

---

### `POST /api/reservations/:id/release`

Releases a reservation early (user cancelled). Restores reserved stock.

**Responses:**
- `200` — released
- `409` — already released or confirmed

---

## Trade-offs and future work

### What I'd do with more time

1. **Cron-based expiry cleanup** — A dedicated `GET /api/cron/expire-reservations` endpoint triggered by Vercel Cron every 2 minutes would give more precise stock numbers than lazy cleanup.

2. **Optimistic UI updates** — After reserving, immediately update the product listing stock counts in client state rather than requiring a manual refresh.

3. **WebSockets / Server-Sent Events** — Push stock changes to all connected clients in real time using Ably or Pusher, so a shopper sees "Only 1 left!" update live without refreshing.

4. **Quantity selector** — Currently hardcoded to `quantity: 1`. A quantity picker on the product card would be a natural next step.

5. **Auth** — Reservations are currently anonymous. Adding NextAuth.js session IDs to the reservation record would let users see their own reservation history.

6. **E2E tests** — Playwright tests for the full reserve → confirm and reserve → expire flows, plus a concurrency test that fires two simultaneous requests and asserts exactly one 201 and one 409.

7. **Metrics** — Track lock contention rate, reservation-to-confirmation conversion rate, and expiry rate via OpenTelemetry → Grafana.

### Known limitations

- **Clock skew** — `expiresAt` is set by the server, but countdown rendering uses the client clock. In the worst case a user's countdown shows time remaining but the server considers it expired (or vice versa). A `serverTime` field in the API response would let the client calculate accurate drift.

- **Lock TTL** — The Redis lock TTL is 5 seconds. A very slow database (cold connection, complex transaction) could exceed this and release the lock while the transaction is still running. In practice the transaction completes in < 200ms on a hosted DB.
