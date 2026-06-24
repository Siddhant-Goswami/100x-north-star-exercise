"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROADMAP_STATUSES } from "@/lib/config-schema";
import type { TabProps } from "../roadmap-editor";
import { AreaField, NumberField, TextField } from "./fields";

export function BasicsTab({ config, patch }: TabProps) {
  return (
    <div className="max-w-2xl space-y-5">
      <TextField
        label="Title"
        value={config.title}
        onChange={(v) => patch({ title: v })}
        placeholder="Before You Decide — North Star"
      />
      <TextField
        label="Slug"
        mono
        value={config.slug}
        onChange={(v) =>
          patch({ slug: v.toLowerCase().replace(/[^a-z0-9-]/g, "-") })
        }
        hint="The public URL is /r/<slug>. Lowercase letters, numbers, hyphens."
      />
      <AreaField
        label="Description"
        rows={2}
        value={config.description ?? ""}
        onChange={(v) => patch({ description: v })}
        hint="Shown on the roadmap picker card."
      />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={config.status}
            onValueChange={(v) =>
              patch({ status: v as (typeof config)["status"] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROADMAP_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Only published roadmaps appear on the public picker.
          </p>
        </div>
        <NumberField
          label="Max generations / IP / day"
          value={config.maxGenPerIpPerDay}
          onChange={(v) => patch({ maxGenPerIpPerDay: v ?? 5 })}
        />
      </div>
    </div>
  );
}
