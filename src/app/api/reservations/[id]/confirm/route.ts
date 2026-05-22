// src/app/api/reservations/[id]/confirm/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const confirmed = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id } });

      if (!reservation) {
        throw new NotFoundError("Reservation not found.");
      }
      if (reservation.status === "CONFIRMED") {
        // Idempotent: already confirmed, return it as-is
        return reservation;
      }
      if (reservation.status === "RELEASED") {
        throw new GoneError("Reservation was already released.");
      }
      if (new Date() > reservation.expiresAt) {
        // Lazy expiry: mark it released and free the stock
        await tx.$executeRaw`
          UPDATE "Stock"
          SET reserved = GREATEST(0, reserved - ${reservation.quantity})
          WHERE "productId" = ${reservation.productId}
            AND "warehouseId" = ${reservation.warehouseId}
        `;
        await tx.reservation.update({
          where: { id },
          data: { status: "RELEASED" },
        });
        throw new GoneError("Reservation has expired.");
      }

      // Permanently decrement stock: reserved → sold (both reserved and total go down)
      await tx.$executeRaw`
        UPDATE "Stock"
        SET total    = GREATEST(0, total    - ${reservation.quantity}),
            reserved = GREATEST(0, reserved - ${reservation.quantity})
        WHERE "productId" = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
      `;

      return tx.reservation.update({
        where: { id },
        data: { status: "CONFIRMED" },
      });
    });

    return NextResponse.json(confirmed);
  } catch (err) {
    if (err instanceof GoneError) {
      return NextResponse.json({ error: "GONE", message: err.message }, { status: 410 });
    }
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "NOT_FOUND", message: err.message }, { status: 404 });
    }
    console.error("[POST /api/reservations/:id/confirm]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Something went wrong." }, { status: 500 });
  }
}

class GoneError extends Error {}
class NotFoundError extends Error {}
