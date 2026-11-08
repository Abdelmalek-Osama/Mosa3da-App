import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPostgrestError } from "@/lib/errors/postgres";

/** The finished visit a visitor is asked to rate on her dashboard. */
export interface PendingFeedback {
  appointmentId: string;
  clinicDate: string;
  doctorName: string;
}

export interface VisitReview {
  appointmentId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  createdAt: string;
  patientName: string;
  clinicDate: string | null;
}

export interface ReviewSummary {
  count: number;
  average: number;
  /** Index 0 = 1 star … index 4 = 5 stars. */
  distribution: [number, number, number, number, number];
}

/** Null when nothing is pending, or before the feedback migration is applied. */
export async function getPendingFeedback(db: SupabaseClient): Promise<PendingFeedback | null> {
  const { data, error } = await db.rpc("get_pending_feedback");
  if (error || !data) return null;
  const row = z.object({ appointment_id: z.string().uuid(), clinic_date: z.string(), doctor: z.string().nullable() }).safeParse(data);
  if (!row.success) return null;
  return { appointmentId: row.data.appointment_id, clinicDate: row.data.clinic_date, doctorName: row.data.doctor ?? "" };
}

/** rating null = "Later / Close": the visit is not asked about again. */
export async function saveVisitFeedback(db: SupabaseClient, appointmentId: string, rating: number | null, comment?: string): Promise<boolean> {
  const { data, error } = await db.rpc("save_visit_feedback", {
    p_appointment_id: appointmentId,
    p_rating: rating,
    p_comment: comment ?? null,
  });
  if (error) throw fromPostgrestError(error);
  return z.object({ saved: z.boolean() }).parse(data).saved;
}

const reviewRow = z.object({
  appointment_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  created_at: z.string(),
  patient: z.object({ full_name: z.string() }).nullable(),
  appointment: z.object({ clinic_date: z.string() }).nullable(),
});

/** Submitted reviews, newest first (doctor only, by RLS). Empty before the migration. */
export async function listVisitReviews(db: SupabaseClient, limit = 1000): Promise<VisitReview[]> {
  const { data, error } = await db
    .from("visit_feedback")
    .select("appointment_id, rating, comment, created_at, patient:patients(full_name), appointment:appointments(clinic_date)")
    .eq("status", "submitted")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return z
    .array(reviewRow)
    .parse(data)
    .map((r) => ({
      appointmentId: r.appointment_id,
      rating: r.rating as VisitReview["rating"],
      comment: r.comment,
      createdAt: r.created_at,
      patientName: r.patient?.full_name ?? "",
      clinicDate: r.appointment?.clinic_date ?? null,
    }));
}

export function summarizeReviews(reviews: VisitReview[]): ReviewSummary {
  const distribution: ReviewSummary["distribution"] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const r of reviews) {
    distribution[r.rating - 1]! += 1;
    total += r.rating;
  }
  return { count: reviews.length, average: reviews.length ? total / reviews.length : 0, distribution };
}
