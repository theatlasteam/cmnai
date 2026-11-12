"use client";

import { useState } from "react";
import { Selector, type SelectorOptionType } from "@astryxdesign/core/Selector";

/**
 * Astryx Selector is controlled. Server-action forms need a default value and a
 * hidden input, so this adapter owns the selection state for the form. A
 * `value` prop hands that ownership to the caller instead, which is what a
 * preset-driven form needs so the shown selection follows the preset.
 */
export function SelectField({
  label,
  htmlName,
  defaultValue,
  value,
  onChange,
  options,
  description,
  isRequired,
  width,
}: {
  label: string;
  htmlName: string;
  defaultValue: string;
  value?: string;
  onChange?: (value: string) => void;
  options: SelectorOptionType[];
  description?: string;
  isRequired?: boolean;
  width?: string | number;
}) {
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;

  return (
    <Selector
      label={label}
      htmlName={htmlName}
      options={options}
      value={current}
      onChange={(next) => {
        setInternal(next);
        onChange?.(next);
      }}
      description={description}
      isRequired={isRequired}
      width={width}
    />
  );
}
