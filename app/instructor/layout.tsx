import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) redirect("/login?next=/instructor");
  const isSuper = profile.role === "super_admin";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <nav className="flex items-center gap-5">
            <Link
              href="/instructor"
              className="font-mono text-xs uppercase tracking-wider text-primary"
            >
              Roadmap Studio
            </Link>
            <Link
              href="/instructor"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              My roadmaps
            </Link>
            {isSuper && (
              <Link
                href="/admin"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Admin
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {profile.email}
            </span>
            <Badge variant="secondary">
              {isSuper ? "Super admin" : "Instructor"}
            </Badge>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
