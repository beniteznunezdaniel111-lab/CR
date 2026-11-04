import type { PromptDefinition } from "../types";
import { cvAnalysisV1 } from "./cv/analysis.v1";
import { cvIdentityV1 } from "./cv/identity.v1";
import { interviewGuideV1 } from "./interviews/guide.v1";
import { jobGenerateV1 } from "./jobs/generate.v1";
import { jobInclusiveReviewV1 } from "./jobs/inclusive-review.v1";
import { onboardingPlanV1 } from "./onboarding/plan.v1";
import { healthcheckV1 } from "./system/healthcheck.v1";

/**
 * Registro de prompts: id → versiones publicadas. La versión "actual" es la más
 * alta. Las versiones antiguas se conservan para poder auditar y reproducir.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPrompt = PromptDefinition<any, any>;

const PROMPTS: readonly AnyPrompt[] = [
  healthcheckV1,
  jobGenerateV1,
  jobInclusiveReviewV1,
  cvIdentityV1,
  cvAnalysisV1,
  interviewGuideV1,
  onboardingPlanV1,
];

export function listPrompts(): readonly AnyPrompt[] {
  return PROMPTS;
}

export function getPromptVersion(id: string, version: number): AnyPrompt | undefined {
  return PROMPTS.find((prompt) => prompt.id === id && prompt.version === version);
}

export function getLatestPrompt(id: string): AnyPrompt | undefined {
  return PROMPTS.filter((prompt) => prompt.id === id).sort((a, b) => b.version - a.version)[0];
}
