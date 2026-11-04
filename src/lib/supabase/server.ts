import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseConfig } from "@/lib/config/public-env";
import type { Database } from "./database.types";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Actúa con la sesión del usuario: TODAS las consultas pasan por RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getPublicSupabaseConfig();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy
          // (src/proxy.ts) ya refresca la sesión en cada petición.
        }
      },
    },
  });
}
