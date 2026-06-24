import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminOverview } from "@/lib/admin-stats";

export const dynamic = "force-dynamic";

function usd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const o = await getAdminOverview();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Across all instructors and roadmaps.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Submissions" value={o.totals.submissions} />
        <Kpi label="Today" value={o.totals.today} />
        <Kpi label="Last 7 days" value={o.totals.last7} />
        <Kpi label="Last 30 days" value={o.totals.last30} />
        <Kpi label="Roadmaps" value={o.totals.roadmaps} />
        <Kpi label="Published" value={o.totals.published} />
        <Kpi label="LLM cost (prod)" value={usd(o.totals.prodCostUsd)} />
        <Kpi label="LLM cost (test)" value={usd(o.totals.testCostUsd)} />
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Roadmaps</h2>
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Submissions</TableHead>
                <TableHead className="text-right">Prod cost</TableHead>
                <TableHead className="text-right">Test cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.roadmaps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No roadmaps yet.
                  </TableCell>
                </TableRow>
              )}
              {o.roadmaps.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.title}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      /r/{r.slug}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.ownerEmail ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={r.status === "published" ? "default" : "secondary"}
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.submissions}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {usd(r.prodCostUsd)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {usd(r.testCostUsd)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="font-semibold">By instructor</h2>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instructor</TableHead>
                  <TableHead className="text-right">Roadmaps</TableHead>
                  <TableHead className="text-right">Subs</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.instructors.map((i) => (
                  <TableRow key={i.email}>
                    <TableCell className="text-muted-foreground">
                      {i.email}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i.roadmaps}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i.submissions}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usd(i.costUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">By provider</h2>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.providers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No generations yet.
                    </TableCell>
                  </TableRow>
                )}
                {o.providers.map((p) => (
                  <TableRow key={p.provider}>
                    <TableCell>{p.provider}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.calls}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usd(p.costUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
