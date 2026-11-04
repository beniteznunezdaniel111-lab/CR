import { createHash, randomBytes } from "node:crypto";

/** Días de validez de una invitación (coincide con el default de la tabla). */
export const INVITATION_TTL_DAYS = 7;

/**
 * Token de invitación: 256 bits aleatorios en base64url. En la base de datos
 * solo se guarda su hash SHA-256 (hex), el mismo que calcula accept_invitation().
 */
export function generateInvitationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
