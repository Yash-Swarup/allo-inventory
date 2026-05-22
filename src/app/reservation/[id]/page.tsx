// src/app/reservation/[id]/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type ReservationData = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  createdAt: string;
};

function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const mins = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const secs = (secondsLeft % 60).toString().padStart(2, "0");
  return { secondsLeft, display: `${mins}:${secs}` };
}

export default function ReservationPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const { secondsLeft, display } = useCountdown(reservation?.expiresAt ?? null);

  const fetchReservation = useCallback(async () => {
    // We don't have a GET /api/reservations/:id endpoint in the spec,
    // so we store reservation data in sessionStorage after creation and rehydrate here.
    const cached = sessionStorage.getItem(`reservation:${params.id}`);
    if (cached) {
      setReservation(JSON.parse(cached));
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { fetchReservation(); }, [fetchReservation]);

  async function confirm() {
    setActionLoading(true);
    setApiError(null);
    const res = await fetch(`/api/reservations/${params.id}/confirm`, { method: "POST" });
    const data = await res.json();

    if (res.status === 410) {
      setApiError("Your reservation expired before payment could be confirmed.");
      setReservation((r) => r ? { ...r, status: "RELEASED" } : r);
    } else if (!res.ok) {
      setApiError(data.message ?? "Something went wrong.");
    } else {
      setReservation(data);
      sessionStorage.setItem(`reservation:${params.id}`, JSON.stringify(data));
    }
    setActionLoading(false);
  }

  async function cancel() {
    setActionLoading(true);
    setApiError(null);
    const res = await fetch(`/api/reservations/${params.id}/release`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setReservation(data);
      sessionStorage.setItem(`reservation:${params.id}`, JSON.stringify(data));
    } else {
      setApiError("Failed to cancel reservation.");
    }
    setActionLoading(false);
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (!reservation) return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <h2 className="text-xl font-medium mb-2">Reservation not found</h2>
      <button onClick={() => router.push("/")} className="text-indigo-600 hover:underline text-sm">
        ← Back to products
      </button>
    </div>
  );

  const isPending   = reservation.status === "PENDING";
  const isConfirmed = reservation.status === "CONFIRMED";
  const isReleased  = reservation.status === "RELEASED";
  const isExpired   = isPending && secondsLeft === 0;

  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <button onClick={() => router.push("/")} className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1">
        ← Back to products
      </button>

      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold mb-1">
          {isConfirmed ? "Purchase confirmed!" : isReleased || isExpired ? "Reservation ended" : "Complete your purchase"}
        </h1>
        <p className="text-gray-500 text-sm mb-6">Reservation #{reservation.id.slice(0, 8)}</p>

        {/* Status badge */}
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium mb-6 ${
          isConfirmed ? "bg-green-50 text-green-700" :
          isReleased  ? "bg-gray-100 text-gray-500"  :
          isExpired   ? "bg-red-50 text-red-600"     :
                        "bg-indigo-50 text-indigo-700"
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            isConfirmed ? "bg-green-500" :
            isReleased  ? "bg-gray-400"  :
            isExpired   ? "bg-red-500"   :
                          "bg-indigo-500"
          }`} />
          {isConfirmed ? "Confirmed" : isReleased ? "Released" : isExpired ? "Expired" : "Pending"}
        </div>

        <dl className="space-y-3 text-sm mb-6">
          <div className="flex justify-between">
            <dt className="text-gray-500">Product ID</dt>
            <dd className="font-mono text-xs">{reservation.productId}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Warehouse</dt>
            <dd className="font-mono text-xs">{reservation.warehouseId}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Quantity</dt>
            <dd>{reservation.quantity}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Expires at</dt>
            <dd>{new Date(reservation.expiresAt).toLocaleTimeString()}</dd>
          </div>
        </dl>

        {/* Countdown (only while pending and not expired) */}
        {isPending && !isExpired && (
          <div className={`rounded-lg p-4 mb-6 text-center ${secondsLeft <= 60 ? "bg-red-50" : "bg-indigo-50"}`}>
            <div className={`text-4xl font-mono font-semibold ${secondsLeft <= 60 ? "text-red-600" : "text-indigo-700"}`}>
              {display}
            </div>
            <div className="text-xs text-gray-500 mt-1">time remaining to complete purchase</div>
          </div>
        )}

        {/* API error */}
        {apiError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            ⚠ {apiError}
          </div>
        )}

        {/* Actions */}
        {isPending && !isExpired && (
          <div className="flex gap-3">
            <button
              onClick={confirm}
              disabled={actionLoading}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading ? "Processing…" : "Confirm purchase"}
            </button>
            <button
              onClick={cancel}
              disabled={actionLoading}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {isExpired && (
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-4">Your hold expired. Units have been returned to stock.</p>
            <button onClick={() => router.push("/")} className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
              Browse products again
            </button>
          </div>
        )}

        {(isConfirmed || isReleased) && (
          <button onClick={() => router.push("/")} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            ← Back to products
          </button>
        )}
      </div>
    </main>
  );
}
