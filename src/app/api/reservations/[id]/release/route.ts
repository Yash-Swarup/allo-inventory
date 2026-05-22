// src/app/api/reservations/[id]/release/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const released = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id } });

      if (!reservation) {
        throw new NotFoundError("Reservation not found.");
      }
      if (reservation.status !== "PENDING") {
        // Already released or confirmed — idempotent no-op
        return reservation;
      }

      // Return units to available pool
      await tx.$executeRaw`
        UPDATE "Stock"
        SET reserved = GREATEST(0, reserved - ${reservation.quantity})
        WHERE "productId" = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
      `;

      return tx.reservation.update({
        where: { id },
        data: { status: "RELEASED" },
      });
    });

    return NextResponse.json(released);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "NOT_FOUND", message: err.message }, { status: 404 });
    }
    console.error("[POST /api/reservations/:id/release]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Something went wrong." }, { status: 500 });
  }
}

class NotFoundError extends Error {}
