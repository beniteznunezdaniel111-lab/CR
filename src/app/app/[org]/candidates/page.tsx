import { ComingSoon } from "@/components/app-shell/coming-soon";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  await requireOrgRole(org, HR_ROLES);
  return <ComingSoon navKey="candidates" />;
}
