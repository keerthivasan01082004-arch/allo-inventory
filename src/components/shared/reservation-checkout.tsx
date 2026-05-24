// src/components/shared/reservation-checkout.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Clock, Package, MapPin, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { confirmReservation, releaseReservation, ApiError } from "@/lib/api-client";
import { formatPrice, formatCountdown, secondsUntil } from "@/lib/utils";
import type { Reservation, ReservationStatus } from "@/types";

const TOTAL_SECONDS = 10 * 60; // 10 minutes

interface ReservationCheckoutProps {
  initialReservation: Reservation;
}

function StatusBanner({ status }: { status: ReservationStatus }) {
  if (status === "CONFIRMED") {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 text-green-800 rounded-lg p-4">
        <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-semibold">Payment confirmed!</p>
          <p className="text-sm text-green-600">
            Your order has been placed and stock is secured.
          </p>
        </div>
      </div>
    );
  }

  if (status === "RELEASED") {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
        <XCircle className="h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-semibold">Reservation released</p>
          <p className="text-sm text-red-600">
            Stock has been returned to inventory.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export function ReservationCheckout({
  initialReservation,
}: ReservationCheckoutProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [reservation, setReservation] = useState<Reservation>(initialReservation);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    secondsUntil(initialReservation.expiresAt)
  );
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (reservation.status !== "PENDING") return;

    const interval = setInterval(() => {
      const s = secondsUntil(reservation.expiresAt);
      setSecondsLeft(s);

      if (s === 0) {
        clearInterval(interval);
        // Optimistically mark as expired in UI
        setReservation((r) => ({ ...r, status: "RELEASED" }));
        toast({
          variant: "destructive",
          title: "Reservation expired",
          description: "Your 10-minute hold has ended. Stock is now available to others.",
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [reservation.expiresAt, reservation.status, toast]);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    try {
      const idempotencyKey = `confirm-${reservation.id}-${Date.now()}`;
      const { reservation: updated } = await confirmReservation(
        reservation.id,
        idempotencyKey
      );
      setReservation(updated);
      toast({
        title: "Order confirmed! 🎉",
        description: "Payment successful. Your items are on their way.",
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 410) {
          toast({
            variant: "destructive",
            title: "Reservation expired",
            description:
              "Your 10-minute hold expired before payment was confirmed.",
          });
          setReservation((r) => ({ ...r, status: "RELEASED" }));
        } else {
          toast({
            variant: "destructive",
            title: "Payment failed",
            description: err.message,
          });
        }
      }
    } finally {
      setConfirming(false);
    }
  }, [reservation.id, toast]);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    try {
      const { reservation: updated } = await releaseReservation(reservation.id);
      setReservation(updated);
      toast({
        title: "Reservation cancelled",
        description: "Stock has been released back to inventory.",
      });
    } catch (err) {
      if (err instanceof ApiError) {
        toast({
          variant: "destructive",
          title: "Error",
          description: err.message,
        });
      }
    } finally {
      setCancelling(false);
    }
  }, [reservation.id, toast]);

  const progressPct =
    reservation.status === "PENDING"
      ? (secondsLeft / TOTAL_SECONDS) * 100
      : 0;

  const isExpiredOrReleased =
    reservation.status === "RELEASED" || reservation.status === "CONFIRMED";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => router.push("/products")}
          className="text-sm text-blue-600 hover:underline mb-3 flex items-center gap-1"
        >
          ← Back to products
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
        <p className="text-sm text-gray-500 font-mono mt-0.5">
          Reservation #{reservation.id.slice(-8).toUpperCase()}
        </p>
      </div>

      {/* Status banner */}
      <StatusBanner status={reservation.status} />

      {/* Countdown timer (only for PENDING) */}
      {reservation.status === "PENDING" && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-gray-700">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">Time remaining</span>
            </div>
            <span
              className={`text-2xl font-mono font-bold tabular-nums ${
                secondsLeft < 60 ? "text-red-600" : "text-gray-900"
              }`}
            >
              {formatCountdown(secondsLeft)}
            </span>
          </div>
          <Progress
            value={progressPct}
            className={`h-2 ${secondsLeft < 60 ? "[&>div]:bg-red-500" : ""}`}
          />
          <p className="text-xs text-gray-400 mt-2">
            Stock is held until{" "}
            {new Date(reservation.expiresAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      )}

      {/* Reservation details */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-500" />
            Order summary
          </h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="font-medium text-gray-900">
                {reservation.product.name}
              </p>
              <p className="text-sm text-gray-500 font-mono">
                {reservation.product.sku}
              </p>
            </div>
            <div className="text-right ml-4">
              <p className="font-semibold text-gray-900">
                {formatPrice(reservation.product.price)}
              </p>
              <p className="text-xs text-gray-400">
                Qty: {reservation.quantity}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2.5">
            <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <span>
              {reservation.warehouse.name} · {reservation.warehouse.location}
            </span>
          </div>

          <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
            <span className="font-semibold text-gray-700">Total</span>
            <span className="text-xl font-bold text-gray-900">
              {formatPrice(
                Number(reservation.product.price) * reservation.quantity
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {reservation.status === "PENDING" && (
        <div className="flex gap-3">
          <Button
            className="flex-1 gap-2"
            size="lg"
            onClick={handleConfirm}
            disabled={confirming || cancelling || secondsLeft === 0}
          >
            <ShoppingBag className="h-4 w-4" />
            {confirming ? "Processing payment…" : "Confirm purchase"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={handleCancel}
            disabled={confirming || cancelling}
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        </div>
      )}

      {isExpiredOrReleased && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => router.push("/products")}
        >
          Browse products
        </Button>
      )}
    </div>
  );
}
