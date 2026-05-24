// scripts/seed.ts
// Run with: npm run seed

import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean existing data in correct dependency order
  await prisma.idempotencyRecord.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // ── Warehouses ──────────────────────────────────────────────────────────────
  const [mumbai, delhi, bangalore] = await Promise.all([
    prisma.warehouse.create({
      data: { name: "Mumbai Central", location: "Mumbai, Maharashtra" },
    }),
    prisma.warehouse.create({
      data: { name: "Delhi North Hub", location: "Delhi, NCR" },
    }),
    prisma.warehouse.create({
      data: { name: "Bangalore Tech Park", location: "Bangalore, Karnataka" },
    }),
  ]);

  console.log("✅ Warehouses created");

  // ── Products ─────────────────────────────────────────────────────────────────
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Sony WH-1000XM5 Headphones",
        description:
          "Industry-leading noise cancelling headphones with 30-hour battery life and crystal clear hands-free calling.",
        price: new Decimal("29999.00"),
        sku: "SONY-WH1000XM5-BLK",
        imageUrl:
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Apple AirPods Pro (2nd Gen)",
        description:
          "Active Noise Cancellation up to 2x more powerful, Adaptive Transparency, and Personalized Spatial Audio.",
        price: new Decimal("24900.00"),
        sku: "APPLE-APP-2GEN-WHT",
        imageUrl:
          "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Samsung Galaxy Tab S9",
        description:
          "11-inch Dynamic AMOLED 2X display, Snapdragon 8 Gen 2, 8GB RAM — built for work and play.",
        price: new Decimal("72999.00"),
        sku: "SAMSUNG-GTS9-GRY",
        imageUrl:
          "https://images.unsplash.com/photo-1561154464-82e9adf32764?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Logitech MX Master 3S",
        description:
          "Advanced wireless mouse with 8K DPI sensor, whisper-quiet clicks, and MagSpeed electromagnetic scrolling.",
        price: new Decimal("8995.00"),
        sku: "LOGI-MXM3S-GRY",
        imageUrl:
          "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Keychron K2 Pro Keyboard",
        description:
          "75% layout mechanical keyboard with QMK/VIA support, hot-swappable switches, and RGB backlighting.",
        price: new Decimal("11999.00"),
        sku: "KEYCHRON-K2PRO-BLK",
        imageUrl:
          "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Anker 737 Power Bank",
        description:
          "24,000mAh high-capacity power bank with 140W output — charges MacBook Pro in under 2 hours.",
        price: new Decimal("12999.00"),
        sku: "ANKER-737-BLK",
        imageUrl:
          "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400",
      },
    }),
  ]);

  console.log("✅ Products created");

  // ── Inventory ─────────────────────────────────────────────────────────────────
  // Deliberately make some SKUs scarce to demonstrate the concurrency feature
  const inventoryData = [
    // Sony Headphones — scarce in Mumbai to demo race condition
    { productId: products[0].id, warehouseId: mumbai.id, totalStock: 2 },
    { productId: products[0].id, warehouseId: delhi.id, totalStock: 15 },
    { productId: products[0].id, warehouseId: bangalore.id, totalStock: 8 },

    // AirPods Pro — low stock everywhere
    { productId: products[1].id, warehouseId: mumbai.id, totalStock: 5 },
    { productId: products[1].id, warehouseId: delhi.id, totalStock: 1 }, // 1 left!
    { productId: products[1].id, warehouseId: bangalore.id, totalStock: 3 },

    // Galaxy Tab S9
    { productId: products[2].id, warehouseId: mumbai.id, totalStock: 12 },
    { productId: products[2].id, warehouseId: delhi.id, totalStock: 7 },
    { productId: products[2].id, warehouseId: bangalore.id, totalStock: 20 },

    // MX Master 3S
    { productId: products[3].id, warehouseId: mumbai.id, totalStock: 30 },
    { productId: products[3].id, warehouseId: bangalore.id, totalStock: 25 },

    // Keychron
    { productId: products[4].id, warehouseId: delhi.id, totalStock: 10 },
    { productId: products[4].id, warehouseId: bangalore.id, totalStock: 6 },

    // Anker Power Bank
    { productId: products[5].id, warehouseId: mumbai.id, totalStock: 50 },
    { productId: products[5].id, warehouseId: delhi.id, totalStock: 40 },
    { productId: products[5].id, warehouseId: bangalore.id, totalStock: 35 },
  ];

  await prisma.inventory.createMany({ data: inventoryData });

  console.log("✅ Inventory created");
  console.log("\n🎉 Seed complete! Summary:");
  console.log(`   • ${3} warehouses`);
  console.log(`   • ${products.length} products`);
  console.log(`   • ${inventoryData.length} inventory records`);
  console.log("\n   Scarce items to demo concurrency:");
  console.log("   • Sony WH-1000XM5 in Mumbai: 2 units");
  console.log("   • AirPods Pro in Delhi: 1 unit ← reserve this!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
