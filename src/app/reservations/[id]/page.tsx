// src/app/reservations/[id]/page.tsx
// Reservation checkout page — shows countdown, confirm, and cancel.

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ReservationCheckout } from "@/components/shared/reservation-checkout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout | Allo Inventory",
};

// Always fetch fresh — reservation state changes frequently
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
    ...reservation,
    product: { ...reservation.product, price: Number(reservation.product.price) },
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
