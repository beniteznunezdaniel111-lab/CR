/** Descarga (JSON) de los datos propios de la persona en esta empresa. */
import { recordAuditEvent } from "@/lib/audit";
import { ALL_ROLES } from "@/lib/auth/roles";
import { roleContextBySlug, exportFilename } from "@/modules/privacy/context";
import { buildMyDataExport, jsonDownload } from "@/modules/privacy/export";

export async function GET(_request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const member = await roleContextBySlug(slug, ALL_ROLES);
  if (!member) return new Response(null, { status: 404 });
  const data = await buildMyDataExport(member.supabase, member.org, member.user.id);
  await recordAuditEvent({
    orgId: member.org.id,
    actorId: member.user.id,
    action: "privacy.exported",
    entityType: "membership",
    details: { scope: "self" },
  });
  return jsonDownload(data, exportFilename("mis-datos", member.org.name));
}
