"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/Layout";
import { Copy, Check } from "geist-icons";

export function CopyButton({
  value,
  label,
  copiedLabel = "Copied",
  variant = "secondary",
}: {
  value: string;
  label: string;
  copiedLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      variant={variant}
      size="sm"
      label={copied ? copiedLabel : label}
      icon={copied ? <Check size={16} /> : <Copy size={16} />}
      onClick={copy}
    />
  );
}

export function CopyRow({
  value,
  label,
  copiedLabel,
}: {
  value: string;
  label: string;
  copiedLabel?: string;
}) {
  return (
    <HStack gap={2} align="center" width="100%">
      <code className="cmn-code-scroll min-w-0 flex-1 rounded-md bg-muted px-3 py-2 font-mono text-base">
        {value}
      </code>
      <CopyButton value={value} label={label} copiedLabel={copiedLabel} />
    </HStack>
  );
}
