# Allo Inventory – Take-Home Exercise

A Next.js inventory reservation system that solves the checkout race condition for multi-warehouse retail.

---

## Running locally

### Prerequisites
- Node.js 18+
- A hosted Postgres instance (Supabase free tier works perfectly)
- An Upstash Redis instance (free tier)

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/allo-inventory
cd allo-inventory
npm install

# Copy env template and fill in your credentials
cp .env.example .env.local

# Run DB migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate

# Seed the database with products, warehouses, and stock
npm run db:seed

# Start the dev server
npm run dev
```

The app will be at http://localhost:3000.

---

## How expiry works in production

Reservations expire 10 minutes after creation (`expiresAt` is set at reservation time).

I use a **two-pronged approach**:

1. **Vercel Cron (primary):** `vercel.json` registers `/api/cron/expire-reservations` to run every minute. It queries for PENDING reservations where `expiresAt < NOW()`, releases the stock in a transaction, and marks them RELEASED. The endpoint is protected by a shared `CRON_SECRET` header so only Vercel's scheduler can call it.

2. **Lazy cleanup (fallback):** The `confirm` endpoint checks whether the reservation has expired before confirming, and if it has, it releases the stock on the spot and returns 410. This guarantees correctness even if the cron job misses a run.

This means the worst case for stock being visibly "stuck" as reserved is 1 minute — the cron interval.

**Why not a long-running background worker?** Vercel's serverless model doesn't support persistent processes, so a worker would need a separate service (e.g. a Railway container). The cron approach is simpler, free, and sufficient for the stated 10-minute window.

---

## Concurrency approach

The core challenge: two requests for the last unit must not both succeed.

**Solution: `SELECT FOR UPDATE` inside a Prisma transaction.**

When a reservation request arrives:
1. We open a Postgres transaction.
2. We immediately lock the specific `Stock` row with `SELECT ... FOR UPDATE`. This blocks any other transaction that tries to lock the same row.
3. We read `total - reserved` (the available quantity) from the locked row.
4. If available >= requested, we increment `reserved` and create the `Reservation` record, then commit.
5. If not, we throw `InsufficientStockError` and the transaction rolls back, returning 409.

Because Postgres serializes access to the locked row, the second concurrent request will block at step 2 until the first transaction commits, then re-read the (now updated) reserved count and see there is no stock left.

**Why not Redis locks?** A Redis NX lock (provided in `src/lib/redis.ts`) would also work, but it has a gap: the lock TTL and the DB transaction are not atomic. If the process crashes between "Redis lock acquired" and "DB transaction committed", the lock expires but the DB might be in a partial state. `SELECT FOR UPDATE` ties the lock lifetime to the transaction — if anything fails, the DB rolls back cleanly.

Redis is still useful here for the **idempotency bonus**, where we cache the response of a completed reservation by its `Idempotency-Key`. Cached reads from Redis are fast and don't need to touch the DB.

---

## Idempotency (bonus)

If a client sends an `Idempotency-Key: <uuid>` header with `POST /api/reservations`, the server:

1. Checks the `idempotencyKey` field in the `Reservation` table (unique-indexed).
2. If a reservation with that key already exists, returns it immediately without repeating the stock check or decrement.
3. If not, proceeds normally and persists the key alongside the reservation.

This means a client can safely retry a reservation request (e.g. after a network timeout) without double-charging stock. The same key always produces the same reservation.

---

## Trade-offs and things I'd do differently

**What I'd add with more time:**
- A proper `GET /api/reservations/:id` endpoint instead of sessionStorage rehydration on the checkout page. I kept it out because it wasn't in the spec, but it would make the checkout page shareable and SSR-friendly.
- Optimistic UI updates on the product listing page — currently, stock numbers only refresh on page load. A simple polling interval or WebSocket push would keep the table live as other users reserve units.
- More granular error handling on the frontend — the 409 body includes the available quantity, which could be shown to the user rather than a generic message.
- Integration tests for the concurrent reservation case using `pg`'s `LISTEN/NOTIFY` or a test harness that fires two simultaneous requests at a single-unit SKU and asserts exactly one 201 and one 409.

**Deliberate simplifications:**
- Quantity is hardcoded to 1 on the frontend. The API accepts any positive integer, so bulk reservations work, but the UI doesn't expose it.
- No authentication. In production, reservations would be tied to a user session so they could be recovered across browser tabs.
- The cron sweep runs every minute, so a reservation can show as "pending" for up to 60 seconds after it expires in the DB. Lazy cleanup in the `confirm` endpoint closes this gap for the user.
