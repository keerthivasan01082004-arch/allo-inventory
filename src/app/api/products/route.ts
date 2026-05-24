// src/app/api/products/route.ts
// GET /api/products — returns all products with per-warehouse inventory.
//
// Lazy expiration: before computing available stock we release any pending
// reservations whose expiresAt has passed, restoring their reservedStock.
// This means no background job is required — stock automatically corrects
// itself on each read.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // 1. Lazy-expire: release overdue PENDING reservations and restore stock
    const now = new Date();
    const expired = await prisma.reservation.findMany({
      where: { status: "PENDING", expiresAt: { lt: now } },
      select: { id: true, productId: true, warehouseId: true, quantity: true },
    });

    if (expired.length > 0) {
      await prisma.$transaction(
        expired.map((r) =>
          prisma.inventory.update({
            where: {
              productId_warehouseId: {
                productId: r.productId,
                warehouseId: r.warehouseId,
              },
            },
            data: { reservedStock: { decrement: r.quantity } },
          })
        )
      );

      await prisma.reservation.updateMany({
        where: { id: { in: expired.map((r) => r.id) } },
        data: { status: "RELEASED", releasedAt: now },
      });
    }

    // 2. Fetch products with inventory
    const products = await prisma.product.findMany({
      include: {
        inventory: {
          include: { warehouse: true },
          orderBy: { warehouse: { name: "asc" } },
        },
      },
      orderBy: { name: "asc" },
    });

    // 3. Shape the response — add computed availableStock field
    const shaped = products.map((p) => ({
      ...p,
      price: Number(p.price),
      inventory: p.inventory.map((inv) => ({
        ...inv,
        availableStock: Math.max(0, inv.totalStock - inv.reservedStock),
      })),
    }));

    return NextResponse.json(shaped);
  } catch (error) {
    console.error("[GET /api/products]", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
