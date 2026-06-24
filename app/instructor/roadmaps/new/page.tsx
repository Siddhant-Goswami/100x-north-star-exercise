import { RoadmapEditor } from "@/components/admin/roadmap-editor";
import { makeBlankRoadmap } from "@/lib/roadmap-defaults";

export const dynamic = "force-dynamic";

export default function NewRoadmapPage() {
  return <RoadmapEditor initial={makeBlankRoadmap()} isNew />;
}
