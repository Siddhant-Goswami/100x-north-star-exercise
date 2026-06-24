"use client";

import type { Cta, Intro, Module } from "@/lib/config-schema";
import type { TabProps } from "../roadmap-editor";
import { AreaField, JsonField, TextField } from "./fields";

export function IntroCtaTab({ config, patch }: TabProps) {
  const intro = config.intro;
  const cta = config.cta;

  function patchIntro(p: Partial<Intro>) {
    patch({ intro: { ...intro, ...p } });
  }
  function patchContact(p: Partial<NonNullable<Cta["contact"]>>) {
    patch({ cta: { ...cta, contact: { ...cta.contact, ...p } } });
  }
  function patchResult(p: Partial<NonNullable<Cta["result"]>>) {
    patch({ cta: { ...cta, result: { ...cta.result, ...p } } });
  }

  return (
    <div className="grid max-w-4xl gap-10 lg:grid-cols-2">
      <section className="space-y-4">
        <h3 className="font-semibold">Landing / intro</h3>
        <TextField
          label="Eyebrow"
          value={intro.eyebrow ?? ""}
          onChange={(v) => patchIntro({ eyebrow: v })}
        />
        <TextField
          label="Title"
          value={intro.title ?? ""}
          onChange={(v) => patchIntro({ title: v })}
        />
        <AreaField
          label="Subtitle"
          rows={2}
          value={intro.subtitle ?? ""}
          onChange={(v) => patchIntro({ subtitle: v })}
        />
        <AreaField
          label="Body"
          rows={3}
          value={intro.body ?? ""}
          onChange={(v) => patchIntro({ body: v })}
        />
        <TextField
          label="Proof line"
          value={intro.proof ?? ""}
          onChange={(v) => patchIntro({ proof: v })}
        />
        <JsonField
          label="Promises (JSON array of {title, body})"
          rows={6}
          value={intro.promises ?? []}
          onChange={(v) =>
            patchIntro({ promises: (v as Intro["promises"]) ?? [] })
          }
        />
        <JsonField
          label="Testimonial (JSON {result, name, detail})"
          rows={4}
          value={intro.testimonial ?? null}
          onChange={(v) =>
            patchIntro({ testimonial: (v as Intro["testimonial"]) ?? undefined })
          }
        />
        <JsonField
          label="Modules (JSON array of {id, title, number})"
          rows={5}
          value={config.modules ?? []}
          onChange={(v) => patch({ modules: (v as Module[]) ?? [] })}
        />
      </section>

      <section className="space-y-4">
        <h3 className="font-semibold">Contact step</h3>
        <TextField
          label="Headline"
          value={cta.contact?.headline ?? ""}
          onChange={(v) => patchContact({ headline: v })}
        />
        <AreaField
          label="Subtitle"
          rows={2}
          value={cta.contact?.subtitle ?? ""}
          onChange={(v) => patchContact({ subtitle: v })}
        />
        <TextField
          label="Consent label"
          value={cta.contact?.consentLabel ?? ""}
          onChange={(v) => patchContact({ consentLabel: v })}
        />
        <TextField
          label="Privacy note"
          value={cta.contact?.privacyNote ?? ""}
          onChange={(v) => patchContact({ privacyNote: v })}
        />
        <TextField
          label="Submit button label"
          value={cta.contact?.submitLabel ?? ""}
          onChange={(v) => patchContact({ submitLabel: v })}
        />

        <h3 className="pt-4 font-semibold">Result CTA</h3>
        <TextField
          label="Next-step title"
          value={cta.result?.nextStepTitle ?? ""}
          onChange={(v) => patchResult({ nextStepTitle: v })}
        />
        <AreaField
          label="Next-step body"
          rows={2}
          value={cta.result?.nextStepBody ?? ""}
          onChange={(v) => patchResult({ nextStepBody: v })}
        />
        <TextField
          label="Button label"
          value={cta.result?.buttonLabel ?? ""}
          onChange={(v) => patchResult({ buttonLabel: v })}
        />
        <TextField
          label="Button URL"
          value={cta.result?.buttonUrl ?? ""}
          onChange={(v) => patchResult({ buttonUrl: v })}
        />
      </section>
    </div>
  );
}
