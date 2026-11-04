import { ArrowLeftIcon, SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { orgPath } from "@/lib/navigation";
import { listReadyKbDocuments } from "@/modules/trainings/queries";
import { NewTrainingForm } from "./new-training-form";

// Cada paso de la generación es una petición; damos margen a los más largos.
export const maxDuration = 120;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("trainings.create");
  return { title: t("title") };
}

export default async function NewTrainingPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("trainings");
  const documents = await listReadyKbDocuments(org.id);

  return (
    <>
      <PageHeader
        title={t("create.title")}
        description={t("create.description")}
        actions={
          <Button asChild variant="outline">
            <Link href={orgPath(slug, "/trainings")}>
              <ArrowLeftIcon aria-hidden />
              {t("back")}
            </Link>
          </Button>
        }
      />
      <Card className="max-w-3xl">
        <CardContent className="space-y-4 pt-6">
          <p className="flex items-start gap-2 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
            <SparklesIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("create.aiNotice")}
          </p>
          <NewTrainingForm
            orgId={org.id}
            orgSlug={slug}
            documents={documents.map((doc) => ({ id: doc.id, title: doc.title }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
