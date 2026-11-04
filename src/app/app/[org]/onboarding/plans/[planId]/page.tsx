import { ArrowLeftIcon, SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { orgPath } from "@/lib/navigation";
import { deleteOnboardingPlanAction } from "@/modules/onboarding/actions";
import { todayIn } from "@/modules/onboarding/plan";
import { getPlan, listMemberOptions } from "@/modules/onboarding/queries";
import { ConfirmDelete } from "../../onboarding-controls";
import { AssignPlan, PlanEditor } from "./plan-editor";

type Params = Promise<{ org: string; planId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { org: slug, planId } = await params;
  const t = await getTranslations("onboarding");
  const { org } = await requireOrgRole(slug, HR_ROLES);
  const plan = await getPlan(org.id, planId);
  return { title: plan?.title ?? t("title") };
}

export default async function OnboardingPlanPage({ params }: { params: Params }) {
  const { org: slug, planId } = await params;
  const { org } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("onboarding");
  const plan = await getPlan(org.id, planId);
  if (!plan) notFound();
  const members = await listMemberOptions(org.id);

  return (
    <>
      <PageHeader
        title={plan.title}
        description={t("plan.jobLabel", { title: plan.jobTitle })}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={orgPath(slug, "/onboarding")}>
                <ArrowLeftIcon aria-hidden />
                {t("title")}
              </Link>
            </Button>
            <AssignPlan
              orgId={org.id}
              planId={plan.id}
              members={members}
              defaultStart={todayIn(org.timezone)}
            />
          </>
        }
      />
      <div className="space-y-4">
        {plan.prompt_id ? (
          <p className="flex items-start gap-2 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
            <SparklesIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("plan.aiDraft")}
          </p>
        ) : null}
        <Card>
          <CardContent>
            <PlanEditor
              orgId={org.id}
              planId={plan.id}
              title={plan.title}
              intro={plan.intro}
              tasks={plan.tasks.map((task) => ({
                phase: task.phase,
                due_day: task.due_day,
                title: task.title,
                owner_label: task.owner_label,
                materials: task.materials,
                description: task.description,
                is_checkpoint: task.is_checkpoint,
              }))}
            />
          </CardContent>
        </Card>
        <ConfirmDelete
          label={t("plan.delete.button")}
          title={t("plan.delete.title")}
          description={t("plan.delete.description")}
          confirm={t("plan.delete.confirm")}
          cancel={t("plan.delete.cancel")}
          action={deleteOnboardingPlanAction.bind(null, { orgId: org.id, planId: plan.id })}
        />
      </div>
    </>
  );
}
