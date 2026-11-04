"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MemberRole } from "@/lib/auth/roles";
import { regenerateInvitationLinkAction, revokeInvitationAction } from "@/modules/members/actions";
import { CopyLink } from "./copy-link";

export type InvitationView = {
  id: string;
  email: string;
  role: MemberRole;
  expiresLabel: string;
  expired: boolean;
};

export function InvitationsTable({
  orgId,
  invitations,
}: {
  orgId: string;
  invitations: InvitationView[];
}) {
  const t = useTranslations("members");
  const tRoles = useTranslations("roles");
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  const formData = (invitationId: string) => {
    const data = new FormData();
    data.set("orgId", orgId);
    data.set("invitationId", invitationId);
    return data;
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("invitations.email")}</TableHead>
            <TableHead>{t("invitations.role")}</TableHead>
            <TableHead>{t("invitations.expires")}</TableHead>
            <TableHead className="text-right">{t("table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invitation) => (
            <TableRow key={invitation.id}>
              <TableCell className="font-medium">{invitation.email}</TableCell>
              <TableCell>{tRoles(invitation.role)}</TableCell>
              <TableCell className={invitation.expired ? "text-destructive" : undefined}>
                {invitation.expired ? t("invitations.expired") : invitation.expiresLabel}
              </TableCell>
              <TableCell className="space-x-2 text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await regenerateInvitationLinkAction(formData(invitation.id));
                      if (result.status === "success" && result.data) setLink(result.data.link);
                      else if (result.status === "error") toast.error(result.message);
                    })
                  }
                >
                  {t("invitations.newLink")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await revokeInvitationAction(formData(invitation.id));
                      if (result.status === "success") toast.success(result.message);
                      else if (result.status === "error") toast.error(result.message);
                    })
                  }
                >
                  {t("invitations.revoke")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={link !== null} onOpenChange={(open) => !open && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invitations.newLinkTitle")}</DialogTitle>
            <DialogDescription>{t("invitations.newLinkDescription")}</DialogDescription>
          </DialogHeader>
          {link ? <CopyLink link={link} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
