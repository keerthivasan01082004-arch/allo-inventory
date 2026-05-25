// src/app/reservations/[id]/page.tsx
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ReservationCheckout } from "@/components/shared/reservation-checkout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout | Allo Inventory",
};

export const dynamic = "force-dynamic";

async function getReservation(id: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      product: true,
      warehouse: true,
    },
  });

  if (!reservation) return null;

  return {
    id: reservation.id,
    productId: reservation.productId,
    warehouseId: reservation.warehouseId,
    quantity: reservation.quantity,
    status: reservation.status as "PENDING" | "CONFIRMED" | "RELEASED",
    expiresAt: reservation.expiresAt.toISOString(),
    confirmedAt: reservation.confirmedAt ? reservation.confirmedAt.toISOString() : null,
    releasedAt: reservation.releasedAt ? reservation.releasedAt.toISOString() : null,
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
    idempotencyKey: reservation.idempotencyKey ?? null,
    product: {
      id: reservation.product.id,
      name: reservation.product.name,
      description: reservation.product.description,
      imageUrl: reservation.product.imageUrl ?? null,
      price: Number(reservation.product.price),
      sku: reservation.product.sku,
      createdAt: reservation.product.createdAt.toISOString(),
      updatedAt: reservation.product.updatedAt.toISOString(),
      inventory: [],
    },
    warehouse: {
      id: reservation.warehouse.id,
      name: reservation.warehouse.name,
      location: reservation.warehouse.location,
      createdAt: reservation.warehouse.createdAt.toISOString(),
      updatedAt: reservation.warehouse.updatedAt.toISOString(),
    },
  };
}

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reservation = await getReservation(id);

  if (!reservation) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <ReservationCheckout initialReservation={reservation} />
    </div>
  );
}