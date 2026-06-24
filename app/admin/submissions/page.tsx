import { SubmissionsTable } from "@/components/admin/submissions-table";
import { getRecentSubmissions } from "@/lib/admin-stats";

export const dynamic = "force-dynamic";

export default async function AdminSubmissionsPage() {
  const rows = await getRecentSubmissions(200);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
        <p className="text-sm text-muted-foreground">
          Most recent 200 across all roadmaps. Click a row for details.
        </p>
      </div>
      <SubmissionsTable rows={rows} />
    </div>
  );
}
