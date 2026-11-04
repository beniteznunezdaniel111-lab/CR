"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRY_CODES, type CountryCode } from "@/lib/countries/types";

export function CountrySelect({
  id,
  name = "country",
  value,
  defaultValue,
  onChange,
  invalid,
}: {
  id?: string;
  name?: string;
  value?: CountryCode;
  defaultValue?: CountryCode;
  onChange?: (value: CountryCode) => void;
  invalid?: boolean;
}) {
  const t = useTranslations("countries");
  return (
    <Select
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onChange?.(next as CountryCode)}
    >
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue placeholder={t("placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {COUNTRY_CODES.map((code) => (
          <SelectItem key={code} value={code}>
            {t(code)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
