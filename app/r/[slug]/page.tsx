import { notFound } from "next/navigation";
import { RoadmapFlow } from "@/components/participant/roadmap-flow";
import { getRoadmapConfigBySlug, toPublicConfig } from "@/lib/roadmaps";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const config = await getRoadmapConfigBySlug(slug, { publishedOnly: true });
  return { title: config ? `${config.title} · 100x` : "Roadmap" };
}

export default async function RoadmapPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const config = await getRoadmapConfigBySlug(slug, { publishedOnly: true });
  if (!config) notFound();
  return <RoadmapFlow config={toPublicConfig(config)} />;
}
