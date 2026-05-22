// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StockEntry = {
  warehouseId: string;
  warehouseName: string;
  location: string;
  total: number;
  reserved: number;
  available: number;
};

type Product = {
  id: string;
  name: string;
  description?: string;
  stock: StockEntry[];
};

export default function ProductListingPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reserving, setReserving] = useState<string | null>(null); // "productId:warehouseId"
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => setError("Failed to load products."))
      .finally(() => setLoading(false));
  }, []);

  async function reserve(productId: string, warehouseId: string) {
    const key = `${productId}:${warehouseId}`;
    setReserving(key);
    setApiError(null);

    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
    });

    if (res.status === 409) {
      const data = await res.json();
      setApiError(data.message ?? "Not enough stock.");
      setReserving(null);
      return;
    }

    if (!res.ok) {
      setApiError("Something went wrong. Please try again.");
      setReserving(null);
      return;
    }

    const reservation = await res.json();
    sessionStorage.setItem(`reservation:${reservation.id}`, JSON.stringify(reservation));
    router.push(`/reservation/${reservation.id}`);
  }

  if (loading) return <div className="p-8 text-gray-500">Loading products…</div>;
  if (error)   return <div className="p-8 text-red-600">{error}</div>;

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-semibold mb-2">Products</h1>
      <p className="text-gray-500 mb-8">Stock is updated in real time. Reserve to hold for 10 minutes.</p>

      {apiError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠ {apiError}
        </div>
      )}

      <div className="space-y-6">
        {products.map((product) => (
          <div key={product.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-medium mb-1">{product.name}</h2>
            {product.description && (
              <p className="text-gray-500 text-sm mb-4">{product.description}</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-400">
                    <th className="pb-2 font-normal">Warehouse</th>
                    <th className="pb-2 font-normal">Available</th>
                    <th className="pb-2 font-normal">Reserved</th>
                    <th className="pb-2 font-normal"></th>
                  </tr>
                </thead>
                <tbody>
                  {product.stock.map((s) => {
                    const key = `${product.id}:${s.warehouseId}`;
                    const isReserving = reserving === key;
                    return (
                      <tr key={s.warehouseId} className="border-b last:border-0">
                        <td className="py-3">
                          <div className="font-medium">{s.warehouseName}</div>
                          <div className="text-gray-400 text-xs">{s.location}</div>
                        </td>
                        <td className="py-3">
                          <span className={s.available === 0 ? "text-red-500" : s.available <= 2 ? "text-amber-600 font-medium" : "text-green-700"}>
                            {s.available}
                          </span>
                          {s.available <= 2 && s.available > 0 && (
                            <span className="ml-2 text-xs text-amber-600">Low stock</span>
                          )}
                        </td>
                        <td className="py-3 text-gray-400">{s.reserved}</td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => reserve(product.id, s.warehouseId)}
                            disabled={s.available === 0 || isReserving}
                            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                          >
                            {isReserving ? "Reserving…" : s.available === 0 ? "Out of stock" : "Reserve"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
