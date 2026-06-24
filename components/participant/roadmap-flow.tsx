"use client";

import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  Answers,
  GeneratedOutput,
  PublicRoadmapConfig,
} from "@/lib/config-schema";
import { isOtherValue, QuestionField } from "./question-field";
import { OutputRenderer } from "./output-renderer";

const PHONE_RE = /^\+[1-9]\d{9,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Status = "form" | "generating" | "done" | "error";

export function RoadmapFlow({ config }: { config: PublicRoadmapConfig }) {
  const questions = useMemo(
    () => config.questions.filter((q) => q.type !== "intro"),
    [config.questions],
  );
  const lastIndex = questions.length + 1; // 0 = landing, last = contact

  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [hasRefined, setHasRefined] = useState(false);

  const [contact, setContact] = useState({
    name: "",
    email: "",
    phone: "",
    consent: false,
  });

  const [status, setStatus] = useState<Status>("form");
  const [output, setOutput] = useState<GeneratedOutput | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const startedAt = useRef<number>(0);
  const storageKey = `roadmap:${config.slug}:v1`;

  // Restore progress.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.answers) setAnswers(saved.answers);
        if (saved.otherTexts) setOtherTexts(saved.otherTexts);
        if (saved.contact) setContact((c) => ({ ...c, ...saved.contact }));
        startedAt.current = saved.startedAt || Date.now();
      } else {
        startedAt.current = Date.now();
      }
    } catch {
      startedAt.current = Date.now();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist progress.
  useEffect(() => {
    if (!startedAt.current) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ answers, otherTexts, contact, startedAt: startedAt.current }),
      );
    } catch {
      /* ignore quota errors */
    }
  }, [answers, otherTexts, contact, storageKey]);

  const isLanding = stepIndex === 0;
  const isContact = stepIndex === lastIndex;
  const currentQuestion = !isLanding && !isContact ? questions[stepIndex - 1] : null;

  function isAnswered(key: string): boolean {
    const v = answers[key];
    return Array.isArray(v) ? v.length > 0 : String(v ?? "").trim().length > 0;
  }

  function goNext() {
    setError(null);
    if (currentQuestion) {
      const q = currentQuestion;
      if (q.required && !isAnswered(q.questionKey)) {
        setError("Please answer this to continue.");
        return;
      }
      // One-time "refine" jump back to the target question.
      const refineTarget = q.config?.refineTarget as string | undefined;
      if (
        q.config?.vehicle &&
        refineTarget &&
        answers[q.questionKey] === "refine" &&
        !hasRefined
      ) {
        const targetIdx = questions.findIndex(
          (x) => x.questionKey === refineTarget,
        );
        if (targetIdx >= 0) {
          setHasRefined(true);
          setStepIndex(targetIdx + 1);
          return;
        }
      }
    }
    setStepIndex((i) => Math.min(i + 1, lastIndex));
  }

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function buildAnswers(): Answers {
    const result: Answers = {};
    for (const q of questions) {
      let value = answers[q.questionKey];
      if (value === undefined) continue;
      const other = otherTexts[q.questionKey]?.trim();
      if (q.allowOther && other) {
        if (typeof value === "string" && isOtherValue(value)) value = other;
        else if (Array.isArray(value))
          value = value.map((v) => (isOtherValue(v) ? other : v));
      }
      result[q.questionKey] = value;
    }
    return result;
  }

  async function submit() {
    setServerError(null);
    if (contact.name.trim().length < 2) {
      setServerError("Please enter your name.");
      return;
    }
    if (!PHONE_RE.test(contact.phone.trim())) {
      setServerError("Please enter a valid phone number in +country format, e.g. +14155551234.");
      return;
    }
    if (contact.email && !EMAIL_RE.test(contact.email.trim())) {
      setServerError("That email doesn't look right.");
      return;
    }
    if (!contact.consent) {
      setServerError("Please tick the consent box so we can send your roadmap.");
      return;
    }

    setStatus("generating");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: config.slug,
          name: contact.name.trim(),
          email: contact.email.trim() || null,
          phone: contact.phone.trim(),
          consent: contact.consent,
          answers: buildAnswers(),
          elapsedSeconds: Math.round((Date.now() - startedAt.current) / 1000),
          startedAt: new Date(startedAt.current).toISOString(),
          website: "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setOutput(data.output as GeneratedOutput);
      setStatus("done");
    } catch {
      setServerError("Network error. Please try again.");
      setStatus("error");
    }
  }

  /* ----------------------------- Result view ----------------------------- */
  if (status === "done" && output) {
    const cta = config.cta.result ?? {};
    return (
      <div className="mx-auto max-w-2xl px-5 py-12">
        <OutputRenderer sections={config.outputSchema} output={output} />
        {(cta.nextStepTitle || cta.buttonLabel) && (
          <div className="mt-10 rounded-xl border bg-accent/40 p-6">
            {cta.nextStepTitle && (
              <h3 className="text-lg font-semibold">{cta.nextStepTitle}</h3>
            )}
            {cta.nextStepBody && (
              <p className="mt-1 text-sm text-muted-foreground">{cta.nextStepBody}</p>
            )}
            {cta.buttonLabel && cta.buttonUrl && (
              <Button asChild className="mt-4">
                <a href={cta.buttonUrl} target="_blank" rel="noreferrer">
                  {cta.buttonLabel}
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  /* --------------------------- Generating view --------------------------- */
  if (status === "generating") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-5 text-center">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-lg font-medium">Building your roadmap…</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Reading your answers and grounding a plan to your goal. This usually
          takes 15–30 seconds.
        </p>
      </div>
    );
  }

  const progress = isLanding
    ? 0
    : Math.round(((Math.min(stepIndex, lastIndex)) / lastIndex) * 100);

  /* ------------------------------ Form view ------------------------------ */
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-5">
      <header className="flex items-center justify-between gap-4 py-5">
        <span className="font-mono text-xs uppercase tracking-wider text-primary">
          {config.title}
        </span>
        {!isLanding && (
          <span className="text-xs text-muted-foreground">
            {isContact ? "Last step" : `Question ${stepIndex} of ${questions.length}`}
          </span>
        )}
      </header>
      {!isLanding && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <main className="flex flex-1 flex-col justify-center py-10">
        {isLanding && <Landing config={config} onStart={() => setStepIndex(1)} />}

        {currentQuestion && (
          <QuestionField
            key={currentQuestion.questionKey}
            question={currentQuestion}
            value={answers[currentQuestion.questionKey]}
            otherText={otherTexts[currentQuestion.questionKey] ?? ""}
            onChange={(v) =>
              setAnswers((a) => ({ ...a, [currentQuestion.questionKey]: v }))
            }
            onOtherChange={(t) =>
              setOtherTexts((o) => ({ ...o, [currentQuestion.questionKey]: t }))
            }
            error={error}
          />
        )}

        {isContact && (
          <ContactStep
            config={config}
            contact={contact}
            setContact={setContact}
            error={serverError}
          />
        )}
      </main>

      {!isLanding && (
        <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background/80 py-4 backdrop-blur">
          <Button variant="ghost" onClick={goBack} className="gap-1.5">
            <ArrowLeft className="size-4" /> Back
          </Button>
          {isContact ? (
            <Button onClick={submit} className="gap-1.5">
              {config.cta.contact?.submitLabel || "Get my roadmap"}
            </Button>
          ) : (
            <Button onClick={goNext} className="gap-1.5">
              {currentQuestion &&
              currentQuestion.config?.vehicle &&
              answers[currentQuestion.questionKey] === "refine" &&
              !hasRefined
                ? "Refine my North Star"
                : "Continue"}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </footer>
      )}
    </div>
  );
}

function Landing({
  config,
  onStart,
}: {
  config: PublicRoadmapConfig;
  onStart: () => void;
}) {
  const intro = config.intro;
  return (
    <div className="space-y-6">
      {intro.eyebrow && (
        <p className="font-mono text-xs uppercase tracking-wider text-primary">
          {intro.eyebrow}
        </p>
      )}
      <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        {intro.title ?? config.title}
      </h1>
      {intro.subtitle && (
        <p className="text-lg leading-relaxed text-muted-foreground text-pretty">
          {intro.subtitle}
        </p>
      )}
      {intro.body && (
        <p className="leading-relaxed text-foreground/80 text-pretty">{intro.body}</p>
      )}
      {intro.promises && intro.promises.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {intro.promises.map((p, i) => (
            <div key={i} className="rounded-lg border p-4">
              <p className="font-semibold">{p.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      )}
      <Button size="lg" onClick={onStart} className="gap-1.5">
        Start <ArrowRight className="size-4" />
      </Button>
      {intro.proof && (
        <p className="text-sm text-muted-foreground">{intro.proof}</p>
      )}
      {intro.testimonial?.result && (
        <figure className="rounded-lg border bg-muted/40 p-4 text-sm">
          <blockquote className="leading-relaxed">
            “{intro.testimonial.result}”
          </blockquote>
          <figcaption className="mt-2 text-muted-foreground">
            {intro.testimonial.name}
            {intro.testimonial.detail ? ` · ${intro.testimonial.detail}` : ""}
          </figcaption>
        </figure>
      )}
      <p className="pt-2">
        <Link
          href="/"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Choose a different roadmap
        </Link>
      </p>
    </div>
  );
}

function ContactStep({
  config,
  contact,
  setContact,
  error,
}: {
  config: PublicRoadmapConfig;
  contact: { name: string; email: string; phone: string; consent: boolean };
  setContact: React.Dispatch<
    React.SetStateAction<{
      name: string;
      email: string;
      phone: string;
      consent: boolean;
    }>
  >;
  error: string | null;
}) {
  const c = config.cta.contact ?? {};
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          {c.headline || "Send this in for your personalized roadmap"}
        </h2>
        {c.subtitle && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {c.subtitle}
          </p>
        )}
      </div>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            value={contact.name}
            onChange={(e) => setContact((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email (optional)</Label>
          <Input
            id="email"
            type="email"
            value={contact.email}
            onChange={(e) => setContact((p) => ({ ...p, email: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone (with country code)</Label>
          <Input
            id="phone"
            placeholder="+14155551234"
            value={contact.phone}
            onChange={(e) => setContact((p) => ({ ...p, phone: e.target.value }))}
          />
        </div>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={contact.consent}
            className="mt-0.5"
            onCheckedChange={(v) =>
              setContact((p) => ({ ...p, consent: v === true }))
            }
          />
          <span className="leading-relaxed text-muted-foreground">
            {c.consentLabel ||
              "You can message me about my roadmap and the program."}
          </span>
        </label>
      </div>
      {c.privacyNote && (
        <p className="text-xs text-muted-foreground">{c.privacyNote}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
