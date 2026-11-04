"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type MemberRole, ROLES } from "@/lib/auth/roles";

export function RoleSelect({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  ariaLabel,
}: {
  id?: string;
  name?: string;
  value?: MemberRole;
  defaultValue?: MemberRole;
  onChange?: (role: MemberRole) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const t = useTranslations("roles");
  return (
    <Select
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onChange?.(next as MemberRole)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-36" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {t(role)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
