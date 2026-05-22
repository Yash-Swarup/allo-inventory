// src/app/api/cron/expire-reservations/route.ts
//
// Registered in vercel.json as a cron that runs every minute.
// Secured with a shared secret so only Vercel's scheduler can call it.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find all PENDING reservations past their expiry
  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: new Date() },
    },
    select: { id: true, productId: true, warehouseId: true, quantity: true },
  });

  if (expired.length === 0) {
    return NextResponse.json({ released: 0 });
  }

  // Release each in a transaction to keep stock consistent
  let released = 0;
  for (const r of expired) {
    try {
      await prisma.$transaction([
        prisma.$executeRaw`
          UPDATE "Stock"
          SET reserved = GREATEST(0, reserved - ${r.quantity})
          WHERE "productId" = ${r.productId}
            AND "warehouseId" = ${r.warehouseId}
        `,
        prisma.reservation.update({
          where: { id: r.id },
          data: { status: "RELEASED" },
        }),
      ]);
      released++;
    } catch (e) {
      console.error(`Failed to release reservation ${r.id}:`, e);
    }
  }

  console.log(`[cron] Released ${released} expired reservations.`);
  return NextResponse.json({ released });
}
