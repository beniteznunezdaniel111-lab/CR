import type * as React from "react";

/** Páginas pensadas para imprimir o guardar como PDF (sin la interfaz de la app). */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl bg-white px-6 py-8 print:max-w-none print:p-0">
      <style>{`@page { size: A4; margin: 18mm 16mm; }`}</style>
      {children}
    </div>
  );
}
