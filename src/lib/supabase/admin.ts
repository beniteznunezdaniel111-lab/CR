import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/config/env";
import type { Database } from "./database.types";

/**
 * Cliente con la clave secreta (service_role): se SALTA RLS.
 *
 * Uso permitido (ver CLAUDE.md): registrar auditoría y uso de IA, consultar el
 * tope de gasto, tareas programadas y scripts. Nunca para leer o escribir datos
 * de negocio en nombre de un usuario: para eso está src/lib/supabase/server.ts.
 */
export function createAdminClient() {
  const env = getServerEnv();
  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
