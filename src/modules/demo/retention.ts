import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeOrgFiles } from "@/modules/privacy/storage";
import { DEMO_TTL_DAYS } from "./content";

/**
 * Borra las empresas demo caducadas (con sus ficheros). Lo ejecuta el cron diario
 * con la clave de servidor; solo toca empresas marcadas como demo.
 */
export async function purgeExpiredDemos(now = new Date()): Promise<{ demos: number }> {
  const admin = createAdminClient();
  const cutoff = new Date(now.getTime() - DEMO_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: expired, error } = await admin
    .from("organizations")
    .select("id")
    .eq("is_demo", true)
    .lt("created_at", cutoff)
    .limit(20);
  if (error) throw new Error(`Demos: no se pudieron leer: ${error.message}`);

  let deleted = 0;
  for (const org of expired ?? []) {
    await removeOrgFiles(org.id);
    const { error: deleteError } = await admin
      .from("organizations")
      .delete()
      .eq("id", org.id)
      .eq("is_demo", true);
    if (deleteError) throw new Error(`Demos: no se pudo borrar: ${deleteError.message}`);
    deleted += 1;
  }
  return { demos: deleted };
}
