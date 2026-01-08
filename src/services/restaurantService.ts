import { Prisma } from "@prisma/client";
import { AppError } from "../errors";
import { prisma } from "../prisma";
import { invalidatePrefix } from "../cache";

export async function createRestaurant(input: {
  name: string;
  openTime: string;
  closeTime: string;
  totalTables: number;
}) {
  return prisma.restaurant.create({
    data: {
      name: input.name,
      openTime: input.openTime,
      closeTime: input.closeTime,
      totalTables: input.totalTables,
    },
  });
}

export async function getRestaurant(id: number) {
  const row = await prisma.restaurant.findUnique({ where: { id } });
  if (!row) {
    throw new AppError("Restaurant not found", 404);
  }
  return row;
}

export async function addTable(restaurantId: number, input: { tableNumber: string; capacity: number }) {
  try {
    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId,
        tableNumber: input.tableNumber,
        capacity: input.capacity,
      },
    });
      await invalidatePrefix(`availability:${restaurantId}:`);
      await invalidatePrefix(`timeslots:${restaurantId}:`);
    return table;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("Table number already exists for this restaurant", 409);
    }
    throw err;
  }
}

export async function getTable(id: number) {
  const row = await prisma.restaurantTable.findUnique({ where: { id } });
  if (!row) {
    throw new AppError("Table not found", 404);
  }
  return row;
}

export function listTables(restaurantId: number) {
  return prisma.restaurantTable.findMany({
    where: { restaurantId },
    orderBy: { tableNumber: "asc" },
  });
}

export async function availableTables(
  restaurantId: number,
  startIso: string,
  endIso: string,
  minCapacity: number
) {
  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId, capacity: { gte: minCapacity } },
    orderBy: { capacity: "asc" },
  });

  const conflicts = await prisma.reservation.findMany({
    where: {
      restaurantId,
      status: { in: ["pending", "confirmed"] },
      startTime: { lt: new Date(endIso) },
      endTime: { gt: new Date(startIso) },
    },
    select: { tableId: true },
  });

  const blocked = new Set(conflicts.map((c) => c.tableId));
  return tables.filter((t) => !blocked.has(t.id));
}
