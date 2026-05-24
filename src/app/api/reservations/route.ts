// src/app/api/reservations/route.ts
// POST /api/reservations — creates a reservation, holding stock for 10 minutes.
//
// ── Concurrency strategy ──────────────────────────────────────────────────────
// We combine two layers of protection:
//
// Layer 1 — Redis distributed lock (per product+warehouse key):
//   Prevents two requests from entering the DB transaction simultaneously
//   for the same inventory row. Acquired with SET NX, released after commit.
//   TTL of 5 s ensures the lock is auto-released if the server crashes.
//
// Layer 2 — Prisma interactive transaction with SELECT FOR UPDATE:
//   Even without the Redis lock, the DB-level row lock ensures atomicity.
//   Both layers together give us belt-and-suspenders safety.
//
// Race outcome: if two requests arrive simultaneously for the last unit,
// the one that acquires the Redis lock first will proceed and decrement stock.
// The second either waits on the Redis lock (returns 409) or, if Redis is
// unavailable, falls through to the DB lock where it will also get 409.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireLock, releaseLock } from "@/lib/redis";
import { createReservationSchema } from "@/lib/validations";
import { withIdempotency } from "@/lib/idempotency";

const RESERVATION_TTL_MINUTES = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createReservationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;
    const idempotencyKey = req.headers.get("Idempotency-Key");

    // Wrap in idempotency if a key is provided
    const execute = async () => {
      return performReservation(productId, warehouseId, quantity);
    };

    if (idempotencyKey) {
      const result = await withIdempotency(
        idempotencyKey,
        "POST /api/reservations",
        execute
      );
      return NextResponse.json(result.body, { status: result.statusCode });
    }

    const result = await execute();
    return NextResponse.json(result.body, { status: result.statusCode });
  } catch (error) {
    console.error("[POST /api/reservations]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function performReservation(
  productId: string,
  warehouseId: string,
  quantity: number
): Promise<{ body: unknown; statusCode: number }> {
  // Layer 1: acquire Redis distributed lock for this inventory slot
  const lockKey = `inventory:${productId}:${warehouseId}`;
  const lockToken = await acquireLock(lockKey);

  if (!lockToken) {
    // Another request is already modifying this inventory row
    return {
      body: {
        error:
          "Another reservation is in progress for this item. Please try again.",
        code: "LOCK_CONTENTION",
      },
      statusCode: 409,
    };
  }

  try {
    // Layer 2: DB transaction with SELECT FOR UPDATE (Prisma interactive tx)
    const reservation = await prisma.$transaction(async (tx) => {
      // Lock the inventory row at the DB level
      const inventory = await tx.$queryRaw<
        Array<{
          id: string;
          totalStock: number;
          reservedStock: number;
        }>
      >`
        SELECT id, "totalStock", "reservedStock"
        FROM inventory
        WHERE "productId" = ${productId}
          AND "warehouseId" = ${warehouseId}
        FOR UPDATE
      `;

      if (inventory.length === 0) {
        throw new InsufficientStockError("Inventory record not found");
      }

      const inv = inventory[0];
      const available = inv.totalStock - inv.reservedStock;

      if (available < quantity) {
        throw new InsufficientStockError(
          `Only ${available} unit(s) available, but ${quantity} requested`
        );
      }

      // Decrement available stock by incrementing reservedStock
      await tx.inventory.update({
        where: { id: inv.id },
        data: { reservedStock: { increment: quantity } },
      });

      // Create the reservation with a 10-minute TTL
      const expiresAt = new Date(
        Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000
      );

      return tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: "PENDING",
          expiresAt,
        },
        include: {
          product: {
            include: {
              inventory: { include: { warehouse: true } },
            },
          },
          warehouse: true,
        },
      });
    });

    const shaped = {
      ...reservation,
      product: {
        ...reservation.product,
        price: Number(reservation.product.price),
        inventory: reservation.product.inventory.map((inv) => ({
          ...inv,
          availableStock: Math.max(0, inv.totalStock - inv.reservedStock),
        })),
      },
    };

    return { body: { reservation: shaped }, statusCode: 201 };
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return {
        body: { error: error.message, code: "INSUFFICIENT_STOCK" },
        statusCode: 409,
      };
    }
    throw error;
  } finally {
    // Always release the lock, even on error
    await releaseLock(lockKey, lockToken);
  }
}

class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}
