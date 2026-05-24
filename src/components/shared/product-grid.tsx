// src/components/shared/product-grid.tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Warehouse, ShoppingCart, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { createReservation, ApiError } from "@/lib/api-client";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";

interface ProductGridProps {
  initialProducts: Product[];
}

function StockBadge({ available }: { available: number }) {
  if (available === 0)
    return (
      <Badge variant="destructive" className="text-xs">
        Out of stock
      </Badge>
    );
  if (available <= 3)
    return (
      <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 bg-amber-50">
        Only {available} left
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-xs border-green-400 text-green-600 bg-green-50">
      {available} in stock
    </Badge>
  );
}

interface ReserveState {
  [inventoryId: string]: "idle" | "loading";
}

export function ProductGrid({ initialProducts }: ProductGridProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [reserveState, setReserveState] = useState<ReserveState>({});
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleReserve = useCallback(
    async (productId: string, warehouseId: string, inventoryId: string) => {
      setReserveState((s) => ({ ...s, [inventoryId]: "loading" }));

      try {
        // Generate a stable idempotency key for this reserve action
        const idempotencyKey = `reserve-${productId}-${warehouseId}-${Date.now()}`;
        const { reservation } = await createReservation(
          { productId, warehouseId, quantity: 1 },
          idempotencyKey
        );

        toast({
          title: "Reserved! 🎉",
          description: "Stock held for 10 minutes. Complete payment now.",
        });

        router.push(`/reservations/${reservation.id}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          toast({
            variant: "destructive",
            title: "Out of stock",
            description: err.message,
          });
          // Refresh to show updated stock
          await refresh();
        } else {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Something went wrong. Please try again.",
          });
        }
      } finally {
        setReserveState((s) => ({ ...s, [inventoryId]: "idle" }));
      }
    },
    [router, toast, refresh]
  );

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
        <AlertCircle className="h-10 w-10" />
        <p className="text-lg font-medium">No products found</p>
        <p className="text-sm">Check back later or refresh the page.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh stock
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <div
            key={product.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200"
          >
            {/* Product image */}
            <div className="relative h-48 bg-gray-100 overflow-hidden">
              {product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-300">
                  <ShoppingCart className="h-16 w-16" />
                </div>
              )}
            </div>

            <div className="p-5 flex flex-col flex-1">
              <div className="flex-1">
                <p className="text-xs text-gray-400 font-mono mb-1">{product.sku}</p>
                <h3 className="font-semibold text-gray-900 mb-1 leading-tight">
                  {product.name}
                </h3>
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                  {product.description}
                </p>
                <p className="text-xl font-bold text-gray-900 mb-4">
                  {formatPrice(product.price)}
                </p>

                {/* Per-warehouse stock */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <Warehouse className="h-3.5 w-3.5" />
                    Warehouse stock
                  </div>
                  {product.inventory.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">
                      No inventory data
                    </p>
                  ) : (
                    product.inventory.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-700">
                            {inv.warehouse.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {inv.warehouse.location}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StockBadge available={inv.availableStock} />
                          <Button
                            size="sm"
                            variant={inv.availableStock === 0 ? "outline" : "default"}
                            disabled={
                              inv.availableStock === 0 ||
                              reserveState[inv.id] === "loading"
                            }
                            onClick={() =>
                              handleReserve(product.id, inv.warehouseId, inv.id)
                            }
                            className="h-7 text-xs px-2.5"
                          >
                            {reserveState[inv.id] === "loading"
                              ? "Reserving…"
                              : inv.availableStock === 0
                              ? "Unavailable"
                              : "Reserve"}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
