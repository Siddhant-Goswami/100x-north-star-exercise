"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/instructor";
  const supabase = createSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    router.push(next);
    router.refresh();
  }

  async function signUp() {
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data.session) {
      router.push(next);
      router.refresh();
    } else {
      toast.success("Account created. Check your email to confirm, then sign in.");
    }
  }

  return (
    <div className="mx-auto mt-24 w-full max-w-sm px-5">
      <p className="font-mono text-xs uppercase tracking-wider text-primary">
        100x Roadmap Studio
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Instructor sign in</h1>

      <Tabs defaultValue="signin" className="mt-8">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Create account</TabsTrigger>
        </TabsList>

        <TabsContent value="signin" className="mt-6 space-y-4">
          <Field label="Email" id="email-in" type="email" value={email} onChange={setEmail} />
          <Field label="Password" id="pass-in" type="password" value={password} onChange={setPassword} />
          <Button className="w-full" disabled={busy} onClick={signIn}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </TabsContent>

        <TabsContent value="signup" className="mt-6 space-y-4">
          <Field label="Full name" id="name-up" value={fullName} onChange={setFullName} />
          <Field label="Email" id="email-up" type="email" value={email} onChange={setEmail} />
          <Field label="Password" id="pass-up" type="password" value={password} onChange={setPassword} />
          <Button className="w-full" disabled={busy} onClick={signUp}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
