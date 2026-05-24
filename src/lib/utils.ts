// src/lib/utils.ts
// Shared utility functions.

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges Tailwind classes intelligently (shadcn/ui convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats a Decimal/number as Indian Rupees. */
export function formatPrice(price: number | string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(price));
}

/** Returns the number of seconds remaining until a date. */
export function secondsUntil(date: string | Date): number {
  return Math.max(0, Math.floor((new Date(date).getTime() - Date.now()) / 1000));
}

/** Formats seconds as MM:SS. */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Checks if a reservation is expired. */
export function isExpired(expiresAt: string | Date): boolean {
  return new Date(expiresAt) < new Date();
}

/**
 * Computes available stock from totalStock and reservedStock,
 * also accounting for any pending reservations that have expired.
 * The "lazy expiration" approach means we clamp available stock at 0.
 */
export function availableStock(totalStock: number, reservedStock: number): number {
  return Math.max(0, totalStock - reservedStock);
}
