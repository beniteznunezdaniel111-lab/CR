import { APP_NAME } from "@/lib/config/brand";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function invitationEmail(params: {
  organizationName: string;
  roleLabel: string;
  inviterName: string | null;
  link: string;
  expiresInDays: number;
}) {
  const who = params.inviterName ? `${params.inviterName} te ha invitado` : "Te han invitado";
  const text = [
    `${who} a unirte a ${params.organizationName} en ${APP_NAME} con el rol de ${params.roleLabel}.`,
    "",
    `Acepta la invitación aquí: ${params.link}`,
    "",
    `El enlace caduca en ${params.expiresInDays} días. Si no esperabas este mensaje, puedes ignorarlo.`,
  ].join("\n");
  const html = `<p>${escapeHtml(who)} a unirte a <strong>${escapeHtml(params.organizationName)}</strong> en ${APP_NAME} con el rol de <strong>${escapeHtml(params.roleLabel)}</strong>.</p>
<p><a href="${escapeHtml(params.link)}">Aceptar la invitación</a></p>
<p style="color:#666">El enlace caduca en ${params.expiresInDays} días. Si no esperabas este mensaje, puedes ignorarlo.</p>`;
  return { subject: `Invitación a ${params.organizationName} en ${APP_NAME}`, text, html };
}
