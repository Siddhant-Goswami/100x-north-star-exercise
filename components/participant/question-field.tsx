"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { Question } from "@/lib/config-schema";
import { cn } from "@/lib/utils";
import { NorthStarGuide } from "./north-star-guide";

const OTHER_VALUES = new Set(["else", "other"]);
export function isOtherValue(value: string): boolean {
  return OTHER_VALUES.has(value);
}

type Props = {
  question: Question;
  value: string | string[] | undefined;
  otherText: string;
  onChange: (value: string | string[]) => void;
  onOtherChange: (text: string) => void;
  error?: string | null;
};

export function QuestionField({
  question,
  value,
  otherText,
  onChange,
  onOtherChange,
  error,
}: Props) {
  const isNorthStar = !!question.config?.northStar;

  const showOther =
    question.allowOther &&
    (typeof value === "string"
      ? isOtherValue(value)
      : Array.isArray(value)
        ? value.some(isOtherValue)
        : false);

  const stringValue = typeof value === "string" ? value : "";
  const arrayValue = Array.isArray(value) ? value : [];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-balance">
          {question.title}
        </h2>
        {question.help && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {question.help}
          </p>
        )}
      </div>

      {isNorthStar && <NorthStarGuide config={question.config} />}

      {(question.type === "text" || question.type === "long") && (
        <div className="space-y-1.5">
          {question.type === "text" ? (
            <Input
              value={stringValue}
              maxLength={question.maxLength}
              placeholder={question.placeholder}
              onChange={(e) => onChange(e.target.value)}
              aria-invalid={!!error}
            />
          ) : (
            <Textarea
              value={stringValue}
              maxLength={question.maxLength}
              placeholder={question.placeholder}
              onChange={(e) => onChange(e.target.value)}
              className="min-h-36"
              aria-invalid={!!error}
            />
          )}
          {question.maxLength && (
            <p className="text-right text-xs text-muted-foreground">
              {stringValue.length}/{question.maxLength}
            </p>
          )}
        </div>
      )}

      {question.type === "single" && (
        <RadioGroup
          value={stringValue}
          onValueChange={(v) => onChange(v)}
          className="gap-2"
        >
          {question.options.map(([val, label]) => (
            <label
              key={val}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/60",
                stringValue === val && "border-primary bg-accent",
              )}
            >
              <RadioGroupItem value={val} className="mt-0.5" />
              <span className="text-sm leading-relaxed">{label}</span>
            </label>
          ))}
        </RadioGroup>
      )}

      {question.type === "multi" && (
        <div className="grid gap-2">
          {question.options.map(([val, label]) => {
            const checked = arrayValue.includes(val);
            return (
              <label
                key={val}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/60",
                  checked && "border-primary bg-accent",
                )}
              >
                <Checkbox
                  checked={checked}
                  className="mt-0.5"
                  onCheckedChange={(c) =>
                    onChange(
                      c
                        ? [...arrayValue, val]
                        : arrayValue.filter((x) => x !== val),
                    )
                  }
                />
                <span className="text-sm leading-relaxed">{label}</span>
              </label>
            );
          })}
        </div>
      )}

      {showOther && (
        <Input
          value={otherText}
          placeholder="Tell us more…"
          onChange={(e) => onOtherChange(e.target.value)}
        />
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
