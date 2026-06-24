"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteRoadmap, saveRoadmap } from "@/app/instructor/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RoadmapConfig } from "@/lib/config-schema";
import { BasicsTab } from "./editors/basics-tab";
import { GenerationTab } from "./editors/generation-tab";
import { IntroCtaTab } from "./editors/intro-cta-tab";
import { OutputTab } from "./editors/output-tab";
import { QuestionsTab } from "./editors/questions-tab";
import { ScoringTab } from "./editors/scoring-tab";
import { TestTab } from "./editors/test-tab";

export type TabProps = {
  config: RoadmapConfig;
  patch: (partial: Partial<RoadmapConfig>) => void;
};

export function RoadmapEditor({
  initial,
  isNew,
}: {
  initial: RoadmapConfig;
  isNew: boolean;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<RoadmapConfig>(initial);
  const [saving, setSaving] = useState(false);

  function patch(partial: Partial<RoadmapConfig>) {
    setConfig((c) => ({ ...c, ...partial }));
  }

  async function onSave() {
    setSaving(true);
    const res = await saveRoadmap(config);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || "Could not save.");
      return;
    }
    toast.success("Saved.");
    if (isNew && res.id) {
      router.push(`/instructor/roadmaps/${res.id}`);
    } else {
      router.refresh();
    }
  }

  async function onDelete() {
    if (!config.id) return;
    if (!confirm("Delete this roadmap? This cannot be undone.")) return;
    const res = await deleteRoadmap(config.id);
    if (!res.ok) {
      toast.error(res.error || "Could not delete.");
      return;
    }
    toast.success("Deleted.");
    router.push("/instructor");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-xl font-bold">
              {config.title || "Untitled roadmap"}
            </h1>
            <Badge variant={config.status === "published" ? "default" : "secondary"}>
              {config.status}
            </Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {isNew ? "New roadmap" : `/r/${config.slug}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!isNew && (
            <Button variant="outline" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="basics">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="questions">
            Questions
            <span className="ml-1.5 text-muted-foreground">
              {config.questions.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="generation">Generation</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="introcta">Intro &amp; CTA</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="basics">
            <BasicsTab config={config} patch={patch} />
          </TabsContent>
          <TabsContent value="questions">
            <QuestionsTab config={config} patch={patch} />
          </TabsContent>
          <TabsContent value="output">
            <OutputTab config={config} patch={patch} />
          </TabsContent>
          <TabsContent value="generation">
            <GenerationTab config={config} patch={patch} />
          </TabsContent>
          <TabsContent value="scoring">
            <ScoringTab config={config} patch={patch} />
          </TabsContent>
          <TabsContent value="introcta">
            <IntroCtaTab config={config} patch={patch} />
          </TabsContent>
          <TabsContent value="test">
            <TestTab config={config} isNew={isNew} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
