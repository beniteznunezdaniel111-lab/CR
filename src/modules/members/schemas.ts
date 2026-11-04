import { z } from "zod";
import { emailSchema } from "@/modules/auth/schemas";

export const roleSchema = z.enum(["admin", "hr", "employee"], { error: "role" });

export const inviteMemberSchema = z.object({
  orgId: z.uuid(),
  email: emailSchema,
  role: roleSchema,
});

export const invitationIdSchema = z.object({ orgId: z.uuid(), invitationId: z.uuid() });

export const changeRoleSchema = z.object({
  orgId: z.uuid(),
  membershipId: z.uuid(),
  role: roleSchema,
});

export const setStatusSchema = z.object({
  orgId: z.uuid(),
  membershipId: z.uuid(),
  status: z.enum(["active", "disabled"]),
});

export const membershipIdSchema = z.object({ orgId: z.uuid(), membershipId: z.uuid() });
