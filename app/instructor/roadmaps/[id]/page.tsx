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
  const { data: row, error: rowError } = await supabase
    .from("roadmaps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (rowError) throw new Error(rowError.message);
  if (!row) notFound();

  const { data: questionRows, error: questionsError } = await supabase
    .from("roadmap_questions")
    .select("*")
    .eq("roadmap_id", id)
    .order("position");
  // Surface a read failure instead of treating it as "no questions" — saving
  // from an empty editor would otherwise overwrite the stored question set.
  if (questionsError) throw new Error(questionsError.message);

  const config = rowToRoadmapConfig(row, questionRows ?? []);
  return <RoadmapEditor initial={config} isNew={false} />;
}
