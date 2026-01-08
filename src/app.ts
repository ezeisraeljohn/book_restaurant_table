import express from "express";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { AppError } from "./errors";
import {
  addTable,
  availableTables,
  createRestaurant,
  getRestaurant,
  listTables,
} from "./services/restaurantService";
import {
  availableTimeSlots,
  createReservation,
  listReservationsForDate,
  cancelReservation,
  modifyReservation,
  confirmReservation,
} from "./services/reservationService";
import { computeEnd } from "./utils/time";
import { getOrSet } from "./cache";
import {
  addTableSchema,
  availabilityQuerySchema,
  createRestaurantSchema,
  reservationSchema,
  paginationSchema,
  timeSlotsQuerySchema,
} from "./validators";
import { sendSuccess, sendCreated } from "./responses";
import { listWaitlist, removeFromWaitlist } from "./services/waitlistService";

export const app = express();
app.use(express.json());
app.use(morgan("dev"));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (_req, res) => {
  sendSuccess(res, { status: "ok" });
});

app.post("/restaurants", async (req, res, next) => {
  try {
    const body = createRestaurantSchema.parse(req.body);
    const restaurant = await createRestaurant({
      name: body.name,
      openTime: body.openTime,
      closeTime: body.closeTime,
      totalTables: body.totalTables,
    });
    sendCreated(res, restaurant);
  } catch (err) {
    next(err);
  }
});

app.post("/restaurants/:id/tables", async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.id);
    if (Number.isNaN(restaurantId)) throw new AppError("Invalid restaurant id", 400);
    const body = addTableSchema.parse(req.body);
    const table = await addTable(restaurantId, {
      tableNumber: body.tableNumber,
      capacity: body.capacity,
    });
    sendCreated(res, table);
  } catch (err) {
    next(err);
  }
});

app.get("/restaurants/:id", async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.id);
    if (Number.isNaN(restaurantId)) throw new AppError("Invalid restaurant id", 400);
    const restaurant = await getRestaurant(restaurantId);
    const tables = await listTables(restaurantId);

    const { startTime, durationMinutes, partySize } = req.query;
    let availability;
    if (startTime && durationMinutes && partySize) {
      const parsed = availabilityQuerySchema.parse({ startTime, durationMinutes, partySize });
      const end = computeEnd(parsed.startTime, parsed.durationMinutes);
      const cacheKey = `availability:${restaurantId}:${parsed.startTime}:${parsed.durationMinutes}:${parsed.partySize}`;
      availability = await getOrSet(cacheKey, 60, () =>
        availableTables(restaurantId, parsed.startTime, end, parsed.partySize)
      );
    }

    sendSuccess(res, { restaurant, tables, availableTables: availability ?? [] });
  } catch (err) {
    next(err);
  }
});

app.get("/restaurants/:id/reservations", async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.id);
    const { date } = req.query as { date?: string };
    if (!date) throw new AppError("date query param required (YYYY-MM-DD)", 400);
    const { page, pageSize } = paginationSchema.parse(req.query);
    const reservations = await listReservationsForDate(restaurantId, date, page, pageSize);
    sendSuccess(res, reservations);
  } catch (err) {
    next(err);
  }
});

app.post("/restaurants/:id/reservations", async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.id);
    const body = reservationSchema.parse(req.body);
    const reservation = await createReservation(restaurantId, {
      customerName: body.customerName,
      phone: body.phone,
      partySize: body.partySize,
      startTime: body.startTime,
      durationMinutes: body.durationMinutes,
      tableId: body.tableId,
    });
    sendCreated(res, reservation);
  } catch (err) {
    next(err);
  }
});

app.get("/restaurants/:id/availability", async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.id);
    const parsed = availabilityQuerySchema.parse(req.query);
    const end = computeEnd(parsed.startTime, parsed.durationMinutes);
    const cacheKey = `availability:${restaurantId}:${parsed.startTime}:${parsed.durationMinutes}:${parsed.partySize}`;
    const tables = await getOrSet(cacheKey, 60, () =>
      availableTables(restaurantId, parsed.startTime, end, parsed.partySize)
    );
    sendSuccess(res, { availableTables: tables });
  } catch (err) {
    next(err);
  }
});

app.get("/restaurants/:id/time-slots", async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.id);
    const parsed = timeSlotsQuerySchema.parse(req.query);
    const slots = await availableTimeSlots(
      restaurantId,
      parsed.date,
      parsed.partySize,
      parsed.durationMinutes
    );
    sendSuccess(res, { slots });
  } catch (err) {
    next(err);
  }
});

// Reservation status endpoints
app.patch("/restaurants/:id/reservations/:reservationId", async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.id);
    const reservationId = Number(req.params.reservationId);
    if (Number.isNaN(restaurantId) || Number.isNaN(reservationId)) {
      throw new AppError("Invalid restaurant or reservation id", 400);
    }
    const updated = await modifyReservation(reservationId, restaurantId, req.body);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

app.post("/restaurants/:id/reservations/:reservationId/confirm", async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.id);
    const reservationId = Number(req.params.reservationId);
    if (Number.isNaN(restaurantId) || Number.isNaN(reservationId)) {
      throw new AppError("Invalid restaurant or reservation id", 400);
    }
    const updated = await confirmReservation(reservationId, restaurantId);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

app.delete("/restaurants/:id/reservations/:reservationId", async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.id);
    const reservationId = Number(req.params.reservationId);
    if (Number.isNaN(restaurantId) || Number.isNaN(reservationId)) {
      throw new AppError("Invalid restaurant or reservation id", 400);
    }
    const updated = await cancelReservation(reservationId, restaurantId);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

// Waitlist endpoints
app.get("/restaurants/:id/waitlist", async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.id);
    if (Number.isNaN(restaurantId)) throw new AppError("Invalid restaurant id", 400);
    const { date } = req.query as { date?: string };
    if (!date) throw new AppError("date query param required (YYYY-MM-DD)", 400);
    const { page, pageSize } = paginationSchema.parse(req.query);
    const waitlist = await listWaitlist(restaurantId, date, page, pageSize);
    sendSuccess(res, waitlist);
  } catch (err) {
    next(err);
  }
});

app.delete("/restaurants/:id/waitlist/:waitlistId", async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.id);
    const waitlistId = Number(req.params.waitlistId);
    if (Number.isNaN(restaurantId) || Number.isNaN(waitlistId)) {
      throw new AppError("Invalid restaurant or waitlist id", 400);
    }
    await removeFromWaitlist(waitlistId, restaurantId);
    sendSuccess(res, { message: "Waitlist entry removed" });
  } catch (err) {
    next(err);
  }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.name === "ZodError") {
    return res.status(400).json({ error: "Validation failed", details: err.errors });
  }
  const status = err instanceof AppError ? err.status : 500;
  const message = err instanceof AppError ? err.message : "Internal server error";
  res.status(status).json({ error: message });
});
