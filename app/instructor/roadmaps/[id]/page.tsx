import { notFound } from "next/navigation";
import { RoadmapEditor } from "@/components/admin/roadmap-editor";
import { rowToRoadmapConfig } from "@/lib/roadmaps";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditRoadmapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // RLS lets instructors load only their own roadmaps (super_admin: any).
  const { data: row } = await supabase
    .from("roadmaps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) notFound();

  const { data: questionRows } = await supabase
    .from("roadmap_questions")
    .select("*")
    .eq("roadmap_id", id)
    .order("position");

  const config = rowToRoadmapConfig(row, questionRows ?? []);
  return <RoadmapEditor initial={config} isNew={false} />;
}
