// src/app/api/products/route.ts
// GET /api/products — returns all products with per-warehouse inventory.
//
// Lazy expiration: before computing available stock we release any pending
// reservations whose expiresAt has passed, restoring their reserved stock.
// This means no background job is required — stock automatically corrects
// itself on each read.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // 1. Lazy-expire overdue reservations
    const now = new Date();

    const expired = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: {
          lt: now,
        },
      },
      select: {
        id: true,
        productId: true,
        warehouseId: true,
        quantity: true,
      },
    });

    // 2. Restore reserved stock
    if (expired.length > 0) {
      await prisma.$transaction(
        expired.map((r) =>
          prisma.stockLevel.update({
            where: {
              productId_warehouseId: {
                productId: r.productId,
                warehouseId: r.warehouseId,
              },
            },
            data: {
              reservedUnits: {
                decrement: r.quantity,
              },
            },
          })
        )
      );

      // 3. Mark reservations as released
      await prisma.reservation.updateMany({
        where: {
          id: {
            in: expired.map((r) => r.id),
          },
        },
        data: {
          status: "RELEASED",
          releasedAt: now,
        },
      });
    }

    // 4. Fetch products with stock levels
    const products = await prisma.product.findMany({
      include: {
        stockLevels: {
          include: {
            warehouse: true,
          },
          orderBy: {
            warehouse: {
              name: "asc",
            },
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    // 5. Shape response
    const shaped = products.map((p) => ({
      ...p,
      price: Number(p.price),

      stockLevels: p.stockLevels.map((inv) => ({
        ...inv,

        availableStock: Math.max(
          0,
          inv.totalUnits - inv.reservedUnits
        ),
      })),
    }));

    return NextResponse.json(shaped);
  } catch (error) {
    console.error("[GET /api/products]", error);

    return NextResponse.json(
      {
        error: "Failed to fetch products",
      },
      {
        status: 500,
      }
    );
  }
}