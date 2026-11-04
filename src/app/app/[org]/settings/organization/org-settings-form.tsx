"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { CountrySelect } from "@/components/forms/country-select";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CountryCode, CurrencyCode } from "@/lib/countries/types";
import { idleState } from "@/lib/forms";
import { updateOrganizationAction } from "@/modules/organizations/actions";

export type OrgSettingsValues = {
  orgId: string;
  name: string;
  country: CountryCode;
  legalName: string;
  taxId: string;
  address: string;
  privacyEmail: string;
  timezone: string;
  currency: CurrencyCode;
  cvRetentionMonths: number;
};

export type CountryOptions = Record<
  CountryCode,
  {
    currencies: readonly CurrencyCode[];
    timezones: readonly string[];
    defaultCurrency: CurrencyCode;
    defaultTimezone: string;
  }
>;

export function OrgSettingsForm({
  initial,
  countryOptions,
}: {
  initial: OrgSettingsValues;
  countryOptions: CountryOptions;
}) {
  const t = useTranslations("orgSettings");
  const tOrg = useTranslations("orgFields");
  const [state, formAction] = useActionState(updateOrganizationAction, idleState);
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [currency, setCurrency] = useState<CurrencyCode>(initial.currency);
  const [timezone, setTimezone] = useState(initial.timezone);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const options = countryOptions[country];

  const changeCountry = (next: CountryCode) => {
    setCountry(next);
    const nextOptions = countryOptions[next];
    if (!nextOptions.currencies.includes(currency)) setCurrency(nextOptions.defaultCurrency);
    if (!nextOptions.timezones.includes(timezone)) setTimezone(nextOptions.defaultTimezone);
  };

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="orgId" value={initial.orgId} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">{t("sections.general")}</legend>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">{tOrg("name")}</Label>
          <Input id="name" name="name" defaultValue={initial.name} required />
          <FieldError messages={fieldErrors?.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">{tOrg("country")}</Label>
          <CountrySelect id="country" value={country} onChange={changeCountry} />
          {country !== initial.country ? (
            <p className="text-xs text-amber-700">{t("countryChangeWarning")}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">{tOrg("currency")}</Label>
          <Select
            name="currency"
            value={currency}
            onValueChange={(value) => setCurrency(value as CurrencyCode)}
          >
            <SelectTrigger id="currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.currencies.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">{tOrg("timezone")}</Label>
          <Select name="timezone" value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="timezone" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.timezones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">{t("sections.legal")}</legend>
        <div className="space-y-2">
          <Label htmlFor="legalName">{tOrg("legalName")}</Label>
          <Input id="legalName" name="legalName" defaultValue={initial.legalName} />
          <FieldError messages={fieldErrors?.legalName} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="taxId">{country === "CR" ? tOrg("taxIdCR") : tOrg("taxIdES")}</Label>
          <Input id="taxId" name="taxId" defaultValue={initial.taxId} />
          <FieldError messages={fieldErrors?.taxId} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="address">{tOrg("address")}</Label>
          <Input id="address" name="address" defaultValue={initial.address} />
          <FieldError messages={fieldErrors?.address} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="privacyEmail">{tOrg("privacyEmail")}</Label>
          <Input
            id="privacyEmail"
            name="privacyEmail"
            type="email"
            defaultValue={initial.privacyEmail}
          />
          <p className="text-xs text-muted-foreground">{tOrg("privacyEmailHelp")}</p>
          <FieldError messages={fieldErrors?.privacyEmail} />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">{t("sections.data")}</legend>
        <div className="space-y-2">
          <Label htmlFor="cvRetentionMonths">{tOrg("cvRetentionMonths")}</Label>
          <Input
            id="cvRetentionMonths"
            name="cvRetentionMonths"
            type="number"
            min={1}
            max={60}
            defaultValue={initial.cvRetentionMonths}
            aria-describedby="retention-help"
          />
          <p id="retention-help" className="text-xs text-muted-foreground">
            {tOrg("cvRetentionHelp")}
          </p>
          <FieldError messages={fieldErrors?.cvRetentionMonths} />
        </div>
      </fieldset>

      <FormMessage status={state.status} message={"message" in state ? state.message : undefined} />
      <SubmitButton pendingLabel={t("saving")}>{t("save")}</SubmitButton>
    </form>
  );
}
