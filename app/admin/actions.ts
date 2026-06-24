"use server";

import { getSubmissionDetail, type SubmissionDetail } from "@/lib/admin-stats";
import { getCurrentProfile } from "@/lib/auth";

/** Super-admin-only: load a single submission's full output + answers on demand. */
export async function loadSubmissionDetail(
  id: string,
): Promise<SubmissionDetail | null> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active || profile.role !== "super_admin") {
    throw new Error("Not authorized.");
  }
  return getSubmissionDetail(id);
}
