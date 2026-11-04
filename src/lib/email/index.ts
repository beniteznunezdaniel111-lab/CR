import "server-only";
import nodemailer from "nodemailer";
import { getServerEnv } from "@/lib/config/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export function isEmailConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

/**
 * Envía un email por SMTP (Brevo, Resend, etc.). Si no hay SMTP configurado no
 * envía nada y devuelve `sent: false`: la interfaz ofrece entonces el enlace
 * para copiarlo a mano.
 */
export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean }> {
  const env = getServerEnv();
  if (!env.SMTP_HOST || !env.SMTP_FROM) return { sent: false };

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });

  try {
    await transporter.sendMail({ from: env.SMTP_FROM, ...message });
    return { sent: true };
  } catch (error) {
    console.error("[email] Error al enviar:", error instanceof Error ? error.message : error);
    return { sent: false };
  }
}
