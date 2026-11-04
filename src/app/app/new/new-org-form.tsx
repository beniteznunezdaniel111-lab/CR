"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { CountrySelect } from "@/components/forms/country-select";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CountryCode } from "@/lib/countries/types";
import { idleState, valuesFrom } from "@/lib/forms";
import { createOrganizationAction } from "@/modules/organizations/actions";

export function NewOrgForm() {
  const t = useTranslations("newOrg");
  const tOrg = useTranslations("orgFields");
  const [state, formAction] = useActionState(createOrganizationAction, idleState);
  const [country, setCountry] = useState<CountryCode>("ES");
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const values = valuesFrom(state);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">{tOrg("name")}</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={values.name}
          aria-invalid={Boolean(fieldErrors?.name)}
        />
        <FieldError messages={fieldErrors?.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="country">{tOrg("country")}</Label>
        <CountrySelect
          id="country"
          value={country}
          onChange={setCountry}
          invalid={Boolean(fieldErrors?.country)}
        />
        <p className="text-xs text-muted-foreground">{tOrg("countryHelp")}</p>
        <FieldError messages={fieldErrors?.country} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="legalName">
            {tOrg("legalName")} <span className="text-muted-foreground">({tOrg("optional")})</span>
          </Label>
          <Input id="legalName" name="legalName" defaultValue={values.legalName} />
          <FieldError messages={fieldErrors?.legalName} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="taxId">
            {country === "CR" ? tOrg("taxIdCR") : tOrg("taxIdES")}{" "}
            <span className="text-muted-foreground">({tOrg("optional")})</span>
          </Label>
          <Input id="taxId" name="taxId" defaultValue={values.taxId} />
          <FieldError messages={fieldErrors?.taxId} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="privacyEmail">
          {tOrg("privacyEmail")} <span className="text-muted-foreground">({tOrg("optional")})</span>
        </Label>
        <Input
          id="privacyEmail"
          name="privacyEmail"
          type="email"
          defaultValue={values.privacyEmail}
        />
        <p className="text-xs text-muted-foreground">{tOrg("privacyEmailHelp")}</p>
        <FieldError messages={fieldErrors?.privacyEmail} />
      </div>
      <FormMessage status={state.status} message={"message" in state ? state.message : undefined} />
      <SubmitButton className="w-full" pendingLabel={t("pending")}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
