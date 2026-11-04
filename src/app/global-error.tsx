"use client";

import Link from "next/link";
import messages from "../../messages/es.json";

/**
 * Último recurso si falla el propio layout raíz: sin proveedor de traducciones,
 * así que los textos se leen directamente de messages/es.json.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = messages.errorPage;
  return (
    <html lang="es">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100dvh",
          margin: 0,
          padding: 16,
          textAlign: "center",
        }}
      >
        <main role="alert" style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 22 }}>{t.title}</h1>
          <p style={{ color: "#555" }}>{t.description}</p>
          {error.digest ? (
            <p style={{ fontFamily: "monospace", fontSize: 12, color: "#777" }}>
              {t.reference.replace("{digest}", error.digest)}
            </p>
          ) : null}
          <button type="button" onClick={reset} style={{ padding: "8px 16px", marginRight: 8 }}>
            {t.retry}
          </button>
          <Link href="/app">{t.home}</Link>
        </main>
      </body>
    </html>
  );
}
