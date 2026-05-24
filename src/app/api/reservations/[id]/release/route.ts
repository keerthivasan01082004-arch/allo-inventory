// src/app/api/reservations/[id]/release/route.ts
// POST /api/reservations/:id/release
//
// Releases a PENDING reservation early (payment failed or user cancelled).
// Restores the reserved stock back to available.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const reservation = await prisma.reservation.findUnique({ where: { id } });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    if (reservation.status === "RELEASED") {
      return NextResponse.json(
        { error: "Reservation is already released" },
        { status: 409 }
      );
    }

    if (reservation.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "Cannot release a confirmed reservation" },
        { status: 409 }
      );
    }

    // Release: restore reservedStock and mark as released
    const [updated] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: { status: "RELEASED", releasedAt: new Date() },
        include: { product: true, warehouse: true },
      }),
      prisma.inventory.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: { reservedStock: { decrement: reservation.quantity } },
      }),
    ]);

    return NextResponse.json({
      reservation: {
        ...updated,
        product: { ...updated.product, price: Number(updated.product.price) },
      },
    });
  } catch (error) {
    console.error("[POST /api/reservations/:id/release]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
