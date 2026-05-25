// src/types/index.ts
// Shared TypeScript types used across the application.

export type ReservationStatus = "PENDING" | "CONFIRMED" | "RELEASED";

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  createdAt: string;
  updatedAt: string;
  warehouse: Warehouse;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  price: number;
  sku: string;
  inventory: InventoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
  product: Product;
  warehouse: Warehouse;
}

export interface CreateReservationRequest {
  productId: string;
  warehouseId: string;
  quantity: number;
}

export interface CreateReservationResponse {
  reservation: Reservation;
}

export interface ConfirmReservationResponse {
  reservation: Reservation;
}

export interface ReleaseReservationResponse {
  reservation: Reservation;
}

export interface ApiError {
  error: string;
  code?: string;
}