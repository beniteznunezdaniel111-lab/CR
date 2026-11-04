import { getTranslations } from "next-intl/server";
import type * as React from "react";
import { Logo } from "@/components/brand/logo";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { NotificationsMenu } from "@/components/app-shell/notifications-menu";
import { OrgSwitcher } from "@/components/app-shell/org-switcher";
import type { SidebarLink } from "@/components/app-shell/sidebar-nav";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { UserMenu } from "@/components/app-shell/user-menu";
import { getMyMemberships, getOrgContext } from "@/lib/auth/session";
import {
  CURRENT_PHASE,
  MAIN_NAV,
  type NavItem,
  SETTINGS_NAV,
  navForRole,
  orgPath,
} from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { listNotifications } from "@/modules/faq/queries";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const context = await getOrgContext(slug);
  const memberships = await getMyMemberships();
  const tRoles = await getTranslations("roles");

  const supabase = await createClient();
  const [{ data: profile }, notifications] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", context.user.id).maybeSingle(),
    listNotifications(context.org.id),
  ]);

  const toLinks = (items: readonly NavItem[]): SidebarLink[] =>
    navForRole(items, context.role).map((item) => ({
      key: item.key,
      href: orgPath(slug, item.path),
      comingSoon: item.phase > CURRENT_PHASE,
    }));
  const main = toLinks(MAIN_NAV);
  const settings = toLinks(SETTINGS_NAV);

  const current = { slug, name: context.org.name, roleLabel: tRoles(context.role) };
  const options = memberships.map((membership) => ({
    slug: membership.organization.slug,
    name: membership.organization.name,
    roleLabel: tRoles(membership.role),
  }));

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 md:flex">
        <Logo href={orgPath(slug)} />
        <SidebarNav main={main} settings={settings} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
          <MobileNav main={main} settings={settings} homeHref={orgPath(slug)} />
          <OrgSwitcher current={current} options={options} />
          <div className="ml-auto flex items-center gap-1">
            <NotificationsMenu
              orgId={context.org.id}
              items={notifications.items}
              unread={notifications.unread}
            />
            <UserMenu
              name={profile?.full_name ?? null}
              email={profile?.email ?? context.user.email ?? ""}
            />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
