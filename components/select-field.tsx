"use client";

import { useState } from "react";
import { Selector, type SelectorOptionType } from "@astryxdesign/core/Selector";

/**
 * Astryx Selector is controlled. Server-action forms need a default value and a
 * hidden input, so this adapter owns the selection state for the form.
 */
export function SelectField({
  label,
  htmlName,
  defaultValue,
  options,
  description,
  isRequired,
  width,
}: {
  label: string;
  htmlName: string;
  defaultValue: string;
  options: SelectorOptionType[];
  description?: string;
  isRequired?: boolean;
  width?: string | number;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <Selector
      label={label}
      htmlName={htmlName}
      options={options}
      value={value}
      onChange={setValue}
      description={description}
      isRequired={isRequired}
      width={width}
    />
  );
}
