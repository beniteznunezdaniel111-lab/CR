/**
 * Variables públicas (se incrustan en el bundle del navegador). Next solo las
 * sustituye si se leen literalmente como process.env.NEXT_PUBLIC_*.
 */
export function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. En local: abre Docker, " +
        "ejecuta `pnpm db:start` y `pnpm env:local` (crea .env.local) y reinicia `pnpm dev`. " +
        "En producción: configúralas en Vercel (ver .env.example).",
    );
  }
  return { url, key };
}

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
