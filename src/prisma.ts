import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

export const prisma = new PrismaClient();

// Allow tests to cleanly shutdown if needed
export async function disconnectPrisma() {
  await prisma.$disconnect();
}
