import { HStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="9"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.35"
      />
      <circle cx="11" cy="11" r="3" fill="currentColor" />
      <circle cx="21" cy="11" r="3" fill="currentColor" opacity="0.55" />
      <circle cx="16" cy="21" r="3" fill="currentColor" opacity="0.8" />
      <path
        d="M13.5 13L14.5 18M18.5 13L17.5 18M14 11H18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" hasUnderline={false} aria-label="cmnAI home">
      <HStack gap={2} align="center">
        <BrandMark />
        <Text type="large" weight="bold">
          cmnAI
        </Text>
        {compact ? null : (
          <Text type="supporting" color="secondary">
            community inference
          </Text>
        )}
      </HStack>
    </Link>
  );
}
