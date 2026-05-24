export interface Warehouse {
  id: string;
  name: string;
  location: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  createdAt: Date;
  updatedAt: Date;
  warehouse: Warehouse;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  price: number;
  sku: string;
  createdAt: Date;
  updatedAt: Date;
  inventory: InventoryItem[];
}

export interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED';
  expiresAt: Date;
  confirmedAt: Date | null;
  releasedAt: Date | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  product: Product;
  warehouse: Warehouse;
}