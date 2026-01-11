# Restaurant Reservation API

Node.js/Express + PostgreSQL/Prisma REST API for managing restaurants, tables, and reservations.

## Stack

- Node.js + Express
- TypeScript
- PostgreSQL + Prisma ORM
- Validation with Zod
- Rate limiting (express-rate-limit)
- Redis caching for availability and slots
- Tests with Vitest + Supertest

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Provide a Postgres URL (example uses docker-compose below)

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/reservation?schema=public"
export REDIS_URL="redis://localhost:6379"
```

or add to your .env:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/reservation?schema=public"
export REDIS_URL="redis://localhost:6379"
```

3. Push schema and generate Prisma client

```bash
npx prisma db push
npm run prisma:generate
```

4. Run dev server (auto-restarts)

Server listens on `http://localhost:3000` by default. 5. Run tests (requires a reachable Postgres database)

```bash
npm test
```

Environment variables .env:

- `PORT` (default 3000)
- `DATABASE_URL` (Postgres URL for Prisma)
- `REDIS_URL` (Redis connection string; default `redis://localhost:6379`)

## API

All requests/response bodies are JSON.

> **Note:** The API is versioned. All endpoints below are prefixed with `/api/v1`. For example, `POST /restaurants` becomes `POST /api/v1/restaurants`.

### Response Format

All responses follow a standard format:

```json
{
  "success": true,
  "status": 200,
  "message": "Request successful",
  "data": { ... }
}
```

For errors:

```json
{
  "success": false,
  "status": 400,
  "message": "Error message",
  "data": null
}
```

### POST /restaurants

Create a restaurant.

```json
{
  "name": "Tallie Bistro",
  "openTime": "10:00",
  "closeTime": "22:00",
  "totalTables": 12
}
```

Response: 201 with restaurant object.

### POST /restaurants/:id/tables

Add a table to a restaurant.

```json
{
  "tableNumber": "A1",
  "capacity": 4
}
```

### GET /restaurants/:id

Restaurant details and tables. Optional query to include availability:
`/restaurants/1?startTime=2024-01-01T19:00:00.000Z&durationMinutes=120&partySize=4`
Response includes `availableTables` when query is supplied.

### POST /restaurants/:id/reservations

Create a reservation; auto-picks a table if `tableId` is omitted.

```json
{
  "customerName": "Alice",
  "phone": "123-456",
  "partySize": 4,
  "startTime": "2024-01-01T19:00:00.000Z",
  "durationMinutes": 120,
  "tableId": 1
}
```

Errors: 400 for validation/capacity/hours, 409 for conflicts.

### GET /restaurants/:id/reservations?date=YYYY-MM-DD&[page=1]&[pageSize=20]

Paginated reservations for a date. Response shape:

```json
{
  "data": [
    /* reservations */
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "totalPages": 3
}
```

### GET /restaurants/:id/availability?startTime=ISO&durationMinutes=120&partySize=4

Available tables for a specific slot (cached ~60s via Redis).

### GET /restaurants/:id/time-slots?date=YYYY-MM-DD&durationMinutes=120&partySize=4

Returns start times (ISO) that can accommodate the party (cached ~60s via Redis).

### PATCH /restaurants/:id/reservations/:reservationId

Modify a pending reservation (startTime and/or durationMinutes).

```json
{
  "startTime": "2024-01-01T20:00:00.000Z",
  "durationMinutes": 90
}
```

Errors: 400 if confirmed/cancelled, 409 if new slot unavailable.

### POST /restaurants/:id/reservations/:reservationId/confirm

Transition a pending reservation to confirmed status and send confirmation notification.

Response: 200 with updated reservation (status="confirmed").

### DELETE /restaurants/:id/reservations/:reservationId

Cancel a reservation (status becomes "cancelled") and send cancellation notification.

Response: 200 with updated reservation (status="cancelled").

### GET /restaurants/:id/waitlist?date=YYYY-MM-DD&[page=1]&[pageSize=20]

List customers on the waitlist for a specific date (paginated).

Response shape:

```json
{
  "data": [
    {
      "id": 1,
      "restaurantId": 1,
      "customerName": "Bob",
      "phone": "987-654",
      "partySize": 2,
      "preferredDate": "2024-01-01",
      "createdAt": "2024-01-08T..Z"
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

### DELETE /restaurants/:id/waitlist/:waitlistId

Remove a customer from the waitlist.

Response: 200 with success message.

## Business Rules

- No bookings outside operating hours.
- Party size must fit table capacity.
- Overlaps are blocked: existing.start < new.end AND existing.end > new.start.
- Simple seating optimization: smallest-capacity available table is chosen when `tableId` omitted.
- **Waitlist fallback**: If no tables available, customer is automatically added to waitlist (with `onWaitlist: true` in response).
- **Peak hours**: When peak hours are configured (peakHourStart/peakHourEnd), durations are limited to maxPeakDurationMinutes if provided.
- **Reservation statuses**: "pending" (initial), "confirmed" (after explicit confirm endpoint), "cancelled" (after delete endpoint), "completed" (reserved for future use).
- **Notifications**: Confirmation/cancellation messages logged to stdout (mock SMS/email; integrate Twilio/SendGrid in production).
- Rate limited to 100 req/min (tunable).
- Availability/time-slot responses cached for 60s per parameter tuple.

## Design Notes

- Prisma schema lives in `prisma/schema.prisma`; run `npx prisma db push` to sync.
- Zod handles request validation; `AppError` standardizes error responses.
- Pagination uses `page` + `pageSize` with defaults 1/20 and max 100.
- Availability/time-slot caching uses Redis TTL; cache invalidated on writes.

## Known Limitations / Future Work

- Operating hours assume same-day start/end in local time.
- No auth / multi-tenant scoping beyond `restaurant_id` path parameter.
- Peak hour duration limits are simple (absolute max); could add dynamic capacity constraints.
- Waitlist auto-notification upon table availability (currently manual removal required).
- Notifications are logged to stdout; integrate with Twilio/SendGrid/email service in production.
- No soft-delete or audit logging for reservations.

## Scaling Thoughts (high level)

- Add Redis-backed cache and job queue for confirmations.
- Add Docker healthchecks, observability, and tracing.
- Introduce allocation engine to choose optimal seating across multiple tables/merges.

## Docker

`docker-compose.yml` runs Postgres, Redis, and the app:

```bash
docker-compose up --build
```

The app listens on `localhost:3000`; Postgres on `localhost:5432` with user/password `postgres/postgres`.
