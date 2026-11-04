import type * as React from "react";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Logo />
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
