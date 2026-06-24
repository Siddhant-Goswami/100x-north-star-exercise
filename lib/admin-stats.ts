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
  created_at: string;
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
      .select(
        "roadmap_id, provider, model, input_tokens, output_tokens, source, created_at",
      ),
    supabase
      .from("model_pricing")
      .select("provider, model, input_price_per_mtok, output_price_per_mtok, effective_from"),
  ]);

  // Fail loud: an auth/schema/query error must not silently render an empty
  // dashboard that looks like real (zeroed) data.
  const queryError =
    roadmapsRes.error ?? subsRes.error ?? usageRes.error ?? pricingRes.error;
  if (queryError) {
    throw new Error(`Admin overview query failed: ${queryError.message}`);
  }

  const roadmaps = roadmapsRes.data ?? [];
  const subs = subsRes.data ?? [];
  const usage = (usageRes.data ?? []) as UsageRow[];
  const pricing = pricingRes.data ?? [];

  // Price history per provider|model, oldest → newest, so each usage event is
  // costed at the rate in effect when it occurred (not today's rate).
  type PricePoint = { from: string; input: number; output: number };
  const priceHistory = new Map<string, PricePoint[]>();
  for (const p of pricing) {
    const key = priceKey(p.provider, p.model);
    const list = priceHistory.get(key) ?? [];
    list.push({
      from: String(p.effective_from),
      input: Number(p.input_price_per_mtok) || 0,
      output: Number(p.output_price_per_mtok) || 0,
    });
    priceHistory.set(key, list);
  }
  for (const list of priceHistory.values()) {
    list.sort((a, b) => a.from.localeCompare(b.from));
  }
  const priceFor = (u: UsageRow): PricePoint | null => {
    const list = priceHistory.get(priceKey(u.provider, u.model));
    if (!list?.length) return null;
    const at = u.created_at ?? "";
    // Newest price whose effective_from is on/before the event; else earliest.
    let chosen: PricePoint | null = null;
    for (const point of list) {
      if (point.from <= at) chosen = point;
      else break;
    }
    return chosen ?? list[0];
  };
  const costOf = (u: UsageRow) => {
    const price = priceFor(u);
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
};

export async function getRecentSubmissions(limit = 100): Promise<SubmissionRow[]> {
  const supabase = createSupabaseAdminClient();
  // Summary columns only. The heavy output/answers JSON is loaded lazily per row
  // (getSubmissionDetail) when a details dialog opens, keeping this payload small.
  const { data, error } = await supabase
    .from("submissions")
    .select(
      "id, name, email, source, assessment, created_at, roadmap:roadmaps(title)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load submissions: ${error.message}`);
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
    };
  });
}

export type SubmissionDetail = { output: unknown; answers: unknown };

/** Lazily fetch a single submission's heavy fields for the details view. */
export async function getSubmissionDetail(
  id: string,
): Promise<SubmissionDetail | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("submissions")
    .select("output, answers")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load submission ${id}: ${error.message}`);
  if (!data) return null;
  return { output: data.output, answers: data.answers };
}
