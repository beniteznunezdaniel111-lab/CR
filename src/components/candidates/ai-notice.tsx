import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/** Aviso visible obligatorio: el análisis es una sugerencia que revisa una persona. */
export function AiSuggestionNotice() {
  const t = useTranslations("candidates.aiNotice");
  return (
    <aside
      role="note"
      aria-label={t("title")}
      className="flex gap-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950"
    >
      <SparklesIcon className="mt-0.5 size-4 shrink-0 text-violet-600" aria-hidden />
      <div className="space-y-0.5">
        <p className="font-semibold">{t("title")}</p>
        <p>{t("body")}</p>
      </div>
    </aside>
  );
}
