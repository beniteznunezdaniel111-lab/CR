import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/countries";
import { listMembers, listPendingInvitations } from "@/modules/members/queries";
import { InvitationsTable } from "./invitations-table";
import { InviteDialog } from "./invite-dialog";
import { MembersTable } from "./members-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("members");
  return { title: t("title") };
}

export default async function MembersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, user, country } = await requireOrgRole(slug, ADMIN_ROLES);
  const t = await getTranslations("members");
  const [members, invitations] = await Promise.all([
    listMembers(org.id),
    listPendingInvitations(org.id),
  ]);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<InviteDialog orgId={org.id} />}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("membersTitle", { count: members.length })}</CardTitle>
            <CardDescription>{t("rolesHelp")}</CardDescription>
          </CardHeader>
          <CardContent>
            <MembersTable
              orgId={org.id}
              members={members.map((member) => ({
                membershipId: member.membershipId,
                fullName: member.fullName,
                email: member.email,
                role: member.role,
                status: member.status,
                isCurrentUser: member.userId === user.id,
                joinedAt: member.joinedAt,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("invitations.title")}</CardTitle>
            <CardDescription>{t("invitations.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("invitations.empty")}</p>
            ) : (
              <InvitationsTable
                orgId={org.id}
                invitations={invitations.map((invitation) => ({
                  id: invitation.id,
                  email: invitation.email,
                  role: invitation.role,
                  expired: invitation.expired,
                  expiresLabel: formatDate(invitation.expiresAt, country, {
                    dateStyle: "medium",
                    timeZone: org.timezone,
                  }),
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
