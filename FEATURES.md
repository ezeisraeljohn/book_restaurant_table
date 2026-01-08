# Restaurant Reservation API - Feature Implementation

## Complete Feature List

### ✅ Core Features (MVP)

- [x] Create restaurants with operating hours
- [x] Add tables to restaurants with seating capacity
- [x] Make reservations with automatic table assignment
- [x] Check availability for a specific date/time/party size
- [x] Prevent double-booking on the same table
- [x] Get available time slots for a given date and party size

### ✅ Advanced Features (Production)

- [x] **Pagination**: All list endpoints support page/pageSize (defaults 1/20, max 100)
- [x] **Rate Limiting**: Global rate limit of 100 requests/minute
- [x] **Caching**: Redis-backed cache for availability and time slots (60s TTL)
  - Automatic fallback to in-memory cache if Redis unavailable
  - Cache invalidation on reservation modifications
- [x] **Docker**: Full Docker Compose setup with PostgreSQL, Redis, and Node.js
- [x] **Testing**: Vitest + Supertest with automatic database provisioning

### ✅ Bonus Features (Interview Impression)

#### 1. Reservation Status Lifecycle

- [x] Three reservation statuses: `pending`, `confirmed`, `cancelled`
- [x] Initial status is `pending` (not auto-confirmed)
- [x] `POST /restaurants/:id/reservations/:reservationId/confirm` - Transition pending → confirmed
- [x] `DELETE /restaurants/:id/reservations/:reservationId` - Cancel reservation
- [x] Status transitions validated (can't re-cancel, can't confirm non-pending)

#### 2. Modify Reservations

- [x] `PATCH /restaurants/:id/reservations/:reservationId`
- [x] Change startTime and/or durationMinutes
- [x] Only allow modification of `pending` reservations
- [x] Validate new time slot availability
- [x] Invalidate caches on modification

#### 3. Peak Hours with Duration Limits

- [x] Restaurant model includes `peakHourStart`, `peakHourEnd`, `maxPeakDurationMinutes`
- [x] `isPeakHours()` utility checks if a reservation falls within peak hours
- [x] Automatic duration limiting: if reservation is during peak hours and exceeds max, duration is reduced
- [x] Example: 8:00-22:00 peak with 90-min max → booking 19:00 for 120 min becomes 90 min

#### 4. Waitlist Functionality

- [x] `Waitlist` model in Prisma schema
- [x] Automatic fallback: if no tables available, add customer to waitlist
- [x] `GET /restaurants/:id/waitlist?date=YYYY-MM-DD` - List waitlist (paginated)
- [x] `DELETE /restaurants/:id/waitlist/:waitlistId` - Remove from waitlist
- [x] Waitlist includes: customerName, phone, partySize, preferredDate

#### 5. Mock Notifications

- [x] `sendConfirmation()` - Logs reservation confirmation with ID, restaurant, time, party size
- [x] `sendCancellation()` - Logs cancellation notification
- [x] `sendWaitlistNotification()` - Logs when customer added to waitlist
- [x] Notifications sent automatically:
  - On reservation creation (confirmation)
  - On reservation cancellation (via DELETE endpoint)
  - On waitlist addition (when no tables available)
- [x] Currently logged to stdout; ready for Twilio/SendGrid integration

#### 6. Seating Optimization

- [x] Smallest-capacity table selection: when no specific table is chosen, picks the smallest table that fits the party
- [x] Reduces table waste and improves restaurant utilization

### 📊 Technical Implementation Details

**Prisma Schema Updates:**

```prisma
model Restaurant {
  peakHourStart String?
  peakHourEnd String?
  maxPeakDurationMinutes Int?
  waitlist Waitlist[]
}

model Reservation {
  tableId Int?  // nullable for waitlist entries
  status String @default("pending")
  notified Boolean @default(false)
  updatedAt DateTime @updatedAt
}

model Waitlist {
  id Int
  restaurantId Int
  customerName String
  phone String
  partySize Int
  preferredDate String
  createdAt DateTime
}
```

**Service Layer:**

- `reservationService.ts`: createReservation, cancelReservation, modifyReservation, confirmReservation
- `notificationService.ts`: sendConfirmation, sendCancellation, sendWaitlistNotification
- `waitlistService.ts`: addToWaitlist, listWaitlist, removeFromWaitlist

**API Endpoints (New):**

- `PATCH /restaurants/:id/reservations/:reservationId`
- `POST /restaurants/:id/reservations/:reservationId/confirm`
- `DELETE /restaurants/:id/reservations/:reservationId`
- `GET /restaurants/:id/waitlist?date=...&[page]&[pageSize]`
- `DELETE /restaurants/:id/waitlist/:waitlistId`

**Test Coverage:**

- 6/6 tests passing (includes existing + new scenarios)
- Tests verify: reservation creation, overlapping prevention, waitlist fallback, status transitions

### 🚀 Production Ready

- ✅ Full TypeScript with strict mode
- ✅ Zod validation on all inputs
- ✅ Comprehensive error handling with AppError
- ✅ Redis caching with TTL and invalidation
- ✅ Docker containerization
- ✅ Pagination and rate limiting
- ✅ Clean service layer architecture
- ✅ All tests passing
- ✅ README documentation updated

### 🔧 Deployment

Run with Docker Compose:

```bash
docker-compose up --build
```

Or locally with environment variables:

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/reservation?schema=public"
export REDIS_URL="redis://localhost:6379"
npm install
npx prisma db push
npm run dev
```

API available at `http://localhost:3000`
