"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { NavIcon } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./nav-icons";

export type SidebarLink = { key: NavIcon; href: string; comingSoon: boolean };

export function SidebarNav({
  main,
  settings,
  onNavigate,
}: {
  main: SidebarLink[];
  settings: SidebarLink[];
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const renderLink = (link: SidebarLink, exact: boolean) => {
    const Icon = NAV_ICONS[link.key];
    const active = exact ? pathname === link.href : pathname.startsWith(link.href);
    return (
      <li key={link.key}>
        <Link
          href={link.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            active
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{t(link.key)}</span>
          {link.comingSoon ? (
            <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
              {t("soon")}
            </span>
          ) : null}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label={t("mainLabel")} className="flex flex-1 flex-col gap-6">
      <ul className="space-y-1">{main.map((link, index) => renderLink(link, index === 0))}</ul>
      {settings.length > 0 ? (
        <div className="space-y-2">
          <p className="px-3 text-xs font-medium text-muted-foreground uppercase">
            {t("settings")}
          </p>
          <ul className="space-y-1">{settings.map((link) => renderLink(link, false))}</ul>
        </div>
      ) : null}
    </nav>
  );
}
