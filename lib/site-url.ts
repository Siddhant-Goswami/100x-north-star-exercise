/**
 * Resolves the app's canonical base URL (no trailing slash). Used to build
 * absolute auth redirect links (e.g. email-confirmation `emailRedirectTo`) so
 * they point at production instead of whatever Supabase's Site URL fallback is.
 *
 * Order: explicit NEXT_PUBLIC_SITE_URL → the browser's own origin (good for
 * local dev) → Vercel deployment URL → localhost.
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
