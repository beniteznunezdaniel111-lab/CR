/** Descarga (JSON) de los datos de una candidatura, para RRHH (derecho de acceso). */
import { recordAuditEvent } from "@/lib/audit";
import { HR_ROLES } from "@/lib/auth/roles";
import { exportFilename, roleContextBySlug } from "@/modules/privacy/context";
import { buildCandidateExport, jsonDownload } from "@/modules/privacy/export";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ org: string; candidateId: string }> },
) {
  const { org: slug, candidateId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(candidateId)) return new Response(null, { status: 404 });
  const hr = await roleContextBySlug(slug, HR_ROLES);
  if (!hr) return new Response(null, { status: 404 });
  const data = await buildCandidateExport(hr.supabase, hr.org.id, candidateId);
  if (!data) return new Response(null, { status: 404 });
  await recordAuditEvent({
    orgId: hr.org.id,
    actorId: hr.user.id,
    action: "privacy.exported",
    entityType: "candidate",
    entityId: candidateId,
    details: { scope: "candidate" },
  });
  return jsonDownload(
    data,
    exportFilename("candidatura", data.candidate.reference.replace("#", "")),
  );
}
