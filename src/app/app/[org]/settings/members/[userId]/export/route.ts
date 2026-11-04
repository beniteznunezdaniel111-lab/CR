/** Descarga (JSON) de los datos de un miembro, para el admin (derecho de acceso). */
import { recordAuditEvent } from "@/lib/audit";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { exportFilename, roleContextBySlug } from "@/modules/privacy/context";
import { buildMemberExport, jsonDownload } from "@/modules/privacy/export";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ org: string; userId: string }> },
) {
  const { org: slug, userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return new Response(null, { status: 404 });
  const admin = await roleContextBySlug(slug, ADMIN_ROLES);
  if (!admin) return new Response(null, { status: 404 });
  const data = await buildMemberExport(admin.supabase, admin.org, userId);
  if (!data) return new Response(null, { status: 404 });
  await recordAuditEvent({
    orgId: admin.org.id,
    actorId: admin.user.id,
    action: "privacy.exported",
    entityType: "membership",
    details: { scope: "member" },
  });
  return jsonDownload(data, exportFilename("datos-persona", data.person.name ?? "persona"));
}
