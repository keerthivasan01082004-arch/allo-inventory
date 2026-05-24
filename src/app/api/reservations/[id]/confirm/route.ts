// src/app/api/reservations/[id]/confirm/route.ts
// POST /api/reservations/:id/confirm
//
// Confirms a PENDING reservation (payment succeeded).
// Returns 410 Gone if the reservation has expired.
// Returns 409 Conflict if already confirmed/released.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idempotencyKey = req.headers.get("Idempotency-Key");

    const execute = async () => performConfirm(id);

    if (idempotencyKey) {
      const result = await withIdempotency(
        idempotencyKey,
        `POST /api/reservations/${id}/confirm`,
        execute
      );
      return NextResponse.json(result.body, { status: result.statusCode });
    }

    const result = await execute();
    return NextResponse.json(result.body, { status: result.statusCode });
  } catch (error) {
    console.error("[POST /api/reservations/:id/confirm]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function performConfirm(
  id: string
): Promise<{ body: unknown; statusCode: number }> {
  const reservation = await prisma.reservation.findUnique({ where: { id } });

  if (!reservation) {
    return { body: { error: "Reservation not found" }, statusCode: 404 };
  }

  if (reservation.status === "CONFIRMED") {
    return {
      body: { error: "Reservation is already confirmed" },
      statusCode: 409,
    };
  }

  if (reservation.status === "RELEASED") {
    return {
      body: { error: "Reservation has already been released" },
      statusCode: 409,
    };
  }

  // Check expiry
  if (new Date() > reservation.expiresAt) {
    // Lazy-expire: release the stock now
    await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: { status: "RELEASED", releasedAt: new Date() },
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

    return {
      body: {
        error:
          "Reservation has expired. The stock has been returned to inventory.",
        code: "RESERVATION_EXPIRED",
      },
      statusCode: 410,
    };
  }

  // Confirm: update status and permanently decrement totalStock
  const [updated] = await prisma.$transaction([
    prisma.reservation.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
      include: { product: true, warehouse: true },
    }),
    // Permanently reduce total stock and release the reserved hold
    prisma.inventory.update({
      where: {
        productId_warehouseId: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
      },
      data: {
        totalStock: { decrement: reservation.quantity },
        reservedStock: { decrement: reservation.quantity },
      },
    }),
  ]);

  return {
    body: {
      reservation: {
        ...updated,
        product: { ...updated.product, price: Number(updated.product.price) },
      },
    },
    statusCode: 200,
  };
}
