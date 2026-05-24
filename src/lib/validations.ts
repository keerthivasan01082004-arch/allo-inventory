// src/lib/validations.ts
// Zod schemas shared between API route handlers and client-side forms.

import { z } from "zod";

export const createReservationSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  warehouseId: z.string().min(1, "Warehouse ID is required"),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(100, "Quantity cannot exceed 100 per reservation"),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
