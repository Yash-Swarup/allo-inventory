// src/lib/schemas.ts
import { z } from "zod";

export const CreateReservationSchema = z.object({
  productId:   z.string().min(1),
  warehouseId: z.string().min(1),
  quantity:    z.number().int().positive().max(100),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

export const ReservationStatusSchema = z.enum(["PENDING", "CONFIRMED", "RELEASED"]);

export const ReservationSchema = z.object({
  id:          z.string(),
  productId:   z.string(),
  warehouseId: z.string(),
  quantity:    z.number(),
  status:      ReservationStatusSchema,
  expiresAt:   z.string().datetime(),
  createdAt:   z.string().datetime(),
});

export type Reservation = z.infer<typeof ReservationSchema>;

// Typed API error shape
export const ApiErrorSchema = z.object({
  error:   z.string(),
  message: z.string(),
});
