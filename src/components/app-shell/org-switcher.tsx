"use client";

import { Building2Icon, CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type OrgOption = { slug: string; name: string; roleLabel: string };

export function OrgSwitcher({ current, options }: { current: OrgOption; options: OrgOption[] }) {
  const t = useTranslations("nav");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="max-w-[16rem] justify-start gap-2 px-2">
          <Building2Icon className="text-muted-foreground" aria-hidden />
          <span className="truncate font-medium">{current.name}</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            · {current.roleLabel}
          </span>
          <ChevronsUpDownIcon className="ml-1 text-muted-foreground" aria-hidden />
          <span className="sr-only">{t("switchOrg")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("yourOrgs")}</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuItem key={option.slug} asChild>
            <Link href={`/app/${option.slug}`} className="flex items-center gap-2">
              <span className="flex-1 truncate">{option.name}</span>
              <span className="text-xs text-muted-foreground">{option.roleLabel}</span>
              {option.slug === current.slug ? <CheckIcon className="size-4" aria-hidden /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/new" className="flex items-center gap-2">
            <PlusIcon className="size-4" aria-hidden />
            {t("newOrg")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
