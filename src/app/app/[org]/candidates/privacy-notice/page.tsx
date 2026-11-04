import { TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { Card, CardContent } from "@/components/ui/card";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { orgPath } from "@/lib/navigation";
import { buildCandidatePrivacyNotice } from "@/modules/candidates/privacy-notice";
import { NoticeActions } from "./notice-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("candidates.privacyNotice");
  return { title: t("title") };
}

export default async function CandidatePrivacyNoticePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const { org, country, role } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("candidates.privacyNotice");
  const template = await getTranslations("candidates.privacyTemplate");

  const { markdown, missing } = buildCandidatePrivacyNotice({
    template: (key, values) => template(key as "ES.title", values),
    pending: (field) => t("pending", { field: t(`fields.${field}`) }),
    org,
    country,
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { country: country.name })}
        actions={<NoticeActions markdown={markdown} filename={t("filename")} />}
      />
      <div className="space-y-4">
        <p
          role="note"
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("draft")}
        </p>
        {missing.length > 0 ? (
          <p className="rounded-md border p-3 text-sm">
            {t("missing")}{" "}
            {role === "admin" ? (
              <Link href={orgPath(slug, "/settings/organization")} className="underline">
                {t("settingsLink")}
              </Link>
            ) : null}
          </p>
        ) : null}
        <Card>
          <CardContent>
            <MarkdownView markdown={markdown} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
