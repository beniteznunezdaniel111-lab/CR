import { ArrowLeftIcon, FilesIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEmbeddingSettings } from "@/lib/ai";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/countries";
import { orgPath } from "@/lib/navigation";
import { KB_PROCESSING_ERRORS, type KbProcessingError } from "@/modules/faq/constants";
import { listKbDocuments } from "@/modules/faq/queries";
import { DocumentActions } from "./document-actions";
import { KbUploader } from "./kb-uploader";

export const maxDuration = 300;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("faq.documents");
  return { title: t("title") };
}

const STATUS_VARIANT = {
  pending: "outline",
  processing: "secondary",
  ready: "default",
  failed: "destructive",
} as const;

export default async function KbDocumentsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("faq.documents");
  const [documents, settings] = await Promise.all([
    listKbDocuments(org.id),
    getEmbeddingSettings(),
  ]);
  const when = (iso: string) =>
    formatDate(iso, country, { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone });
  const errorText = (code: string | null) =>
    code && (KB_PROCESSING_ERRORS as readonly string[]).includes(code)
      ? t(`processingErrors.${code as KbProcessingError}`)
      : t("errors.generic");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild variant="outline">
            <Link href={orgPath(slug, "/faq")}>
              <ArrowLeftIcon aria-hidden />
              {t("back")}
            </Link>
          </Button>
        }
      />

      {settings.provider === "mock" ? (
        <p
          role="note"
          className="mb-4 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900"
        >
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("basicSearch")}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("upload.title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <KbUploader orgId={org.id} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            {documents.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
                  <FilesIcon className="size-5" aria-hidden />
                </span>
                <h2 className="text-lg font-medium">{t("empty.title")}</h2>
                <p className="max-w-md text-sm text-muted-foreground">{t("empty.description")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.title")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("columns.type")}</TableHead>
                    <TableHead>{t("columns.status")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("columns.chunks")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("columns.updated")}</TableHead>
                    <TableHead className="text-right">{t("columns.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => {
                    const outdated =
                      doc.status === "ready" && doc.embedding_model !== settings.model;
                    return (
                      <TableRow key={doc.id} data-testid="kb-document">
                        <TableCell className="max-w-64 align-top whitespace-normal">
                          <p className="font-medium">{doc.title}</p>
                          {doc.pages ? (
                            <p className="text-xs text-muted-foreground">
                              {t("pagesCount", { count: doc.pages })}
                            </p>
                          ) : null}
                          {doc.status === "failed" ? (
                            <p className="mt-1 text-xs text-destructive">{errorText(doc.error)}</p>
                          ) : null}
                          {outdated ? (
                            <p className="mt-1 flex items-start gap-1 text-xs text-amber-800">
                              <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
                              {t("outdatedModel")}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="hidden align-top md:table-cell">
                          {t(`types.${doc.doc_type}`)}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant={STATUS_VARIANT[doc.status]}>
                            {t(`status.${doc.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden align-top sm:table-cell">
                          {doc.chunk_count}
                        </TableCell>
                        <TableCell className="hidden align-top text-xs text-muted-foreground lg:table-cell">
                          {when(doc.updated_at)}
                        </TableCell>
                        <TableCell className="align-top">
                          <DocumentActions
                            orgId={org.id}
                            documentId={doc.id}
                            title={doc.title}
                            downloadHref={orgPath(slug, `/faq/documents/${doc.id}/file`)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
