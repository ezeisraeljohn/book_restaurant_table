import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { execSync } from "node:child_process";
// Force a test DB URL (can override via TEST_DATABASE_URL)
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5433/reservation_test?schema=public";
// So Redis absence won't break tests
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
let app;
let prisma;
let disconnectPrisma;
describe("Reservations", () => {
    beforeAll(async () => {
        // Ensure database exists
        const dbUrl = new URL(process.env.DATABASE_URL);
        const dbName = dbUrl.pathname.replace(/^\//, "").split("?")[0];
        const adminUrl = new URL(process.env.DATABASE_URL);
        adminUrl.pathname = "/postgres";
        const client = new Client({ connectionString: adminUrl.toString() });
        await client.connect();
        try {
            await client.query(`CREATE DATABASE "${dbName}"`);
        }
        catch (e) {
            // 42P04: duplicate_database
            if (!(e && e.code === "42P04"))
                throw e;
        }
        finally {
            await client.end();
        }
        // Push Prisma schema
        execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
        // Import app and prisma after env + db setup
        ({ app } = await import("../src/app"));
        const prismaModule = await import("../src/prisma");
        prisma = prismaModule.prisma;
        disconnectPrisma = prismaModule.disconnectPrisma;
    });
    afterEach(() => {
        return prisma.$transaction([
            prisma.reservation.deleteMany(),
            prisma.waitlist.deleteMany(),
            prisma.restaurantTable.deleteMany(),
            prisma.restaurant.deleteMany(),
        ]);
    });
    // ensure clean disconnect in watch mode
    afterAll(async () => {
        await disconnectPrisma();
    });
    const restaurantPayload = {
        name: "Test Restaurant",
        openTime: "10:00",
        closeTime: "22:00",
        totalTables: 10,
    };
    it("creates restaurant, table, and reservation", async () => {
        const restaurantRes = await request(app).post("/restaurants").send(restaurantPayload);
        expect(restaurantRes.status).toBe(201);
        const restaurantId = restaurantRes.body.id;
        const tableRes = await request(app)
            .post(`/restaurants/${restaurantId}/tables`)
            .send({ tableNumber: "A1", capacity: 4 });
        expect(tableRes.status).toBe(201);
        const reservationRes = await request(app)
            .post(`/restaurants/${restaurantId}/reservations`)
            .send({
            customerName: "Alice",
            phone: "123",
            partySize: 4,
            startTime: "2024-01-01T19:00:00.000Z",
            durationMinutes: 120,
            tableId: tableRes.body.id,
        });
        expect(reservationRes.status).toBe(201);
        expect(reservationRes.body.tableId).toBe(tableRes.body.id);
    });
    it("prevents overlapping bookings on the same table", async () => {
        const restaurantId = (await request(app).post("/restaurants").send(restaurantPayload)).body.id;
        const tableId = (await request(app).post(`/restaurants/${restaurantId}/tables`).send({ tableNumber: "A1", capacity: 4 })).body.id;
        const first = await request(app)
            .post(`/restaurants/${restaurantId}/reservations`)
            .send({
            customerName: "Alice",
            phone: "123",
            partySize: 4,
            startTime: "2024-01-01T19:00:00.000Z",
            durationMinutes: 120,
            tableId,
        });
        expect(first.status).toBe(201);
        const second = await request(app)
            .post(`/restaurants/${restaurantId}/reservations`)
            .send({
            customerName: "Bob",
            phone: "999",
            partySize: 2,
            startTime: "2024-01-01T20:00:00.000Z",
            durationMinutes: 60,
            tableId,
        });
        expect(second.status).toBe(409);
    });
    it("rejects reservation when party exceeds capacity", async () => {
        const restaurantId = (await request(app).post("/restaurants").send(restaurantPayload)).body.id;
        const tableId = (await request(app).post(`/restaurants/${restaurantId}/tables`).send({ tableNumber: "A1", capacity: 4 })).body.id;
        const res = await request(app)
            .post(`/restaurants/${restaurantId}/reservations`)
            .send({
            customerName: "Large Party",
            phone: "777",
            partySize: 6,
            startTime: "2024-01-01T12:00:00.000Z",
            durationMinutes: 60,
            tableId,
        });
        expect(res.status).toBe(400);
    });
});
