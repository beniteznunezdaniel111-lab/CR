"use client";

import { MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { type SidebarLink, SidebarNav } from "./sidebar-nav";

export function MobileNav({
  main,
  settings,
  homeHref,
}: {
  main: SidebarLink[];
  settings: SidebarLink[];
  homeHref: string;
}) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("openMenu")}>
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-4">
        <SheetHeader className="p-0">
          <SheetTitle asChild>
            <div>
              <Logo href={homeHref} />
            </div>
          </SheetTitle>
        </SheetHeader>
        <SidebarNav main={main} settings={settings} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
