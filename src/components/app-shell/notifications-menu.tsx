"use client";

import { BellIcon, CheckCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Json } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { markNotificationsReadAction } from "@/modules/faq/actions";

export type NotificationItem = {
  id: string;
  kind: string;
  params: Json;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const dateFormat = new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" });

/** Avisos dentro de la app (respuestas de RRHH, consultas nuevas, formaciones...). */
export function NotificationsMenu({
  orgId,
  items,
  unread,
}: {
  orgId: string;
  items: NotificationItem[];
  unread: number;
}) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const title = (item: NotificationItem) => {
    const key = `kinds.${item.kind}`;
    const params =
      item.params && typeof item.params === "object" && !Array.isArray(item.params)
        ? (item.params as Record<string, string>)
        : {};
    return t.has(key) ? t(key as "kinds.unknown", params) : t("kinds.unknown");
  };

  const open = (item: NotificationItem) =>
    startTransition(async () => {
      if (!item.read_at) await markNotificationsReadAction({ orgId, ids: [item.id] });
      if (item.link) router.push(item.link);
      router.refresh();
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={unread > 0 ? `${t("label")}: ${t("unread", { count: unread })}` : t("label")}
        >
          <BellIcon aria-hidden />
          {unread > 0 ? (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[0.65rem] leading-4 font-semibold text-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>{t("label")}</span>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  await markNotificationsReadAction({ orgId });
                  router.refresh();
                });
              }}
            >
              <CheckCheckIcon aria-hidden />
              {t("markAllRead")}
            </Button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => open(item)}
              className="flex flex-col items-start gap-0.5"
            >
              <span className={cn("text-sm", !item.read_at && "font-semibold")}>
                {!item.read_at ? (
                  <span
                    className="mr-1.5 inline-block size-2 rounded-full bg-primary"
                    aria-hidden
                  />
                ) : null}
                {title(item)}
              </span>
              <span className="text-xs text-muted-foreground">
                {dateFormat.format(new Date(item.created_at))}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
