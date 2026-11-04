import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { type NavIcon, findNavItem } from "@/lib/navigation";
import { NAV_ICONS } from "./nav-icons";
import { PageHeader } from "./page-header";

/** Marcador para los módulos que se construyen en fases posteriores. */
export async function ComingSoon({ navKey }: { navKey: NavIcon }) {
  const t = await getTranslations();
  const item = findNavItem(navKey);
  const Icon = NAV_ICONS[navKey];
  return (
    <>
      <PageHeader title={t(`nav.${navKey}`)} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
            <Icon className="size-5" aria-hidden />
          </span>
          <h2 className="text-lg font-medium">{t("comingSoon.title")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {t(`comingSoon.modules.${navKey}`)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("comingSoon.phase", { phase: item.phase })}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
