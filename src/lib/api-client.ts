// src/lib/api-client.ts
// Typed fetch wrappers used by client components.

import type {
  Product,
  Warehouse,
  CreateReservationRequest,
  CreateReservationResponse,
  ConfirmReservationResponse,
  ReleaseReservationResponse,
  Reservation,
} from "@/types";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetcher<T>(
  url: string,
  options?: RequestInit & { idempotencyKey?: string }
): Promise<T> {
  const { idempotencyKey, ...fetchOptions } = options ?? {};

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers ?? {}),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };

  const res = await fetch(url, { ...fetchOptions, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(res.status, body.error ?? "Request failed", body.code);
  }

  return res.json() as Promise<T>;
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function getProducts(): Promise<Product[]> {
  return fetcher<Product[]>("/api/products");
}

// ── Warehouses ────────────────────────────────────────────────────────────────

export async function getWarehouses(): Promise<Warehouse[]> {
  return fetcher<Warehouse[]>("/api/warehouses");
}

// ── Reservations ──────────────────────────────────────────────────────────────

export async function createReservation(
  data: CreateReservationRequest,
  idempotencyKey?: string
): Promise<CreateReservationResponse> {
  return fetcher<CreateReservationResponse>("/api/reservations", {
    method: "POST",
    body: JSON.stringify(data),
    idempotencyKey,
  });
}

export async function getReservation(id: string): Promise<Reservation> {
  return fetcher<Reservation>(`/api/reservations/${id}`);
}

export async function confirmReservation(
  id: string,
  idempotencyKey?: string
): Promise<ConfirmReservationResponse> {
  return fetcher<ConfirmReservationResponse>(
    `/api/reservations/${id}/confirm`,
    { method: "POST", idempotencyKey }
  );
}

export async function releaseReservation(
  id: string
): Promise<ReleaseReservationResponse> {
  return fetcher<ReleaseReservationResponse>(
    `/api/reservations/${id}/release`,
    { method: "POST" }
  );
}

export { ApiError };
