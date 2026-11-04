"use client";

import { DownloadIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MemberRole, MemberStatus } from "@/lib/auth/roles";
import type { FormState } from "@/lib/forms";
import {
  changeMemberRoleAction,
  removeMemberAction,
  setMemberStatusAction,
} from "@/modules/members/actions";
import { eraseMemberDataAction } from "@/modules/privacy/actions";
import { RoleSelect } from "./role-select";

export type MemberView = {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  role: MemberRole;
  status: MemberStatus;
  isCurrentUser: boolean;
  joinedAt: string;
};

function notify(result: FormState) {
  if (result.status === "success" && result.message) toast.success(result.message);
  if (result.status === "error" && result.message) toast.error(result.message);
}

export function MembersTable({
  orgId,
  orgSlug,
  members,
}: {
  orgId: string;
  orgSlug: string;
  members: MemberView[];
}) {
  const t = useTranslations("members");
  const tStatus = useTranslations("memberStatus");
  const tPrivacy = useTranslations("privacy.member");
  const [pending, startTransition] = useTransition();
  const [toRemove, setToRemove] = useState<MemberView | null>(null);
  const [toErase, setToErase] = useState<MemberView | null>(null);

  const run = (action: (data: FormData) => Promise<FormState>, fields: Record<string, string>) => {
    const data = new FormData();
    data.set("orgId", orgId);
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    startTransition(async () => notify(await action(data)));
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.person")}</TableHead>
            <TableHead>{t("table.role")}</TableHead>
            <TableHead>{t("table.status")}</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">{t("table.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.membershipId} data-testid="member-row">
              <TableCell>
                <div className="font-medium">
                  {member.fullName ?? member.email}
                  {member.isCurrentUser ? (
                    <span className="ml-2 text-xs text-muted-foreground">({t("you")})</span>
                  ) : null}
                </div>
                {member.fullName ? (
                  <div className="text-xs text-muted-foreground">{member.email}</div>
                ) : null}
              </TableCell>
              <TableCell>
                <RoleSelect
                  value={member.role}
                  disabled={pending}
                  ariaLabel={t("table.changeRoleFor", {
                    name: member.fullName ?? member.email ?? "",
                  })}
                  onChange={(role) =>
                    role !== member.role &&
                    run(changeMemberRoleAction, { membershipId: member.membershipId, role })
                  }
                />
              </TableCell>
              <TableCell>
                <Badge variant={member.status === "active" ? "secondary" : "outline"}>
                  {tStatus(member.status)}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("table.actions")}
                      disabled={pending}
                    >
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {member.status === "active" ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          run(setMemberStatusAction, {
                            membershipId: member.membershipId,
                            status: "disabled",
                          })
                        }
                      >
                        {t("table.disable")}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onSelect={() =>
                          run(setMemberStatusAction, {
                            membershipId: member.membershipId,
                            status: "active",
                          })
                        }
                      >
                        {t("table.enable")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <a href={`/app/${orgSlug}/settings/members/${member.userId}/export`} download>
                        <DownloadIcon aria-hidden />
                        {tPrivacy("export")}
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setToRemove(member)}>
                      {t("table.remove")}
                    </DropdownMenuItem>
                    {!member.isCurrentUser ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setToErase(member)}>
                        <Trash2Icon aria-hidden />
                        {tPrivacy("erase")}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={toRemove !== null} onOpenChange={(open) => !open && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("removeDialog.description", { name: toRemove?.fullName ?? toRemove?.email ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("removeDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toRemove) run(removeMemberAction, { membershipId: toRemove.membershipId });
                setToRemove(null);
              }}
            >
              {t("removeDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={toErase !== null} onOpenChange={(open) => !open && setToErase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tPrivacy("eraseDialog.title", { name: toErase?.fullName ?? toErase?.email ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{tPrivacy("eraseDialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tPrivacy("eraseDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = toErase;
                setToErase(null);
                if (!target) return;
                startTransition(async () =>
                  notify(await eraseMemberDataAction({ orgId, userId: target.userId })),
                );
              }}
            >
              {tPrivacy("eraseDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
