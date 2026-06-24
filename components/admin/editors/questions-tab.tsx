"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { type Option, type Question, QUESTION_TYPES } from "@/lib/config-schema";
import type { TabProps } from "../roadmap-editor";
import { AreaField, JsonField, NumberField, TextField } from "./fields";

function blankQuestion(position: number): Question {
  return {
    questionKey: `question_${position + 1}`,
    position,
    type: "text",
    title: "",
    options: [],
    allowOther: false,
    required: true,
    config: {},
  };
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: Option[];
  onChange: (o: Option[]) => void;
}) {
  function set(idx: number, which: 0 | 1, val: string) {
    onChange(
      options.map((o, i) =>
        i === idx
          ? ((which === 0 ? [val, o[1]] : [o[0], val]) as Option)
          : o,
      ),
    );
  }
  return (
    <div className="space-y-2">
      <Label>Options</Label>
      {options.map((o, idx) => (
        <div key={idx} className="flex gap-2">
          <Input
            className="w-1/3 font-mono text-xs"
            placeholder="value"
            value={o[0]}
            onChange={(e) => set(idx, 0, e.target.value)}
          />
          <Input
            className="flex-1"
            placeholder="label"
            value={o[1]}
            onChange={(e) => set(idx, 1, e.target.value)}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(options.filter((_, i) => i !== idx))}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...options, ["", ""] as Option])}
      >
        <Plus className="size-4" /> Add option
      </Button>
    </div>
  );
}

export function QuestionsTab({ config, patch }: TabProps) {
  const questions = config.questions;

  function setQuestions(next: Question[]) {
    patch({ questions: next.map((q, i) => ({ ...q, position: i })) });
  }
  function update(i: number, p: Partial<Question>) {
    setQuestions(questions.map((q, idx) => (idx === i ? { ...q, ...p } : q)));
  }
  function remove(i: number) {
    setQuestions(questions.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    setQuestions(next);
  }

  return (
    <div className="space-y-4">
      {questions.length === 0 && (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      )}

      {questions.map((q, i) => {
        const hasOptions = q.type === "single" || q.type === "multi";
        const isOpenText = q.type === "text" || q.type === "long";
        return (
          <div key={i} className="space-y-4 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">
                Q{i + 1}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={i === questions.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(i)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={q.type}
                  onValueChange={(v) => update(i, { type: v as Question["type"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_TYPES.filter((t) => t !== "intro").map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TextField
                label="Key"
                mono
                value={q.questionKey}
                onChange={(v) =>
                  update(i, { questionKey: v.replace(/[^a-zA-Z0-9_]/g, "_") })
                }
              />
            </div>

            <TextField
              label="Title"
              value={q.title}
              onChange={(v) => update(i, { title: v })}
            />
            <TextField
              label="Help (optional)"
              value={q.help ?? ""}
              onChange={(v) => update(i, { help: v })}
            />

            {isOpenText && (
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  label="Placeholder"
                  value={q.placeholder ?? ""}
                  onChange={(v) => update(i, { placeholder: v })}
                />
                <NumberField
                  label="Max length"
                  value={q.maxLength}
                  onChange={(v) => update(i, { maxLength: v })}
                />
              </div>
            )}

            {hasOptions && (
              <OptionsEditor
                options={q.options}
                onChange={(opts) => update(i, { options: opts })}
              />
            )}

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={q.required}
                  onCheckedChange={(c) => update(i, { required: c })}
                />
                Required
              </label>
              {hasOptions && (
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={q.allowOther}
                    onCheckedChange={(c) => update(i, { allowOther: c })}
                  />
                  Allow “other” free text
                </label>
              )}
            </div>

            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Advanced (module, JSON config)
              </summary>
              <div className="mt-3 space-y-3">
                <TextField
                  label="Module"
                  value={q.module ?? ""}
                  onChange={(v) => update(i, { module: v })}
                />
                <JsonField
                  label="Question config (JSON)"
                  value={q.config}
                  rows={4}
                  onChange={(v) =>
                    update(i, {
                      config: (v as Question["config"]) ?? {},
                    })
                  }
                />
              </div>
            </details>
          </div>
        );
      })}

      <Button
        variant="outline"
        onClick={() => setQuestions([...questions, blankQuestion(questions.length)])}
      >
        <Plus className="size-4" /> Add question
      </Button>
    </div>
  );
}
