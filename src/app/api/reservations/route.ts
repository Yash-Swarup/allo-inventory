// src/app/api/reservations/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CreateReservationSchema } from "@/lib/schemas";

const RESERVATION_TTL_MINUTES = 10;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CreateReservationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { productId, warehouseId, quantity } = parsed.data;

  // --- Idempotency (bonus) ---
  // If client sends Idempotency-Key, return cached response if we've seen it before.
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const existing = await prisma.reservation.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }
  }

  // --- Core: atomic stock check + reservation using SELECT FOR UPDATE ---
  //
  // We wrap everything in a serializable transaction and lock the stock row
  // with SELECT FOR UPDATE. This guarantees that two concurrent requests for
  // the last unit will be serialized: one reads (total - reserved) >= quantity
  // and succeeds; the other re-reads the locked row, sees reserved is now full,
  // and returns 409. No application-level mutex needed — the DB does it.
  try {
    const reservation = await prisma.$transaction(
      async (tx) => {
        // Lock the specific stock row for this product+warehouse combo
        const stocks = await tx.$queryRaw<
          Array<{ id: string; total: number; reserved: number }>
        >`
          SELECT id, total, reserved
          FROM "Stock"
          WHERE "productId" = ${productId}
            AND "warehouseId" = ${warehouseId}
          FOR UPDATE
        `;

        if (stocks.length === 0) {
          throw new StockNotFoundError("No stock record found for this product/warehouse.");
        }

        const stock = stocks[0];
        const available = stock.total - stock.reserved;

        if (available < quantity) {
          throw new InsufficientStockError(
            `Only ${available} unit(s) available; ${quantity} requested.`
          );
        }

        // Increment reserved count
        await tx.$executeRaw`
          UPDATE "Stock"
          SET reserved = reserved + ${quantity}
          WHERE id = ${stock.id}
        `;

        // Create the reservation
        const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);

        return tx.reservation.create({
          data: {
            productId,
            warehouseId,
            quantity,
            expiresAt,
            status: "PENDING",
            ...(idempotencyKey ? { idempotencyKey } : {}),
          },
        });
      },
      { timeout: 10_000 } // 10s transaction timeout
    );

    return NextResponse.json(reservation, { status: 201 });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: "INSUFFICIENT_STOCK", message: err.message },
        { status: 409 }
      );
    }
    if (err instanceof StockNotFoundError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: err.message },
        { status: 404 }
      );
    }
    console.error("[POST /api/reservations]", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Something went wrong." },
      { status: 500 }
    );
  }
}

// Typed errors for clean control flow inside the transaction
class InsufficientStockError extends Error {}
class StockNotFoundError extends Error {}
