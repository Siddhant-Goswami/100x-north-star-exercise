"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
  hint,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(mono && "font-mono text-xs")}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AreaField({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
  mono,
  hint,
  error,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  mono?: boolean;
  hint?: string;
  error?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea
        value={value ?? ""}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(mono && "font-mono text-xs", error && "border-destructive")}
      />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** A JSON-backed field that only propagates valid JSON. */
export function JsonField({
  label,
  value,
  onChange,
  rows = 6,
  hint,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
  rows?: number;
  hint?: string;
}) {
  const [text, setText] = useState(JSON.stringify(value ?? null, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <AreaField
      label={label}
      mono
      rows={rows}
      value={text}
      error={err}
      hint={hint}
      onChange={(t) => {
        setText(t);
        try {
          onChange(JSON.parse(t || "null"));
          setErr(null);
        } catch {
          setErr("Invalid JSON");
        }
      }}
    />
  );
}
