import { AppError } from "../errors";
import { prisma } from "../prisma";
import { computeEnd, withinOperatingHours } from "../utils/time";
import { availableTables, getRestaurant, getTable } from "./restaurantService";
import { getOrSet, invalidatePrefix } from "../cache";
import { sendConfirmation, sendCancellation } from "./notificationService";
import { addToWaitlist } from "./waitlistService";

function isPeakHours(restaurant: any, startTime: Date): boolean {
  if (!restaurant.peakHourStart || !restaurant.peakHourEnd) return false;
  const [ph, pm] = restaurant.peakHourStart.split(":").map(Number);
  const [ch, cm] = restaurant.peakHourEnd.split(":").map(Number);
  const h = startTime.getUTCHours();
  const m = startTime.getUTCMinutes();
  const startMinutes = h * 60 + m;
  const peakStart = ph * 60 + pm;
  const peakEnd = ch * 60 + cm;
  return startMinutes >= peakStart && startMinutes < peakEnd;
}

export async function createReservation(
  restaurantId: number,
  input: {
    customerName: string;
    phone: string;
    partySize: number;
    startTime: string;
    durationMinutes: number;
    tableId?: number;
  }
) {
  const restaurant = await getRestaurant(restaurantId);
  const endTime = computeEnd(input.startTime, input.durationMinutes);

  if (!withinOperatingHours(input.startTime, endTime, restaurant.openTime, restaurant.closeTime)) {
    throw new AppError("Reservation outside operating hours", 400);
  }

  // Peak hour duration limiting
  let actualDuration = input.durationMinutes;
  if (isPeakHours(restaurant, new Date(input.startTime)) && restaurant.maxPeakDurationMinutes) {
    if (input.durationMinutes > restaurant.maxPeakDurationMinutes) {
      actualDuration = restaurant.maxPeakDurationMinutes;
    }
  }

  const actualEndTime = computeEnd(input.startTime, actualDuration);

  let table;

  if (input.tableId) {
    table = await getTable(input.tableId);
    if (table.restaurantId !== restaurantId) {
      throw new AppError("Table does not belong to restaurant", 400);
    }
    if (input.partySize > table.capacity) {
      throw new AppError("Party size exceeds table capacity", 400);
    }
    const free = await isTableFree(table.id, restaurantId, input.startTime, actualEndTime);
    if (!free) {
      throw new AppError("Table not available for requested time", 409);
    }
  } else {
    const options = await availableTables(restaurantId, input.startTime, actualEndTime, input.partySize);
    if (options.length === 0) {
      // No available tables: add to waitlist instead
      const waitlistEntry = await addToWaitlist(restaurantId, {
        customerName: input.customerName,
        phone: input.phone,
        partySize: input.partySize,
        preferredDate: input.startTime.split("T")[0],
      });
      return { ...waitlistEntry, onWaitlist: true };
    }
    table = options[0]; // simple seating optimization: pick smallest capacity that fits
  }

  const created = await prisma.reservation.create({
    data: {
      restaurantId,
      tableId: table.id,
      customerName: input.customerName,
      phone: input.phone,
      partySize: input.partySize,
      startTime: new Date(input.startTime),
      endTime: new Date(actualEndTime),
      status: "pending",
    },
  });

  // Send confirmation notification
  await sendConfirmation(
    created.customerName,
    created.phone,
    created.id,
    restaurant.name,
    created.startTime,
    created.partySize
  );

  await invalidatePrefix(`availability:${restaurantId}:`);
  await invalidatePrefix(`timeslots:${restaurantId}:`);
  await invalidatePrefix(`reservations:${restaurantId}:`);

  return created;
}

export async function getReservation(id: number) {
  const row = await prisma.reservation.findUnique({ where: { id } });
  if (!row) {
    throw new AppError("Reservation not found", 404);
  }
  return row;
}

