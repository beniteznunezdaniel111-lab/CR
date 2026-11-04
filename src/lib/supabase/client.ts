import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "@/lib/config/public-env";
import type { Database } from "./database.types";

/** Cliente de Supabase para componentes de cliente (con la sesión del usuario). */
export function createClient() {
  const { url, key } = getPublicSupabaseConfig();
  return createBrowserClient<Database>(url, key);
}
