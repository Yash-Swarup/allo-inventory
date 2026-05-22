// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create warehouses
  const [mumbai, delhi, bengaluru] = await Promise.all([
    prisma.warehouse.upsert({
      where: { id: "wh_mumbai" },
      update: {},
      create: { id: "wh_mumbai", name: "Mumbai Central", location: "Mumbai, MH" },
    }),
    prisma.warehouse.upsert({
      where: { id: "wh_delhi" },
      update: {},
      create: { id: "wh_delhi", name: "Delhi North", location: "Delhi, DL" },
    }),
    prisma.warehouse.upsert({
      where: { id: "wh_bengaluru" },
      update: {},
      create: { id: "wh_bengaluru", name: "Bengaluru Hub", location: "Bengaluru, KA" },
    }),
  ]);

  // Create products
  const products = await Promise.all([
    prisma.product.upsert({
      where: { id: "prod_001" },
      update: {},
      create: {
        id: "prod_001",
        name: "Wireless Noise-Cancelling Headphones",
        description: "Premium over-ear headphones with 30hr battery life.",
      },
    }),
    prisma.product.upsert({
      where: { id: "prod_002" },
      update: {},
      create: {
        id: "prod_002",
        name: "Mechanical Keyboard TKL",
        description: "Tenkeyless layout, hot-swappable switches.",
      },
    }),
    prisma.product.upsert({
      where: { id: "prod_003" },
      update: {},
      create: {
        id: "prod_003",
        name: "USB-C Docking Station",
        description: "12-in-1 hub with 4K HDMI and 100W PD.",
      },
    }),
  ]);

  // Seed stock levels
  const stockData = [
    { productId: "prod_001", warehouseId: "wh_mumbai",   total: 10 },
    { productId: "prod_001", warehouseId: "wh_delhi",    total: 5  },
    { productId: "prod_001", warehouseId: "wh_bengaluru",total: 1  }, // intentionally scarce
    { productId: "prod_002", warehouseId: "wh_mumbai",   total: 8  },
    { productId: "prod_002", warehouseId: "wh_bengaluru",total: 3  },
    { productId: "prod_003", warehouseId: "wh_delhi",    total: 15 },
    { productId: "prod_003", warehouseId: "wh_bengaluru",total: 2  },
  ];

  for (const s of stockData) {
    await prisma.stock.upsert({
      where: { productId_warehouseId: { productId: s.productId, warehouseId: s.warehouseId } },
      update: {},
      create: { ...s, reserved: 0 },
    });
  }

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
