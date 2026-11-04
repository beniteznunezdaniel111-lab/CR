import { SparklesIcon } from "lucide-react";
import Link from "next/link";
import { APP_NAME } from "@/lib/config/brand";
import { cn } from "@/lib/utils";

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2 text-lg font-semibold tracking-tight", className)}
    >
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <SparklesIcon className="size-4" aria-hidden />
      </span>
      {APP_NAME}
    </Link>
  );
}
