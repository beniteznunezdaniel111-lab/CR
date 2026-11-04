import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@/modules/jobs/constants";

const VARIANTS: Record<JobStatus, "secondary" | "default" | "outline"> = {
  draft: "secondary",
  open: "default",
  closed: "outline",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const t = useTranslations("jobs.statuses");
  return <Badge variant={VARIANTS[status]}>{t(status)}</Badge>;
}
