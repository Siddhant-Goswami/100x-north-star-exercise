"use client";

import { useId, useState } from "react";
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
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
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
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
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
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
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
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [err, setErr] = useState<string | null>(null);
  const [syncedValue, setSyncedValue] = useState(value);

  // Re-sync the textarea when `value` changes upstream (e.g. a different record
  // loads). Adjusting state during render is React's recommended alternative to
  // a sync effect; skip when the textarea already represents `value` so we don't
  // reformat the user's input mid-edit.
  if (value !== syncedValue) {
    setSyncedValue(value);
    let current: unknown;
    try {
      current = JSON.parse(text || "null");
    } catch {
      current = undefined;
    }
    if (JSON.stringify(current ?? null) !== JSON.stringify(value ?? null)) {
      setText(JSON.stringify(value ?? null, null, 2));
      setErr(null);
    }
  }

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
