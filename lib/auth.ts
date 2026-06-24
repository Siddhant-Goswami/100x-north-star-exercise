import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: "instructor" | "super_admin";
  is_active: boolean;
};

/** The signed-in user's profile (role-bearing), or null if not signed in. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export function isSuperAdmin(profile: Profile | null): boolean {
  return profile?.role === "super_admin";
}
