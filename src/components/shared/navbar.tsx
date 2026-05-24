// src/components/shared/navbar.tsx

import Link from "next/link";
import { Package2 } from "lucide-react";

export function NavBar() {
  return (
    <nav className="sticky top-0 z-50 h-16 bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 h-full flex items-center justify-between">
        <Link href="/products" className="flex items-center gap-2 font-semibold text-gray-900 hover:text-blue-600 transition-colors">
          <Package2 className="h-5 w-5 text-blue-600" />
          <span>Allo Inventory</span>
        </Link>
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-2.5 py-0.5 rounded-full text-xs font-medium">
            <span className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
            Live stock
          </span>
        </div>
      </div>
    </nav>
  );
}
