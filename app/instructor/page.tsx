import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  published: "default",
  draft: "secondary",
  archived: "outline",
};

export default async function InstructorHome() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("roadmaps")
    .select("id, slug, title, status, updated_at")
    .order("updated_at", { ascending: false });
  const roadmaps = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My roadmaps</h1>
          <p className="text-sm text-muted-foreground">
            Design, test, and publish roadmaps for your students.
          </p>
        </div>
        <Button asChild>
          <Link href="/instructor/roadmaps/new">
            <Plus className="size-4" /> New roadmap
          </Link>
        </Button>
      </div>

      {roadmaps.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          You have no roadmaps yet. Create your first one.
        </div>
      ) : (
        <div className="grid gap-3">
          {roadmaps.map((r) => (
            <Link
              key={r.id}
              href={`/instructor/roadmaps/${r.id}`}
              className="group flex items-center justify-between gap-4 rounded-xl border p-5 transition-colors hover:border-primary hover:bg-accent/40"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h2 className="font-semibold">{r.title || "Untitled"}</h2>
                  <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>
                    {r.status}
                  </Badge>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  /r/{r.slug}
                </p>
              </div>
              <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
