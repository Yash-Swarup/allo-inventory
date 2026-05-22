// src/app/api/products/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const products = await prisma.product.findMany({
    include: {
      stock: {
        include: { warehouse: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const data = products.map((p) => ({
    id:          p.id,
    name:        p.name,
    description: p.description,
    imageUrl:    p.imageUrl,
    stock: p.stock.map((s) => ({
      warehouseId:   s.warehouseId,
      warehouseName: s.warehouse.name,
      location:      s.warehouse.location,
      total:         s.total,
      reserved:      s.reserved,
      available:     s.total - s.reserved, // what the customer can actually buy
    })),
  }));

  return NextResponse.json(data);
}
