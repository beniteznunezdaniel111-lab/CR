"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Select controlado que envía su valor con un input oculto propio. Así el valor
 * no se pierde cuando React reinicia el formulario tras un envío con errores.
 */
export function ControlledSelect<T extends string>({
  id,
  name,
  value,
  onChange,
  options,
  placeholder,
  invalid,
  className,
  allowEmpty,
  emptyLabel,
  ariaLabel,
}: {
  id?: string;
  name: string;
  value: T | "";
  onChange: (value: T | "") => void;
  options: readonly { value: T; label: string }[];
  placeholder?: string;
  invalid?: boolean;
  className?: string;
  /** Añade una opción para dejar el campo vacío. */
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** Nombre accesible cuando el select no tiene un <Label> asociado. */
  ariaLabel?: string;
}) {
  const EMPTY = "__empty__";
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select
        value={value === "" ? (allowEmpty ? EMPTY : undefined) : value}
        onValueChange={(next) => onChange(next === EMPTY ? "" : (next as T))}
      >
        <SelectTrigger
          id={id}
          className={cn("w-full", className)}
          aria-invalid={invalid}
          aria-label={ariaLabel}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty ? <SelectItem value={EMPTY}>{emptyLabel ?? "—"}</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
