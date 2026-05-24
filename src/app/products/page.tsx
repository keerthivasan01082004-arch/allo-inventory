// src/app/products/page.tsx
// Server component — fetches products on the server and passes to client grid.

import { prisma } from "@/lib/prisma";
import { ProductGrid } from "@/components/shared/product-grid";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Products | Allo Inventory",
  description: "Browse products and reserve stock across warehouses.",
};

// Revalidate every 30 seconds so the page stays relatively fresh
export const revalidate = 30;

async function getProducts() {
  // Lazy-expire stale reservations before rendering
  const now = new Date();
  const expired = await prisma.reservation.findMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    select: { id: true, productId: true, warehouseId: true, quantity: true },
  });

  if (expired.length > 0) {
    await prisma.$transaction([
      ...expired.map((r) =>
        prisma.inventory.update({
          where: {
            productId_warehouseId: {
              productId: r.productId,
              warehouseId: r.warehouseId,
            },
          },
          data: { reservedStock: { decrement: r.quantity } },
        })
      ),
      prisma.reservation.updateMany({
        where: { id: { in: expired.map((r) => r.id) } },
        data: { status: "RELEASED", releasedAt: now },
      }),
    ]);
  }

  const rawProducts = await prisma.product.findMany({
    include: {
      inventory: {
        include: { warehouse: true },
        orderBy: { warehouse: { name: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });

  return rawProducts.map((p) => ({
    ...p,
    price: Number(p.price),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    inventory: p.inventory.map((inv) => ({
      ...inv,
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
      availableStock: Math.max(0, inv.totalStock - inv.reservedStock),
      warehouse: {
        ...inv.warehouse,
        createdAt: inv.warehouse.createdAt.toISOString(),
        updatedAt: inv.warehouse.updatedAt.toISOString(),
      },
    })),
  }));
}

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Products</h1>
        <p className="mt-2 text-gray-500">
          {products.length} products available across all warehouses. Stock is
          held for 10 minutes after reservation.
        </p>
      </div>
      <ProductGrid initialProducts={products} />
    </div>
  );
}