export async function listReservationsForDate(
  restaurantId: number,
  date: string,
  page: number,
  pageSize: number
) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  const [total, data] = await prisma.$transaction([
    prisma.reservation.count({
      where: { restaurantId, startTime: { gte: start, lte: end } },
    }),
    prisma.reservation.findMany({
      where: { restaurantId, startTime: { gte: start, lte: end } },
      orderBy: { startTime: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function isTableFree(
  tableId: number,
  restaurantId: number,
  startIso: string,
  endIso: string
) {
  const conflict = await prisma.reservation.findFirst({
    where: {
      tableId,
      restaurantId,
      status: { in: ["pending", "confirmed"] },
      startTime: { lt: new Date(endIso) },
      endTime: { gt: new Date(startIso) },
    },
    select: { id: true },
  });
  return !conflict;
}

export async function cancelReservation(id: number, restaurantId: number) {
  const reservation = await getReservation(id);
  if (reservation.restaurantId !== restaurantId) {
    throw new AppError("Reservation does not belong to restaurant", 400);
  }
  if (reservation.status === "cancelled") {
    throw new AppError("Reservation already cancelled", 400);
  }

  const restaurant = await getRestaurant(restaurantId);
  const updated = await prisma.reservation.update({
    where: { id },
    data: { status: "cancelled" },
  });

  await sendCancellation(
    reservation.customerName,
    reservation.phone,
    id,
    restaurant.name
  );
  await invalidatePrefix(`availability:${restaurantId}:`);
  await invalidatePrefix(`reservations:${restaurantId}:`);

  return updated;
}

export async function modifyReservation(
  id: number,
  restaurantId: number,
  input: { startTime?: string; durationMinutes?: number }
) {
  const reservation = await getReservation(id);
  if (reservation.restaurantId !== restaurantId) {
    throw new AppError("Reservation does not belong to restaurant", 400);
  }
  if (reservation.status !== "pending") {
    throw new AppError("Can only modify pending reservations", 400);
  }

  const newStartTime = input.startTime ? new Date(input.startTime) : reservation.startTime;
  const newDuration = input.durationMinutes || Math.round((reservation.endTime.getTime() - reservation.startTime.getTime()) / 60000);
  const newEndTime = computeEnd(newStartTime.toISOString(), newDuration);

  const restaurant = await getRestaurant(restaurantId);
  if (!withinOperatingHours(newStartTime.toISOString(), newEndTime, restaurant.openTime, restaurant.closeTime)) {
    throw new AppError("New time slot outside operating hours", 400);
  }

  const free = await isTableFree(reservation.tableId!, restaurantId, newStartTime.toISOString(), newEndTime);
  if (!free) {
    throw new AppError("New time slot not available", 409);
  }

  const updated = await prisma.reservation.update({
    where: { id },
    data: {
      startTime: newStartTime,
      endTime: new Date(newEndTime),
    },
  });

  await invalidatePrefix(`availability:${restaurantId}:`);
  await invalidatePrefix(`reservations:${restaurantId}:`);

  return updated;
}

export async function confirmReservation(id: number, restaurantId: number) {
  const reservation = await getReservation(id);
  if (reservation.restaurantId !== restaurantId) {
    throw new AppError("Reservation does not belong to restaurant", 400);
  }
  if (reservation.status !== "pending") {
    throw new AppError("Can only confirm pending reservations", 400);
  }

  const updated = await prisma.reservation.update({
    where: { id },
    data: { status: "confirmed", notified: true },
  });

  const restaurant = await getRestaurant(restaurantId);
  if (!updated.notified) {
    await sendConfirmation(
      updated.customerName,
      updated.phone,
      updated.id,
      restaurant.name,
      updated.startTime,
      updated.partySize
    );
  }

  return updated;
}

export async function availableTimeSlots(
  restaurantId: number,
  date: string,
  partySize: number,
  durationMinutes: number,
  intervalMinutes = 30
) {
    const cacheKey = `timeslots:${restaurantId}:${date}:${partySize}:${durationMinutes}:${intervalMinutes}`;
  return getOrSet(cacheKey, 60, async () => {
    const restaurant = await getRestaurant(restaurantId);
    const open = `${date}T00:00:00.000Z`;
    const close = `${date}T00:00:00.000Z`;
    const [openH, openM] = restaurant.openTime.split(":").map(Number);
    const [closeH, closeM] = restaurant.closeTime.split(":").map(Number);

    const slots: string[] = [];
    let cursor = new Date(open);
    cursor.setUTCHours(openH, openM, 0, 0);
    const endOfDay = new Date(close);
    endOfDay.setUTCHours(closeH, closeM, 0, 0);

    while (cursor <= endOfDay) {
      const startIso = cursor.toISOString();
      const endIso = computeEnd(startIso, durationMinutes);
      if (withinOperatingHours(startIso, endIso, restaurant.openTime, restaurant.closeTime)) {
        const tables = await availableTables(restaurantId, startIso, endIso, partySize);
        if (tables.length > 0) {
          slots.push(startIso);
        }
      }
      cursor = new Date(cursor.getTime() + intervalMinutes * 60 * 1000);
    }
    return slots;
  });
}
