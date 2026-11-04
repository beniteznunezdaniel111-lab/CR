import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/config/env";

/** El registro exige código de acceso si SIGNUP_ACCESS_CODE está definido. */
export function isAccessCodeRequired(): boolean {
  return Boolean(getServerEnv().SIGNUP_ACCESS_CODE);
}

/** Comparación en tiempo constante (se comparan hashes de igual longitud). */
export function isValidAccessCode(candidate: string | undefined): boolean {
  const expected = getServerEnv().SIGNUP_ACCESS_CODE;
  if (!expected) return true;
  if (!candidate) return false;
  const a = createHash("sha256").update(candidate.trim()).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
