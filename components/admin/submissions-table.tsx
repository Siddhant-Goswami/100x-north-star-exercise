"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SubmissionRow } from "@/lib/admin-stats";

function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

export function SubmissionsTable({ rows }: { rows: SubmissionRow[] }) {
  const [active, setActive] = useState<SubmissionRow | null>(null);

  return (
    <>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Roadmap</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Readiness</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No submissions yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => setActive(r)}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {when(r.createdAt)}
                </TableCell>
                <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.roadmapTitle}
                </TableCell>
                <TableCell>
                  <Badge variant={r.source === "test" ? "outline" : "secondary"}>
                    {r.source}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.readiness ?? "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.flags.join(", ") || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{active?.name ?? "Submission"}</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                {active.email ?? "no email"} · {active.roadmapTitle} ·{" "}
                {when(active.createdAt)}
              </p>
              <div>
                <p className="mb-1 font-mono text-xs uppercase tracking-wide text-primary">
                  Generated output
                </p>
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                  {JSON.stringify(active.output, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-mono text-xs uppercase tracking-wide text-primary">
                  Answers
                </p>
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                  {JSON.stringify(active.answers, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
