import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/admin");
  if (profile.role !== "super_admin") redirect("/instructor");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <nav className="flex items-center gap-5">
            <span className="font-mono text-xs uppercase tracking-wider text-primary">
              Admin
            </span>
            <Link
              href="/admin"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Overview
            </Link>
            <Link
              href="/admin/submissions"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Submissions
            </Link>
            <Link
              href="/instructor"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              My roadmaps
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Badge>Super admin</Badge>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
