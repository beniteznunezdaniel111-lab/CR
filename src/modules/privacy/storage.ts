import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Buckets con ficheros de una empresa (la carpeta raíz es su id). */
const ORG_BUCKETS = ["cvs", "kb-documents", "training-sources"] as const;

async function listFolder(bucket: string, prefix: string): Promise<string[]> {
  const admin = createAdminClient();
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`No se pudieron listar ${bucket}/${prefix}: ${error.message}`);
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      // Las "carpetas" no tienen id: se recorren.
      if (item.id === null) paths.push(...(await listFolder(bucket, path)));
      else paths.push(path);
    }
    if (!data || data.length < 1000) break;
  }
  return paths;
}

/**
 * Borra todos los ficheros de una empresa (CVs, documentos de la FAQ y fuentes de
 * formación). Lo usa el cierre de una empresa (y la caducidad de las demo) con la
 * clave de servidor, después de comprobar que quien lo pide es su admin.
 */
export async function removeOrgFiles(orgId: string): Promise<number> {
  const admin = createAdminClient();
  let removed = 0;
  for (const bucket of ORG_BUCKETS) {
    const paths = await listFolder(bucket, orgId);
    for (let start = 0; start < paths.length; start += 100) {
      const batch = paths.slice(start, start + 100);
      const { error } = await admin.storage.from(bucket).remove(batch);
      if (error) throw new Error(`No se pudieron borrar ficheros de ${bucket}: ${error.message}`);
      removed += batch.length;
    }
  }
  return removed;
}
