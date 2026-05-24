// src/lib/idempotency.ts
// Idempotency key handling for reserve and confirm endpoints.
//
// Strategy:
//   1. Check if a record exists for this key+endpoint combo.
//   2. If yes, return the stored response immediately (no side effects).
//   3. If no, execute the handler, store the result, return it.
//
// Records are kept for 24 hours — clients should not retry beyond that window.

import { prisma } from "./prisma";

const IDEMPOTENCY_TTL_HOURS = 24;

export interface StoredResponse {
  statusCode: number;
  body: unknown;
}

/**
 * Wraps a handler with idempotency semantics.
 * If the same key+endpoint has been seen before, returns the cached response.
 */
export async function withIdempotency(
  key: string,
  endpoint: string,
  handler: () => Promise<StoredResponse>
): Promise<StoredResponse & { cached: boolean }> {
  // Look for an existing record
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { key },
  });

  if (existing && existing.endpoint === endpoint) {
    // Return the stored response — no side effects
    return {
      statusCode: existing.statusCode,
      body: existing.response,
      cached: true,
    };
  }

  // Execute the real handler
  const result = await handler();

  // Persist the result so future retries get the same response
  const expiresAt = new Date(
    Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000
  );

  await prisma.idempotencyRecord.upsert({
    where: { key },
    create: {
      key,
      endpoint,
      statusCode: result.statusCode,
      response: result.body as object,
      expiresAt,
    },
    update: {
      // Should not happen, but guard against it
      statusCode: result.statusCode,
      response: result.body as object,
      expiresAt,
    },
  });

  return { ...result, cached: false };
}
