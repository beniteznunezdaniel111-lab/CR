import { ComingSoon } from "@/components/app-shell/coming-soon";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  await requireOrgRole(org, ADMIN_ROLES);
  return <ComingSoon navKey="aiUsage" />;
}
