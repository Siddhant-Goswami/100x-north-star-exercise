import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type RoadmapStat = {
  id: string;
  slug: string;
  title: string;
  status: string;
  ownerEmail: string | null;
  submissions: number;
  prodCostUsd: number;
  testCostUsd: number;
};

export type AdminOverview = {
  totals: {
    submissions: number;
    today: number;
    last7: number;
    last30: number;
    prodCostUsd: number;
    testCostUsd: number;
    roadmaps: number;
    published: number;
  };
  roadmaps: RoadmapStat[];
  providers: Array<{ provider: string; calls: number; costUsd: number }>;
  instructors: Array<{
    email: string;
    roadmaps: number;
    submissions: number;
    costUsd: number;
  }>;
};

type UsageRow = {
  roadmap_id: string | null;
  provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  source: string;
};

function priceKey(provider: string | null, model: string | null) {
  return `${provider ?? ""}|${model ?? ""}`;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const supabase = createSupabaseAdminClient();
  const [roadmapsRes, subsRes, usageRes, pricingRes] = await Promise.all([
    supabase
      .from("roadmaps")
      .select("id, slug, title, status, owner_id, owner:profiles(email)")
      .order("updated_at", { ascending: false }),
    supabase.from("submissions").select("roadmap_id, created_at, source"),
    supabase
      .from("llm_usage_events")
      .select("roadmap_id, provider, model, input_tokens, output_tokens, source"),
    supabase
      .from("model_pricing")
      .select("provider, model, input_price_per_mtok, output_price_per_mtok, effective_from"),
  ]);

  const roadmaps = roadmapsRes.data ?? [];
  const subs = subsRes.data ?? [];
  const usage = (usageRes.data ?? []) as UsageRow[];
  const pricing = pricingRes.data ?? [];

  // Latest price per provider|model.
  const priceMap = new Map<string, { input: number; output: number }>();
  const priceAt = new Map<string, string>();
  for (const p of pricing) {
    const key = priceKey(p.provider, p.model);
    const eff = String(p.effective_from);
    if (!priceAt.has(key) || eff > (priceAt.get(key) as string)) {
      priceAt.set(key, eff);
      priceMap.set(key, {
        input: Number(p.input_price_per_mtok) || 0,
        output: Number(p.output_price_per_mtok) || 0,
      });
    }
  }
  const costOf = (u: UsageRow) => {
    const price = priceMap.get(priceKey(u.provider, u.model));
    if (!price) return 0;
    return (
      ((u.input_tokens || 0) / 1_000_000) * price.input +
      ((u.output_tokens || 0) / 1_000_000) * price.output
    );
  };

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const totals = {
    submissions: subs.length,
    today: 0,
    last7: 0,
    last30: 0,
    prodCostUsd: 0,
    testCostUsd: 0,
    roadmaps: roadmaps.length,
    published: roadmaps.filter((r) => r.status === "published").length,
  };
  for (const sub of subs) {
    const age = now - new Date(sub.created_at as string).getTime();
    if (age < DAY) totals.today += 1;
    if (age < 7 * DAY) totals.last7 += 1;
    if (age < 30 * DAY) totals.last30 += 1;
  }

  // Per-roadmap + per-provider cost.
  const subsByRoadmap = new Map<string, number>();
  for (const sub of subs) {
    const id = sub.roadmap_id as string;
    subsByRoadmap.set(id, (subsByRoadmap.get(id) ?? 0) + 1);
  }

  const costByRoadmap = new Map<string, { prod: number; test: number }>();
  const providerAgg = new Map<string, { calls: number; cost: number }>();
  for (const u of usage) {
    const cost = costOf(u);
    if (u.source === "test") totals.testCostUsd += cost;
    else totals.prodCostUsd += cost;

    const id = u.roadmap_id ?? "";
    const entry = costByRoadmap.get(id) ?? { prod: 0, test: 0 };
    if (u.source === "test") entry.test += cost;
    else entry.prod += cost;
    costByRoadmap.set(id, entry);

    const prov = u.provider ?? "unknown";
    const pAgg = providerAgg.get(prov) ?? { calls: 0, cost: 0 };
    pAgg.calls += 1;
    pAgg.cost += cost;
    providerAgg.set(prov, pAgg);
  }

  const roadmapStats: RoadmapStat[] = roadmaps.map((r) => {
    const cost = costByRoadmap.get(r.id as string) ?? { prod: 0, test: 0 };
    const owner = r.owner as { email?: string } | null;
    return {
      id: r.id as string,
      slug: r.slug as string,
      title: r.title as string,
      status: r.status as string,
      ownerEmail: owner?.email ?? null,
      submissions: subsByRoadmap.get(r.id as string) ?? 0,
      prodCostUsd: cost.prod,
      testCostUsd: cost.test,
    };
  });

  // Per-instructor rollup.
  const instructorAgg = new Map<
    string,
    { roadmaps: number; submissions: number; cost: number }
  >();
  for (const r of roadmapStats) {
    const email = r.ownerEmail ?? "—";
    const agg = instructorAgg.get(email) ?? {
      roadmaps: 0,
      submissions: 0,
      cost: 0,
    };
    agg.roadmaps += 1;
    agg.submissions += r.submissions;
    agg.cost += r.prodCostUsd + r.testCostUsd;
    instructorAgg.set(email, agg);
  }

  return {
    totals,
    roadmaps: roadmapStats,
    providers: [...providerAgg.entries()].map(([provider, v]) => ({
      provider,
      calls: v.calls,
      costUsd: v.cost,
    })),
    instructors: [...instructorAgg.entries()].map(([email, v]) => ({
      email,
      roadmaps: v.roadmaps,
      submissions: v.submissions,
      costUsd: v.cost,
    })),
  };
}

export type SubmissionRow = {
  id: string;
  roadmapTitle: string;
  name: string | null;
  email: string | null;
  source: string;
  readiness: string | null;
  flags: string[];
  createdAt: string;
  output: unknown;
  answers: unknown;
};

export async function getRecentSubmissions(limit = 100): Promise<SubmissionRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("submissions")
    .select(
      "id, name, email, source, assessment, created_at, output, answers, roadmap:roadmaps(title)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((s) => {
    const assessment = (s.assessment ?? {}) as {
      readinessState?: string;
      flags?: string[];
    };
    const roadmap = s.roadmap as { title?: string } | null;
    return {
      id: s.id as string,
      roadmapTitle: roadmap?.title ?? "—",
      name: (s.name as string | null) ?? null,
      email: (s.email as string | null) ?? null,
      source: s.source as string,
      readiness: assessment.readinessState ?? null,
      flags: assessment.flags ?? [],
      createdAt: s.created_at as string,
      output: s.output,
      answers: s.answers,
    };
  });
}
