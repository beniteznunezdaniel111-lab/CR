"use client";

import { useTranslations } from "next-intl";

/** Muestra los errores de un campo. Los mensajes son claves de "validation". */
export function FieldError({ id, messages }: { id?: string; messages?: string[] }) {
  const t = useTranslations("validation");
  if (!messages?.length) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {[...new Set(messages.map((message) => (t.has(message) ? t(message) : t("invalid"))))].join(
        " ",
      )}
    </p>
  );
}

export function FormMessage({ status, message }: { status: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      role={status === "error" ? "alert" : "status"}
      className={
        status === "error"
          ? "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
      }
    >
      {message}
    </p>
  );
}
