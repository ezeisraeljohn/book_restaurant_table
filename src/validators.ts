import { z } from "zod";

export const createRestaurantSchema = z.object({
  name: z.string().min(1),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
  totalTables: z.number().int().nonnegative(),
});

export const addTableSchema = z.object({
  tableNumber: z.string().min(1),
  capacity: z.number().int().positive(),
});

export const reservationSchema = z.object({
  customerName: z.string().min(1),
  phone: z.string().min(3),
  partySize: z.number().int().positive(),
  startTime: z.string().datetime(),
  durationMinutes: z.number().int().positive(),
  tableId: z.number().int().positive().optional(),
});

export const availabilityQuerySchema = z.object({
  startTime: z.string().datetime(),
  durationMinutes: z.coerce.number().int().positive(),
  partySize: z.coerce.number().int().positive(),
});

export const timeSlotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().int().positive(),
  durationMinutes: z.coerce.number().int().positive(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
