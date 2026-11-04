import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Registro de auditoría desde el servidor. Muchos eventos se registran solos con
 * triggers en la base de datos (altas, cambios de rol, invitaciones...); esto es
 * para eventos de la aplicación (análisis de IA, decisiones, descargas...).
 *
 * REGLA: `details` nunca lleva datos personales (nombres, emails, textos de CV).
 * Solo identificadores, versiones, modelos y estados.
 */
export type AuditEventInput = {
  orgId: string;
  actorId: string | null;
  action: `${string}.${string}`;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, Json | undefined>;
};

export async function recordAuditEvent(event: AuditEventInput): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_events").insert({
    org_id: event.orgId,
    actor_id: event.actorId,
    actor_type: event.actorId ? "user" : "system",
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    details: (event.details ?? {}) as Json,
  });
  if (error) {
    // La auditoría es obligatoria: si falla, la operación debe fallar.
    throw new Error(`No se pudo registrar la auditoría (${event.action}): ${error.message}`);
  }
}
