import "server-only";
import { recordAuditEvents } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

const BATCH = 100;
const MAX_BATCHES = 20;

/**
 * Borra las candidaturas cuyo plazo de retención ha vencido: primero el CV en
 * Storage y después la fila (en cascada: datos identificativos, análisis e
 * historial). En la auditoría queda un evento seudónimo por candidatura.
 * Lo ejecuta el cron diario (/api/cron/retention) con la clave de servidor.
 */
export async function purgeExpiredCandidates(now = new Date()): Promise<{ deleted: number }> {
  const admin = createAdminClient();
  let deleted = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: expired, error } = await admin
      .from("candidates")
      .select("id, org_id, job_id, cv_path")
      .lt("retention_until", now.toISOString())
      .order("retention_until", { ascending: true })
      .limit(BATCH);
    if (error) throw new Error(`Retención: no se pudieron leer las candidaturas: ${error.message}`);
    if (!expired?.length) break;

    const { error: storageError } = await admin.storage
      .from("cvs")
      .remove(expired.map((row) => row.cv_path));
    if (storageError)
      throw new Error(`Retención: no se pudieron borrar los CVs: ${storageError.message}`);

    const ids = expired.map((row) => row.id);
    const { error: deleteError } = await admin.from("candidates").delete().in("id", ids);
    if (deleteError) throw new Error(`Retención: no se pudieron borrar: ${deleteError.message}`);

    await recordAuditEvents(
      expired.map((row) => ({
        orgId: row.org_id,
        actorId: null,
        action: "candidate.deleted",
        entityType: "candidate",
        entityId: row.id,
        details: { job_id: row.job_id, reason: "retention" },
      })),
    );
    deleted += expired.length;
    if (expired.length < BATCH) break;
  }

  return { deleted };
}
