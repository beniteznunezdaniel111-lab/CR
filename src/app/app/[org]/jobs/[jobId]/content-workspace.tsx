"use client";

import type { Editor } from "@tiptap/react";
import {
  CopyIcon,
  DownloadIcon,
  FileDownIcon,
  HistoryIcon,
  Loader2Icon,
  PrinterIcon,
  RotateCcwIcon,
  SaveIcon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ControlledSelect } from "@/components/forms/controlled-select";
import { MarkdownEditor } from "@/components/markdown/markdown-editor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FormState } from "@/lib/forms";
import { markdownToPlainText, slugForFilename } from "@/lib/markdown";
import {
  restoreJobVersionAction,
  reviewJobVersionWithAiAction,
  saveJobVersionAction,
} from "@/modules/jobs/actions";
import { JOB_DOCS, type JobDoc } from "@/modules/jobs/constants";
import type { InclusiveReview, JobDocs } from "@/modules/jobs/inclusive-review";
import { GenerateButton } from "./generate-button";
import { InclusivePanel } from "./inclusive-panel";

export type VersionOption = { number: number; label: string };

export type WorkspaceVersion = {
  number: number;
  source: "ai" | "manual" | "restored";
  metaLabel: string;
  docs: JobDocs;
  review: InclusiveReview | null;
};

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ContentWorkspace({
  orgId,
  jobId,
  jobTitle,
  version,
  isLatest,
  latestNumber,
  versions,
  printHref,
}: {
  orgId: string;
  jobId: string;
  jobTitle: string;
  version: WorkspaceVersion;
  isLatest: boolean;
  latestNumber: number;
  versions: VersionOption[];
  printHref: string;
}) {
  const t = useTranslations("jobs.workspace");
  const tDocs = useTranslations("jobs.inclusive.docs");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [reviewing, startReview] = useTransition();
  const [tab, setTab] = useState<JobDoc>("internal");
  const [values, setValues] = useState<JobDocs>(version.docs);
  const editors = useRef<Partial<Record<JobDoc, Editor>>>({});

  const dirty = JOB_DOCS.some((doc) => values[doc].trim() !== version.docs[doc].trim());

  const refreshToLatest = () => {
    router.replace(pathname);
    router.refresh();
  };

  const formFor = (extra: Record<string, string>) => {
    const form = new FormData();
    form.set("orgId", orgId);
    form.set("jobId", jobId);
    for (const [key, value] of Object.entries(extra)) form.set(key, value);
    return form;
  };

  const handle = (result: FormState) => {
    if (result.status === "error") {
      toast.error(result.message);
      return false;
    }
    if (result.status === "success" && result.message) toast.success(result.message);
    return true;
  };

  const save = () =>
    startTransition(async () => {
      if (handle(await saveJobVersionAction(formFor({ ...values })))) refreshToLatest();
    });

  const restore = () =>
    startTransition(async () => {
      const result = await restoreJobVersionAction(
        formFor({ versionNumber: String(version.number) }),
      );
      if (handle(result)) refreshToLatest();
    });

  const reviewWithAi = () =>
    startReview(async () => {
      const result = await reviewJobVersionWithAiAction(
        formFor({ versionNumber: String(version.number) }),
      );
      if (handle(result)) router.refresh();
    });

  const discard = () => {
    for (const doc of JOB_DOCS) {
      editors.current[doc]?.commands.setContent(version.docs[doc], { contentType: "markdown" });
    }
    setValues(version.docs);
  };

  const copy = async () => {
    const markdown = values[tab];
    const plain = markdownToPlainText(markdown);
    const html = editors.current[tab]?.getHTML();
    try {
      if (html && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([plain], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      toast.success(t("export.copied"));
    } catch {
      toast.error(t("export.copyError"));
    }
  };

  const base = slugForFilename(jobTitle);
  const downloadCurrent = () =>
    download(`${base}-${slugForFilename(tDocs(tab))}-v${version.number}.md`, values[tab]);
  const downloadAll = () =>
    download(
      `${base}-v${version.number}.md`,
      JOB_DOCS.map((doc) => `# ${jobTitle} — ${tDocs(doc)}\n\n${values[doc].trim()}\n`).join("\n"),
    );
  const print = (doc: JobDoc | "all") =>
    window.open(`${printHref}?v=${version.number}&doc=${doc}`, "_blank", "noopener");

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-64">
            <ControlledSelect
              name="version"
              ariaLabel={t("version")}
              value={String(version.number)}
              onChange={(next) => next && router.push(`${pathname}?v=${next}`)}
              options={versions.map((option) => ({
                value: String(option.number),
                label: option.label,
              }))}
            />
          </div>
          {dirty ? (
            <p className="text-xs text-amber-700" role="status">
              {t("unsaved")}
            </p>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <GenerateButton orgId={orgId} jobId={jobId} hasContent variant="outline" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <DownloadIcon aria-hidden />
                  {t("export.button")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={copy}>
                  <CopyIcon aria-hidden />
                  {t("export.copy")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={downloadCurrent}>
                  <FileDownIcon aria-hidden />
                  {t("export.markdown")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={downloadAll}>
                  <FileDownIcon aria-hidden />
                  {t("export.markdownAll")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => print(tab)}>
                  <PrinterIcon aria-hidden />
                  {t("export.pdf")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => print("all")}>
                  <PrinterIcon aria-hidden />
                  {t("export.pdfAll")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{version.metaLabel}</p>

        {version.source === "ai" ? (
          <p className="flex items-start gap-2 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
            <SparklesIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("aiDraft")}
          </p>
        ) : null}

        {!isLatest ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            <HistoryIcon className="size-4" aria-hidden />
            <span>{t("oldVersion", { version: version.number, latest: latestNumber })}</span>
            <Button size="sm" className="ml-auto" onClick={restore} disabled={pending}>
              {pending ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <RotateCcwIcon aria-hidden />
              )}
              {t("restore")}
            </Button>
          </div>
        ) : null}

        <Tabs value={tab} onValueChange={(value) => setTab(value as JobDoc)}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            {JOB_DOCS.map((doc) => (
              <TabsTrigger key={doc} value={doc}>
                {tDocs(doc)}
              </TabsTrigger>
            ))}
          </TabsList>
          {JOB_DOCS.map((doc) => (
            <TabsContent key={doc} value={doc} forceMount className="data-[state=inactive]:hidden">
              <MarkdownEditor
                markdown={version.docs[doc]}
                editable={isLatest}
                ariaLabel={tDocs(doc)}
                onChange={(markdown) => setValues((current) => ({ ...current, [doc]: markdown }))}
                onReady={(editor) => {
                  editors.current[doc] = editor;
                }}
              />
            </TabsContent>
          ))}
        </Tabs>

        {isLatest ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={!dirty || pending} aria-busy={pending}>
              {pending ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <SaveIcon aria-hidden />
              )}
              {t("save")}
            </Button>
            <Button variant="ghost" onClick={discard} disabled={!dirty || pending}>
              <Undo2Icon aria-hidden />
              {t("discard")}
            </Button>
          </div>
        ) : null}
      </div>

      <InclusivePanel
        review={version.review}
        stale={dirty}
        canReviewWithAi={!dirty}
        reviewing={reviewing}
        onReviewWithAi={reviewWithAi}
        onSelectDoc={setTab}
      />
    </div>
  );
}
