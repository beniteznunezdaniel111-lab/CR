import { timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/config/env";
import { purgeExpiredCandidates } from "@/modules/candidates/retention";
import { purgeExpiredDemos } from "@/modules/demo/retention";
import { purgeOldFaqData } from "@/modules/faq/retention";

// Cron diario de Vercel (vercel.json). Vercel envía "Authorization: Bearer
// <CRON_SECRET>" si la variable está definida; sin ella, el endpoint no hace nada.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"), getServerEnv().CRON_SECRET)) {
    return new Response("No autorizado", { status: 401 });
  }
  const candidates = await purgeExpiredCandidates();
  const faq = await purgeOldFaqData();
  const demos = await purgeExpiredDemos();
  return Response.json({ ...candidates, faq, ...demos });
}
