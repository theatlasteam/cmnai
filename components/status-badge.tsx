import { Badge, type BadgeProps } from "@astryxdesign/core/Badge";
import type { Dictionary } from "@/lib/i18n";

const variants: Record<string, BadgeProps["variant"]> = {
  approved: "success",
  active: "success",
  pending: "warning",
  paused: "info",
  rejected: "error",
  offline: "neutral",
  verified: "success",
  failed: "error",
  suspended: "error",
};

export function StatusBadge({
  status,
  t,
}: {
  status: string;
  t: Dictionary;
}) {
  const label =
    (t.common.status as Record<string, string>)[status] ?? status;
  return <Badge variant={variants[status] ?? "neutral"} label={label} />;
}
