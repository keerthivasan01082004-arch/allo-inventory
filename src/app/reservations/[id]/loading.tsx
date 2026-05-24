// src/app/reservations/[id]/loading.tsx

export default function ReservationLoading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-gray-200 rounded animate-pulse" />
          <div className="h-32 bg-gray-100 rounded-lg animate-pulse mt-4" />
          <div className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          <div className="flex gap-3 mt-6">
            <div className="h-11 flex-1 bg-gray-200 rounded animate-pulse" />
            <div className="h-11 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
