import { FilesIcon, InboxIcon, MessageSquarePlusIcon, UploadIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { AskHrDialog } from "@/components/faq/ask-hr-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ALL_ROLES, isHrRole } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { orgPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { countReadyKbDocuments, getConversation, listConversations } from "@/modules/faq/queries";
import { FaqChat } from "./faq-chat";

export const maxDuration = 60;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("faq");
  return { title: t("title") };
}

export default async function FaqPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { org: slug } = await params;
  const { c: conversationParam } = await searchParams;
  const { org, role } = await requireOrgRole(slug, ALL_ROLES);
  const t = await getTranslations("faq");
  const isHr = isHrRole(role);

  const validId =
    conversationParam && /^[0-9a-f-]{36}$/i.test(conversationParam) ? conversationParam : null;
  const [conversations, readyDocuments, conversation] = await Promise.all([
    listConversations(org.id),
    countReadyKbDocuments(org.id),
    validId ? getConversation(org.id, validId) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={orgPath(slug, "/faq/my-queries")}>
                <InboxIcon aria-hidden />
                {t("myQueriesLink")}
              </Link>
            </Button>
            {isHr ? (
              <Button asChild variant="outline">
                <Link href={orgPath(slug, "/faq/documents")}>
                  <FilesIcon aria-hidden />
                  {t("manageDocuments")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav aria-label={t("chat.conversations")} className="space-y-2">
          <Button asChild variant="secondary" className="w-full justify-start">
            <Link href={orgPath(slug, "/faq")}>
              <MessageSquarePlusIcon aria-hidden />
              {t("chat.newConversation")}
            </Link>
          </Button>
          <p className="px-1 pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("chat.conversations")}
          </p>
          {conversations.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">{t("chat.noConversations")}</p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`${orgPath(slug, "/faq")}?c=${item.id}`}
                    aria-current={item.id === conversation?.id ? "page" : undefined}
                    className={cn(
                      "block truncate rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                      item.id === conversation?.id && "bg-accent font-medium",
                    )}
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <section className="min-w-0">
          {readyDocuments === 0 && !conversation ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
                  <FilesIcon className="size-5" aria-hidden />
                </span>
                <h2 className="text-lg font-medium">{t("chat.noDocuments.title")}</h2>
                <p className="max-w-lg text-sm text-muted-foreground">
                  {isHr ? t("chat.noDocuments.hr") : t("chat.noDocuments.employee")}
                </p>
                {isHr ? (
                  <Button asChild>
                    <Link href={orgPath(slug, "/faq/documents")}>
                      <UploadIcon aria-hidden />
                      {t("chat.noDocuments.upload")}
                    </Link>
                  </Button>
                ) : (
                  <AskHrDialog orgId={org.id} variant="default" />
                )}
              </CardContent>
            </Card>
          ) : (
            <FaqChat
              orgId={org.id}
              orgSlug={slug}
              conversationId={conversation?.id ?? null}
              initialMessages={conversation?.messages ?? []}
            />
          )}
        </section>
      </div>
    </>
  );
}
