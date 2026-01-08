import { prisma } from "../prisma";
import { AppError } from "../errors";
import { sendWaitlistNotification } from "./notificationService";

export async function addToWaitlist(
  restaurantId: number,
  input: { customerName: string; phone: string; partySize: number; preferredDate: string }
) {
  const entry = await prisma.waitlist.create({
    data: {
      restaurantId,
      customerName: input.customerName,
      phone: input.phone,
      partySize: input.partySize,
      preferredDate: input.preferredDate,
    },
  });

  await sendWaitlistNotification(
    input.customerName,
    input.phone,
    (await prisma.restaurant.findUnique({ where: { id: restaurantId } }))!.name,
    input.partySize,
    input.preferredDate
  );

  return entry;
}

export async function listWaitlist(restaurantId: number, date: string, page: number, pageSize: number) {
  const [total, data] = await prisma.$transaction([
    prisma.waitlist.count({
      where: { restaurantId, preferredDate: date },
    }),
    prisma.waitlist.findMany({
      where: { restaurantId, preferredDate: date },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function removeFromWaitlist(waitlistId: number, restaurantId: number) {
  const entry = await prisma.waitlist.findUnique({ where: { id: waitlistId } });
  if (!entry || entry.restaurantId !== restaurantId) {
    throw new AppError("Waitlist entry not found", 404);
  }
  return prisma.waitlist.delete({ where: { id: waitlistId } });
}
