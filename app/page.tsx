import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { listPublishedRoadmaps } from "@/lib/roadmaps";

export const dynamic = "force-dynamic";

export default async function Home() {
  const roadmaps = await listPublishedRoadmaps();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-16">
      <p className="font-mono text-xs uppercase tracking-wider text-primary">
        100x Roadmap Studio
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        Choose your roadmap
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Pick a track. Answer a few honest questions. Walk away with a
        personalized plan built only for you.
      </p>

      {roadmaps.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          No roadmaps are published yet. Check back soon.
        </div>
      ) : (
        <div className="mt-10 grid gap-4">
          {roadmaps.map((r) => (
            <Link
              key={r.slug}
              href={`/r/${r.slug}`}
              className="group flex items-center justify-between gap-4 rounded-xl border p-6 transition-colors hover:border-primary hover:bg-accent/40"
            >
              <div className="space-y-1">
                {r.eyebrow && (
                  <p className="font-mono text-xs uppercase tracking-wider text-primary">
                    {r.eyebrow}
                  </p>
                )}
                <h2 className="text-lg font-semibold">{r.title}</h2>
                {r.description && (
                  <p className="text-sm text-muted-foreground">{r.description}</p>
                )}
              </div>
              <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
