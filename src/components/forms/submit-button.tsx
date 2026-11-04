"use client";

import { Loader2Icon } from "lucide-react";
import type * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Botón de envío que se deshabilita y muestra un spinner mientras se envía. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
